#!/usr/bin/env node
/**
 * Aggregates upcoming events around Everett, WA into site/events.json and
 * site/events.ics. Runs in CI (see .github/workflows/events.yml) and locally
 * for preview.
 *
 * Each source returns [{ venue, title, date, time, url }]. Ticketmaster needs
 * a free Discovery API key in env TICKETMASTER_API_KEY (repo secret of the
 * same name); with no key it's skipped. The AquaSox schedule comes from MLB's
 * public stats API (no key).
 */
import { writeFileSync } from 'node:fs';
import { buildIcs } from './ics.mjs';
import { mergeWithArchive } from './merge.mjs';
import { slugify, BADGE_FEEDS, TEAMS } from './badges.mjs';

const JSON_OUT = new URL('../site/events.json', import.meta.url);
const ICS_OUT = new URL('../site/events.ics', import.meta.url);
// A full year each way: venues announce whole seasons ahead, and past events
// are kept for a year (carried forward from the previously published feed —
// see mergeWithArchive).
const WINDOW_DAYS = 365;
const FEED_URL = process.env.FEED_URL || 'https://fosdal.net/everett-events/events.json';
const MAX_EVENTS = 1200; // sanity cap, not a display cap

// The same venue appears under several spellings; fold to one name.
function canonicalVenue(name) {
  if (/angel of the winds/i.test(name)) return 'Angel of the Winds Arena';
  if (/funko field|everett memorial stadium/i.test(name)) return 'Funko Field';
  if (/apex everett/i.test(name)) return 'APEX Everett';
  return name.trim();
}

// --- Ticketmaster Discovery API: everything listed in Everett, WA ---
async function ticketmasterEverett() {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) { console.warn('No TICKETMASTER_API_KEY set — skipping Ticketmaster.'); return []; }
  const params = new URLSearchParams({
    apikey: key, city: 'Everett', stateCode: 'WA', sort: 'date,asc', size: '100',
  });
  const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
  if (!res.ok) { console.error(`Ticketmaster HTTP ${res.status}`); return []; }
  const data = await res.json();
  return (data?._embedded?.events || []).map((e) => {
    const ev = {
      venue: canonicalVenue(e._embedded?.venues?.[0]?.name || 'Everett'),
      title: e.name,
      date: e.dates?.start?.localDate || '',
      time: e.dates?.start?.localTime || '',
      url: e.url || '',
    };
    if (e.ageRestrictions?.legalAgeEnforced) ev.age21 = true;
    return ev;
  });
}

// --- Everett AquaSox home games: MLB stats API (sportId 13, teamId 403) ---
const LOCAL_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Los_Angeles', dateStyle: 'short' });
const LOCAL_TIME = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Los_Angeles', timeStyle: 'medium' });

async function aquaSoxHome() {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const end = new Date(today.getTime() + WINDOW_DAYS * 86400e3);
  const params = new URLSearchParams({
    sportId: '13', teamId: '403', startDate: fmt(today), endDate: fmt(end),
  });
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?${params}`);
  if (!res.ok) { console.error(`MLB stats API HTTP ${res.status}`); return []; }
  const data = await res.json();
  const events = [];
  for (const day of data.dates || []) {
    for (const g of day.games || []) {
      if (g.teams?.home?.team?.id !== 403) continue; // home games only
      if (/cancell?ed|postponed/i.test(g.status?.detailedState || '')) continue;
      const start = new Date(g.gameDate);
      events.push({
        venue: 'Funko Field',
        title: `Everett AquaSox vs. ${g.teams?.away?.team?.name || 'TBD'}`,
        date: LOCAL_DATE.format(start),
        time: LOCAL_TIME.format(start),
        url: 'https://www.milb.com/everett',
      });
    }
  }
  return events;
}

// AquaSox first: the stats API knows first-pitch times, Ticketmaster's
// listings of the same games often don't — first source wins the de-dupe.
const sources = [aquaSoxHome, ticketmasterEverett];

let all = [];
for (const src of sources) {
  try { all = all.concat(await src()); }
  catch (err) { console.error('Source failed:', err.message); }
}

// window, de-dupe, sort
const today = new Date().toISOString().slice(0, 10);
const horizon = new Date(Date.now() + WINDOW_DAYS * 86400e3).toISOString().slice(0, 10);
const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400e3).toISOString().slice(0, 10);
const seen = new Set();
const fresh = all
  .filter((e) => e.date && e.date >= cutoff && e.date <= horizon)
  .filter((e) => { const k = `${e.venue}|${e.title}|${e.date}`; if (seen.has(k)) return false; seen.add(k); return true; });

// carry past events forward from the previously published feed
let archived = [];
try {
  const r = await fetch(FEED_URL);
  if (r.ok) {
    const d = await r.json();
    archived = (Array.isArray(d) ? d : (d.events || [])).map((e) => ({ ...e, venue: canonicalVenue(e.venue) }));
  } else console.error(`Archive fetch HTTP ${r.status} — past events not carried this run`);
} catch (err) { console.error('Archive fetch failed:', err.message); }

const merged = mergeWithArchive(fresh, archived, today, cutoff).slice(-MAX_EVENTS);

writeFileSync(JSON_OUT, JSON.stringify({ generated: new Date().toISOString(), events: merged }, null, 2) + '\n');
writeFileSync(ICS_OUT, buildIcs(merged, new Date(), { calname: 'Everett Events' }));

// Filtered subscribe feeds: one per venue, one per badge, one "everything
// except this team" per local team.
const siteDir = new URL('../site/', import.meta.url);
let nFeeds = 0;
for (const venue of new Set(merged.map((e) => e.venue))) {
  writeFileSync(new URL(`events-venue-${slugify(venue)}.ics`, siteDir),
    buildIcs(merged.filter((e) => e.venue === venue), new Date(), { calname: `Everett Events — ${venue}` }));
  nFeeds++;
}
for (const [slug, [label, pred]] of Object.entries(BADGE_FEEDS)) {
  writeFileSync(new URL(`events-${slug}.ics`, siteDir),
    buildIcs(merged.filter(pred), new Date(), { calname: `Everett Events — ${label}` }));
  nFeeds++;
}
for (const t of TEAMS) {
  writeFileSync(new URL(`events-no-${t.slug}.ics`, siteDir),
    buildIcs(merged.filter((e) => !t.re.test(e.title || '')), new Date(), { calname: `Everett Events — no ${t.label}` }));
  nFeeds++;
}

const nPast = merged.filter((e) => e.date < today).length;
console.log(`Wrote ${merged.length} events (${nPast} past, ${merged.length - nPast} upcoming) + ${nFeeds} filtered feeds`);
