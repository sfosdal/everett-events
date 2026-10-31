#!/usr/bin/env node
/**
 * Aggregates upcoming events around Everett, WA into site/events.json and
 * site/events.ics. Runs in CI (see .github/workflows/events.yml) and locally
 * for preview. The pipeline is lqa-events' (scripts/*.mjs are its files,
 * byte for byte); only the sources below and site/city.js are Everett's.
 *
 * Each source returns [{ venue, title, date, time, url }]. Ticketmaster needs
 * a free Discovery API key in env TICKETMASTER_API_KEY (repo secret of the
 * same name); with no key it's skipped. The AquaSox schedule comes from MLB's
 * public stats API (scripts/schedules.mjs, via city.js `inject`), the
 * Silvertips' from the WHL's HockeyTech feed, the Wolfpack's from Arena
 * Football One's DigitalShift host. The Port of Everett, Everett Music
 * Initiative, Late Shift Everett and NWAC calendars need no key either.
 */
import './failures.mjs'; // first: every outside call retried, the ones still failing written to failures.json (Steve, 2026-10-29)
import { writeFileSync, readFileSync } from 'node:fs';
import { buildIcs } from './ics.mjs';
import { spawnSync } from 'node:child_process';
import { parsePoeMonths, parsePoeEvents, parseSquarespaceEvents, dropTimeClashes, parseNwacIcal, isChurch, parseCivicPlusRss, parseBiblioCommonsEvents, parseJsonLdEvents, parseMillCreekEvents, millCreekTime } from './sources.mjs';
import { mergeWithArchive, unionArchives, eventKey, dropClashes } from './merge.mjs';
import { fixLinks } from './links.mjs';
import { calmTitle, isNotice } from './titles.mjs';
import { applySchedules } from './schedules.mjs';
import { slugify, BADGE_FEEDS, TEAMS, CITY } from './badges.mjs';
import { feedSources, emptyListGate, feedFailedVenues } from './feeds.mjs';
import { tmFetch, tmFailed, keepFailedVenues } from './tm-fetch.mjs';
import { stampFestivals } from './festivals.mjs';

const JSON_OUT = new URL('../site/events.json', import.meta.url);
const ICS_OUT = new URL('../site/events.ics', import.meta.url);
// A full year each way: venues announce whole seasons ahead, and past events
// are kept for a year (carried forward from the previously published feed —
// see mergeWithArchive).
const WINDOW_DAYS = 365;
// The live feed is read from the site's own domain (everett.here.events since
// 2026-10-10) with the old fosdal.net address as a fallback (a build that reads
// neither copy of the archive refuses to publish — see mergeWithArchive).
const FEED_URL = process.env.FEED_URL || 'https://everett.here.events/events.json';
const FEED_URL_OLD = 'https://fosdal.net/everett-events/events.json';
// the second copy of the archive: every past event ever published, kept on
// the orphan `archive` branch by the workflow after each successful build
const ARCHIVE_URL = process.env.ARCHIVE_URL || 'https://raw.githubusercontent.com/sfosdal/everett-events/archive/events-archive.json';
const ARCHIVE_OUT = new URL('../events-archive.json', import.meta.url); // repo root, ignored; the workflow commits it to the branch
const MAX_EVENTS = 4000; // sanity cap, not a display cap

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Local runs: when the environment doesn't provide TICKETMASTER_API_KEY (CI
// passes it as a repo secret), pick it up from an untracked repo-root .env so
// the localhost preview gets the arena listings too.
if (!process.env.TICKETMASTER_API_KEY) {
  try {
    const m = readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .match(/^TICKETMASTER_API_KEY=(.+)$/m);
    if (m) process.env.TICKETMASTER_API_KEY = m[1].trim();
  } catch { /* no .env — Ticketmaster sources warn and skip */ }
}

// --- Ticketmaster Discovery API ---
// Ticketmaster's resale marketplace (source "tmr": an id starting "Z7r9j", a
// ticketmaster.com/event/ link) lists shows whose box office is elsewhere, a
// second listing beside the primary, titled differently so the duplicate
// guard can't fold them. A resale listing is kept only when no primary one
// shares its date, and it links to the box office the listing names or the
// venue's own page, never to the resale offer.
const isResale = (e) => /^Z7r9j/.test(e.id || '');
function tmEvent(e, venue, fallbackUrl) {
  const boxOffice = (e.outlets || []).find((o) => o.type === 'venueBoxOffice')?.url;
  const ev = {
    venue,
    title: e.name,
    date: e.dates?.start?.localDate || '',
    time: e.dates?.start?.localTime || '',
    url: isResale(e) ? (boxOffice || fallbackUrl) : (e.url || fallbackUrl),
  };
  if (e.ageRestrictions?.legalAgeEnforced) ev.age21 = true;
  const seg = e.classifications?.[0]?.segment?.name || '';
  const type = /sports/i.test(seg) ? 'sports' : /music/i.test(seg) ? 'concert' : /arts|theat/i.test(seg) ? 'arts' : /film/i.test(seg) ? 'movie' : null;
  if (type) ev.type = type;
  if (e.dates?.start?.dateTBD || e.dates?.start?.dateTBA) ev.dateTbd = true; // a placeholder date the promoter may still move
  // a cancelled or postponed show stays in Ticketmaster's listing for a
  // while, marked in dates.status — pass that on rather than list it as if
  // it were still happening (the merge step drops it once it vanishes)
  const code = e.dates?.status?.code;
  if (code === 'cancelled' || code === 'postponed') ev.status = code;
  return ev;
}
function keepPrimary(rows) {
  const primaryDates = new Set(rows.filter((e) => !isResale(e)).map((e) => e.dates?.start?.localDate));
  return rows.filter((e) => !isResale(e) || !primaryDates.has(e.dates?.start?.localDate));
}
async function tmPages(params, label) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) { console.warn('No TICKETMASTER_API_KEY set — skipping Ticketmaster.'); return []; }
  const all = [];
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ apikey: key, sort: 'date,asc', size: '200', page: String(page), ...params });
    const res = await tmFetch(`https://app.ticketmaster.com/discovery/v2/events.json?${q}`);
    if (!res.ok) throw tmFailed(label, res); // every retry spent (tm-fetch.mjs): the venue keeps its previous rows, not an empty or half list
    const data = await res.json();
    all.push(...(data?._embedded?.events || []));
    if (page + 1 >= (data?.page?.totalPages || 1)) break;
  }
  console.log(`Ticketmaster ${label}: ${all.length} events`);
  return all;
}
// by venue id (every page), for the rooms city.js names
async function ticketmasterVenue({ venueId, venueMatch, label, fallbackUrl, exclude }) {
  const rows = (await tmPages({ venueId }, label))
    .filter((e) => (e._embedded?.venues?.[0]?.name || '').toLowerCase().includes(venueMatch))
    .filter((e) => !exclude || !exclude.test(e.name || ''));
  return keepPrimary(rows).map((e) => tmEvent(e, label, fallbackUrl));
}
// everything else on sale in Everett (Funko Field's AquaSox dates, whatever
// books next), the named rooms left to their own fetch; church bookings go
// at the drop below
const TM_ROOM_IDS = new Set(Object.values(CITY.venues).filter((v) => v.tm).map((v) => v.tm.id));
async function ticketmasterEverett() {
  const rows = (await tmPages({ city: 'Everett', stateCode: 'WA' }, 'Everett sweep'))
    .filter((e) => !TM_ROOM_IDS.has(e._embedded?.venues?.[0]?.id))
    .filter((e) => !/parking/i.test(e.name || ''));
  return keepPrimary(rows).map((e) => tmEvent(e, (e._embedded?.venues?.[0]?.name || 'Everett').trim(), e.url || 'https://www.ticketmaster.com/'));
}

// --- Port of Everett waterfront: the Revize CMS calendar publishes plain
//     XML data files (month index + one events file per month) under
//     /calendar_app/db/ — Jetty Island Days, Music at the Marina, Sail-In
//     Cinema, and the rest of the waterfront season. ---
const POE_DB = 'https://www.portofeverett.com/calendar_app/db/';
async function portOfEverett() {
  const idx = await fetch(`${POE_DB}calendar_1_activemonth_list.xml`, { headers: { 'user-agent': BROWSER_UA } });
  if (!idx.ok) { console.error(`Port of Everett month index HTTP ${idx.status}`); return []; }
  const nowYm = new Date().toISOString().slice(0, 7).replace('-', '');
  const horizonYm = new Date(Date.now() + WINDOW_DAYS * 86400e3).toISOString().slice(0, 7).replace('-', '');
  const months = parsePoeMonths(await idx.text()).filter((m) => m >= nowYm && m <= horizonYm);
  const events = [];
  for (const ym of months) {
    try {
      const r = await fetch(`${POE_DB}calendar_1_activemonthsdata_${ym.slice(0, 4)}-${ym.slice(4)}.xml`, { headers: { 'user-agent': BROWSER_UA } });
      if (!r.ok) { console.error(`Port of Everett ${ym} HTTP ${r.status}`); continue; }
      for (const e of parsePoeEvents(await r.text())) {
        events.push({ venue: 'Port of Everett', ...e, url: 'https://www.portofeverett.com/calendar.php' });
      }
    } catch (err) {
      console.error(`Port of Everett ${ym} failed:`, err.message);
    }
  }
  console.log(`Port of Everett: ${events.length} occurrences from ${months.length} months`);
  return events;
}

// --- Everett CC Trojans: the NWAC's PrestoSports schedule, one iCal per
//     sport for the academic year (the whole conference; sources.mjs keeps
//     the Trojans' home games). Baseball and softball publish later in the
//     year — a 404 is a sport not yet listed, not a failure. ---
const NWAC_SPORTS = { mbkb: "Men's Basketball", wbkb: "Women's Basketball", msoc: "Men's Soccer", wsoc: "Women's Soccer", wvball: "Women's Volleyball", bsb: 'Baseball', sball: 'Softball' };
function academicYear(d = new Date()) { const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String(y + 1).slice(2)}`; }
async function nwacTrojans() {
  const year = academicYear(), out = [];
  let listed = 0;
  for (const [code, sport] of Object.entries(NWAC_SPORTS)) {
    const url = `https://nwacsports.com/sports/${code}/${year}/schedule?print=ical`;
    try {
      const r = await fetch(url, { headers: { 'user-agent': BROWSER_UA } });
      if (r.status === 404) continue;
      if (!r.ok) { console.error(`NWAC ${sport} HTTP ${r.status}`); continue; }
      const evs = parseNwacIcal(await r.text(), { sport });
      listed++;
      out.push(...evs);
    } catch (err) { console.error(`NWAC ${sport} failed:`, err.message); }
  }
  console.log(`NWAC Trojans: ${out.length} home games across ${listed} sports (${year})`);
  return out;
}

// --- Squarespace calendars: Everett Music Initiative (the nonprofit behind
//     Music at the Marina, Kings Hall shows, the El Sid open mic) and Late
//     Shift Everett (the downtown nightlife coalition: El Sid's weekly
//     nights, Lucky Dime, Village Theatre runs). Their DICE / Eventbrite /
//     free shows never reach Ticketmaster; `?format=json` exposes the
//     rendered listing. ---
function squarespace(label, base, path, venue) {
  return async function () {
    const res = await fetch(`${base}${path}?format=json`, { headers: { 'user-agent': BROWSER_UA } });
    if (!res.ok) { console.error(`${label} HTTP ${res.status}`); return []; }
    const events = parseSquarespaceEvents(await res.json(), { base, fallbackVenue: 'Everett', venue });
    console.log(`${label}: ${events.length} upcoming`);
    return events;
  };
}
const everettMusicInitiative = squarespace('Everett Music Initiative', 'https://www.everettmusicinitiative.com', '/shows');
const lateShiftEverett = squarespace('Late Shift Everett', 'https://www.lateshifteverett.com', '/eventscalendar');
// the rooms with a Squarespace calendar of their own (Steve, 2026-10-11:
// "do everything under 20m" — the round that added the libraries, the
// cities, the Schack, the Scuttlebutt, Tulalip and Edmonds)
const schackArtCenter = squarespace('Schack Art Center', 'https://www.schack.org', '/classes-workshops-events', 'Schack Art Center');
const scuttlebuttBrewing = squarespace('Scuttlebutt Brewing', 'https://www.scuttlebuttbrewing.com', '/events', 'Scuttlebutt Brewing');

// --- A page behind a bot wall (the City of Everett's CivicPlus site,
//     Songkick) is fetched through scripts/cffi-fetch.py, which asks as
//     Chrome would; a plain fetch is the last resort. ---
const CFFI = new URL('./cffi-fetch.py', import.meta.url).pathname;
async function fetchText(url, label, { walled = false } = {}) {
  if (walled) {
    for (const [cmd, args] of [['uv', ['run', '--quiet', CFFI, url]], ['python3', [CFFI, url]]]) {
      const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64e6 });
      if (r.status === 0 && r.stdout) return r.stdout;
    }
  }
  const res = await fetch(url, { headers: { 'user-agent': BROWSER_UA } });
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.text();
}

// --- CivicPlus calendars: the cities and the Everett Public Library.
//     `reroute` moves an entry to another row (the City's calendar repeats
//     the library's programs, which de-dupe once they share the row). ---
function civicPlus(label, host, venue, { walled = false, reroute } = {}) {
  return async function () {
    const xml = await fetchText(`https://${host}/RSSFeed.aspx?ModID=58&CID=All-calendar.xml`, label, { walled });
    let events = parseCivicPlusRss(xml, { venue });
    if (reroute) events = events.map(reroute);
    console.log(`${label}: ${events.length} events`);
    return events;
  };
}
const toLibrary = (e) => (/\b(?:Main Library|Evergreen Branch)\b/.test(e.title) ? { ...e, venue: 'Everett Public Library' } : e);
const everettPublicLibrary = civicPlus('Everett Public Library', 'epls.org', 'Everett Public Library');
const cityOfEverett = civicPlus('City of Everett', 'www.everettwa.gov', 'City of Everett', { walled: true, reroute: toLibrary });
const cityOfMarysville = civicPlus('City of Marysville', 'www.marysvillewa.gov', 'City of Marysville');
const cityOfMukilteo = civicPlus('City of Mukilteo', 'www.mukilteowa.gov', 'City of Mukilteo');
const cityOfSnohomish = civicPlus('City of Snohomish', 'www.snohomishwa.gov', 'City of Snohomish');

// --- Sno-Isle Libraries: every page of the BiblioCommons gateway (the
//     API ignores its location and date filters), kept to the branches a
//     short drive away. ---
const SNO_ISLE_BRANCHES = { 23: 'Mukilteo', 29: 'Mariner', 20: 'Mill Creek', 25: 'Snohomish', 16: 'Lake Stevens', 19: 'Marysville', 18: 'Lynnwood', 13: 'Edmonds' };
async function snoIsleLibraries() {
  const out = [];
  let pages = 1;
  for (let page = 1; page <= pages && page <= 40; page++) {
    const r = await fetch(`https://gateway.bibliocommons.com/v2/libraries/sno-isle/events?limit=100&page=${page}`, { headers: { 'user-agent': BROWSER_UA } });
    if (!r.ok) { console.error(`Sno-Isle page ${page} HTTP ${r.status}`); break; }
    const data = await r.json();
    out.push(...parseBiblioCommonsEvents(data, { venue: 'Sno-Isle Libraries', branches: SNO_ISLE_BRANCHES }));
    pages = data?.events?.pagination?.pages || 1;
  }
  console.log(`Sno-Isle Libraries: ${out.length} events at ${Object.keys(SNO_ISLE_BRANCHES).length} branches (${pages} pages)`);
  return out;
}

// A page of schema.org markup lists what has happened as readily as what is
// coming (Songkick's venue page keeps the spring's shows); a week's grace
// keeps last night, nothing older.
const RECENT = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10);
const notStale = (events) => events.filter((e) => e.date >= RECENT);

// --- Historic Downtown Snohomish: the Wix calendar names its events; each
//     event page carries schema.org Event markup with the date and time. ---
async function historicDowntownSnohomish() {
  const base = 'https://www.historicdowntownsnohomish.org';
  const cal = await fetchText(`${base}/calendar`, 'Historic Downtown Snohomish');
  const slugs = [...new Set([...cal.matchAll(/event-details\/([a-z0-9-]+)/g)].map((m) => m[1]))];
  const out = [];
  for (const slug of slugs) {
    try { out.push(...parseJsonLdEvents(await fetchText(`${base}/event-details/${slug}`, slug), { venue: 'Historic Downtown Snohomish' })); }
    catch (err) { console.error(`Historic Downtown Snohomish ${slug}:`, err.message); }
  }
  console.log(`Historic Downtown Snohomish: ${out.length} events from ${slugs.length} pages`);
  return notStale(out);
}

// --- City of Mill Creek: the Drupal list, then each event's page for its time. ---
async function cityOfMillCreek() {
  const base = 'https://millcreekwa.gov';
  const events = parseMillCreekEvents(await fetchText(`${base}/events`, 'City of Mill Creek'), { venue: 'City of Mill Creek', base });
  for (const e of events) {
    try { e.time = millCreekTime(await fetchText(e.url, e.title)); } catch (err) { console.error(`Mill Creek ${e.title}:`, err.message); }
  }
  console.log(`City of Mill Creek: ${events.length} events`);
  return events;
}

// --- Historic Everett Theatre: its own site is down (expired certificate,
//     "Site Currently Unavailable", 2026-10-11), so Songkick's venue page
//     stands in — schema.org Event markup, behind a bot wall. ---
async function historicEverettTheatre() {
  const html = await fetchText('https://www.songkick.com/venues/823286-historic-everett-theatre', 'Historic Everett Theatre', { walled: true });
  const events = notStale(parseJsonLdEvents(html, { venue: 'Historic Everett Theatre', at: /historic everett/i, titleStrip: /\s*@\s*Historic Everett Theatre\s*$/i }));
  console.log(`Historic Everett Theatre (Songkick): ${events.length} upcoming`);
  return events;
}

// Every venue is read from Ticketmaster AND its own events site (Steve, 2026-10-26). One of the
// two leads — the box office with the richer rows — and the other is SECONDARY (city.js
// `tm.secondary` / `feed.secondary`): read after everything else and kept only where nothing
// already sits at that venue on that date with the same clock or title (merge.mjs dropClashes).
const tmVenue = ([label, v]) => () => ticketmasterVenue({ venueId: v.tm.id, venueMatch: v.tm.match, label, fallbackUrl: v.tm.fallbackUrl, exclude: v.tm.exclude });
const ticketmasterRooms = Object.entries(CITY.venues).filter(([, v]) => v.tm && !v.tm.secondary).map(tmVenue);
const ticketmasterSecond = Object.entries(CITY.venues).filter(([, v]) => v.tm && v.tm.secondary).map(tmVenue);
const splitVenues = (keep) => Object.fromEntries(Object.entries(CITY.venues).filter(([, v]) => keep(v)));
const feedsFirst = feedSources({ ...CITY, venues: splitVenues((v) => !v.feed?.secondary), feeds: [] }, BROWSER_UA); // venues whose own calendar leads (city.js `feed`)
const feedsSecond = feedSources({ ...CITY, venues: splitVenues((v) => v.feed?.secondary) }, BROWSER_UA); // venues whose own calendar fills in behind Ticketmaster + the city-wide `feeds`, which this city keeps behind its calendars
const sources = [
  ...ticketmasterRooms,
  ...feedsFirst, // venues whose own calendar leads (city.js `feed`)
  ticketmasterEverett,
  portOfEverett,
  nwacTrojans,
  everettPublicLibrary, cityOfEverett, cityOfMarysville, cityOfMukilteo, cityOfSnohomish, // the library first, so the City's repeats of its programs de-dupe onto it
  snoIsleLibraries, historicDowntownSnohomish, cityOfMillCreek, schackArtCenter, historicEverettTheatre,
];
// Secondary sources re-list shows the primaries carry under other titles;
// anything at an already-taken venue/date/time is dropped.
const secondary = [everettMusicInitiative, lateShiftEverett, scuttlebuttBrewing,
  ...ticketmasterSecond, ...feedsSecond]; // city.js `feeds` (Stranger Tickets) ride behind the calendars, so a show Late Shift already lists stays theirs

// Venue names as city.js spells them: a venue listed under other spellings
// (`alias` — "Everett Memorial Stadium" is Funko Field, "Kings Hall" is at
// APEX) folds to its one name; a venue city.js doesn't list folds into the
// one "Elsewhere in Everett" row (Steve, 2026-10-10: "keep as one row").
const CANONICAL_VENUES = new Set(Object.keys(CITY.venues));
const ALIASES = Object.entries(CITY.venues).filter(([, v]) => v.alias).map(([label, v]) => [label, v.alias]);
const aliasHit = (s) => { const hit = ALIASES.find(([, re]) => re.test(s || '')); return hit ? hit[0] : null; };
const aliasVenue = (name) => aliasHit(name) || name;
// A listing whose venue field is just the city (Late Shift's "X live at The
// Village Theatre") names its room at the end of the title.
const roomInTitle = (title) => { const m = /\b(?:at|@)\s+(.+)$/i.exec(title || ''); return m ? aliasHit(m[1]) : null; };
const normalizeVenue = (e) => {
  const byName = aliasVenue(e.venue);
  const venue = CANONICAL_VENUES.has(byName) ? byName : (roomInTitle(e.title) || byName);
  if (CITY.groundsVenue && !CANONICAL_VENUES.has(venue)) return { ...e, venue: CITY.groundsVenue };
  return venue === e.venue ? e : { ...e, venue };
};

// Church events never make the listing (Steve, 2026-10-11), judged on the
// source's own venue name and title before anything folds into the
// Elsewhere row; the count is logged so a new church booking is visible.
let churchDropped = 0;
const noChurch = (rows) => rows.filter((e) => { if (isChurch(e)) { churchDropped++; return false; } return true; });

let all = [];
for (const src of sources) {
  try { all = all.concat(noChurch(await src()).map(normalizeVenue)); }
  catch (err) { console.error('Source failed:', err.message); }
}
for (const src of secondary) {
  try {
    const rows = noChurch(await src()).map(normalizeVenue).map((r) => ({ ...r, type: r.type || CITY.venues[r.venue]?.type || r.type })); // a typeless Ticketmaster row takes its venue's type
    const kept = dropClashes(rows, all); // nothing already at that venue on that date with the same clock or title (merge.mjs)
    if (rows.length) console.log(`  secondary ${rows[0].venue}: ${kept.length} of ${rows.length} rows new`);
    all = all.concat(kept);
  }
  catch (err) { console.error('Source failed:', err.message); }
}
if (churchDropped) console.log(`Church events dropped: ${churchDropped}`);

// window, de-dupe, sort
const today = new Date().toISOString().slice(0, 10);
const horizon = new Date(Date.now() + WINDOW_DAYS * 86400e3).toISOString().slice(0, 10);
const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400e3).toISOString().slice(0, 10);
const seen = new Set();
const fresh = all
  .filter((e) => e.date && e.date >= cutoff && e.date <= horizon)
  .filter((e) => !isNotice(e.title)) // a closure or construction notice is information, not an event
  .map((e) => ({ ...e, title: calmTitle(e.title) })) // shouted titles come down to Title Case
  .filter((e) => { const k = eventKey(e); if (seen.has(k)) return false; seen.add(k); return true; }); // venue|title|date|clock (merge.mjs): a second showing on one day is kept
// the empty-list gate (feeds.mjs): nothing upcoming in this build's own pull means a venue was
// missed in scouting or every source is down — not a fact about the town. ALLOW_EMPTY_LIST=1 overrides.
if (!emptyListGate(fresh, today, sources.length + secondary.length)) process.exit(1);

// carry past events forward. Two copies of the archive: the live feed and
// the `archive` branch's file (every past event ever published; the workflow
// rewrites it after each build). Each is fetched with three tries; the build
// goes on with the union of whatever it got and stops only when it got
// neither. Since the union can only grow, a publish that lost history can no
// longer shrink the record.
const cleanArchive = (d) => (Array.isArray(d) ? d : (d.events || []))
  .filter((e) => !isChurch(e)) // past church events (New Life Church had a row until 2026-10-11) leave the record too
  .map(normalizeVenue) // past events published under the old spellings ("The Village Theater", "Everett") fold onto the one name
  .filter((e) => !isNotice(e.title)).map((e) => ({ ...e, title: calmTitle(e.title) })); // the same title hygiene as fresh events, so the merge keys agree
async function fetchArchive(url, what) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return cleanArchive(await r.json());
    } catch (err) {
      console.error(`${what} fetch (try ${attempt} of 3) failed: ${err.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 20000));
    }
  }
  return null;
}
const [liveArchive, branchArchive] = await Promise.all([
  fetchArchive(FEED_URL, 'Live feed').then((a) => (a !== null || process.env.FEED_URL ? a : fetchArchive(FEED_URL_OLD, 'Live feed (old address)'))),
  fetchArchive(ARCHIVE_URL, 'Archive branch'),
]);
if (liveArchive === null && branchArchive === null && !process.env.ALLOW_NO_ARCHIVE) {
  console.error('No archive from either copy — not publishing (ALLOW_NO_ARCHIVE=1 to override for a first build)');
  process.exit(1);
}
if (liveArchive === null) console.error('Live feed unreadable — building on the archive branch copy');
if (branchArchive === null) console.error('Archive branch unreadable — building on the live feed alone');
const archived = unionArchives(liveArchive || [], branchArchive || []);
console.log(`Archive: ${(liveArchive || []).length} events in the live feed, ${(branchArchive || []).length} on the archive branch, ${archived.length} in the union`);

// venues whose read failed keep their upcoming rows: Ticketmaster's (tm-fetch.mjs), then a leading own calendar's (feeds.mjs)
const keptFailed = (archived, fresh, today) => { const tm = keepFailedVenues(archived, fresh, today); return tm.concat(keepFailedVenues(archived, fresh.concat(tm), today, feedFailedVenues, console.error, 'Own calendar')); };
const merged = mergeWithArchive(fresh.concat(keptFailed(archived, fresh, today)), archived, today, cutoff).slice(-MAX_EVENTS);
await stampFestivals(merged, { city: CITY.key }); // the festivals Steve approved from the weekly list (scripts/festivals.mjs)

// League schedules flag floating dates Ticketmaster doesn't know yet, and
// the full seasons (home and away) feed the site's Teams view
let seasons = {}, form = {};
try { ({ teams: seasons, form } = await applySchedules(merged)); } catch (err) { console.error('Schedules step failed:', err.message); }
// The clubs whose home games have no ticket feed here (city.js `inject`: the
// AquaSox at Funko Field) enter the listing from the league's schedule —
// typed sports, the club's ticket page as the link — unless the feed already
// has that day at that ground
// (city.js teams, not badges' TEAMS, which carries only slug/label/re — the
// loop was a no-op until 2026-10-11; the game takes the club's own ground name)
for (const t of CITY.teams.filter((x) => x.inject)) {
  for (const g of (seasons[t.slug] || []).filter((x) => x.home && x.date >= cutoff)) {
    const ground = t.inject.venue || t.venue || g.venue;
    const listed = merged.find((e) => e.date === g.date && (e.venue === ground || e.venue === g.venue));
    if (listed) { if (!listed.time && g.time && !g.tbd) listed.time = g.time; continue; } // the feed's listing stands; the league's first pitch fills a time it lacks
    merged.push({ venue: ground, title: `${t.inject.name || t.name || t.label} vs ${g.opp.name}`, date: g.date, time: g.time, url: t.inject.url, type: 'sports', ...(g.tbd ? { dateTbd: true } : {}), ...(g.watch ? { watch: g.watch } : {}) });
  }
}
// Ticket availability for the Ticketmaster venues, from a local checker
// (scripts/data/soldout.json — empty until one runs for Everett): counts and
// lowest price, and soldOut when the box office has nothing left.
try {
  const so = JSON.parse(readFileSync(new URL('./data/soldout.json', import.meta.url), 'utf8'));
  let n = 0, s = 0;
  for (const e of merged) {
    const m = (e.url || '').match(/\/event\/([0-9A-F]{16})/i); // Ticketmaster's 16-hex id
    const r = m && (so.events || {})[m[1].toUpperCase()];
    if (!r || !/^(available|soldout)$/.test(r.status)) continue;
    const out = r.status === 'soldout';
    e.tickets = { box: out ? 0 : (r.primary == null ? null : r.primary), resale: r.resale || 0, checked: r.checked };
    const from = out ? r.fromResale : r.fromPrimary;
    if (from != null) e.tickets.from = from;
    if (out) { e.soldOut = true; s++; }
    n++;
  }
  if (n) console.log(`soldout: ${n} events with ticket counts (checked ${so.generated}), ${s} sold out`);
} catch (err) { console.error('soldout.json:', err.message); }
merged.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
if (Object.keys(seasons).length) {
  const postseason = JSON.parse(readFileSync(new URL('./data/postseason.json', import.meta.url), 'utf8')); // each league's playoff rounds (hand-kept), shown until the real games land
  delete postseason._;
  writeFileSync(new URL('../site/teams.json', import.meta.url), JSON.stringify({ generated: new Date().toISOString(), teams: seasons, form, postseason }, null, 1) + '\n');
} else {
  console.error('teams.json: no season fetched this run, the last one stands');
}

await fixLinks(merged, { venues: CITY.venues, today }); // ticket links that reach a real page: no scheme-less or wrapped links, a 404 goes to the venue's page (scripts/links.mjs)
writeFileSync(JSON_OUT, JSON.stringify({ generated: new Date().toISOString(), events: merged }, null, 2) + '\n');
// the archive record: this build's past events on top of everything already
// recorded, never pruned (the feed keeps a year; the branch keeps it all)
const record = unionArchives(merged.filter((e) => e.date < today), archived.filter((e) => e.date < today));
writeFileSync(ARCHIVE_OUT, JSON.stringify({ events: record }, null, 1) + '\n'); // no timestamp: the branch commits only when the events change
console.log(`Archive record: ${record.length} past events`);
writeFileSync(ICS_OUT, buildIcs(merged));

// Filtered subscribe feeds, one per venue and one per badge, so the site's
// filter chips can offer a matching calendar subscription.
const siteDir = new URL('../site/', import.meta.url);
let nFeeds = 0;
for (const venue of new Set(merged.map((e) => e.venue))) {
  const evs = merged.filter((e) => e.venue === venue);
  writeFileSync(new URL(`events-venue-${slugify(venue)}.ics`, siteDir),
    buildIcs(evs, new Date(), { calname: `${CITY.ics.short} — ${venue}` }));
  nFeeds++;
}
for (const [slug, [label, pred]] of Object.entries(BADGE_FEEDS)) {
  writeFileSync(new URL(`events-${slug}.ics`, siteDir),
    buildIcs(merged.filter(pred), new Date(), { calname: `${CITY.ics.short} — ${label}` }));
  nFeeds++;
}
// Exclusion feeds, one per local team: everything except that team's games.
for (const t of TEAMS) {
  writeFileSync(new URL(`events-no-${t.slug}.ics`, siteDir),
    buildIcs(merged.filter((e) => !t.re.test(e.title || '')), new Date(), { calname: `${CITY.ics.short} — no ${t.label}` }));
  nFeeds++;
}
// Season feeds for the Teams view: each club's whole season, home and away
// (team-<slug>.ics), and every club's in one (teams.ics). Each game links to
// the club's page on the site.
const seasonEvents = (slug, label, games) => games.map((g) => ({
  title: `${label} ${g.home ? 'vs' : 'at'} ${g.opp.name}${g.pre ? ' (preseason)' : g.playoff ? ' (playoff)' : ''}`,
  venue: g.venue || (g.home ? '' : g.opp.name), date: g.date, time: g.tbd ? null : g.time, ...(g.tbd ? { dateTbd: true } : {}),
  url: `${CITY.site}?team=${slug}`,
}));
const allSeasons = [];
for (const t of TEAMS) {
  if (!seasons[t.slug]) continue;
  const evs = seasonEvents(t.slug, t.label, seasons[t.slug]);
  allSeasons.push(...evs);
  writeFileSync(new URL(`team-${t.slug}.ics`, siteDir), buildIcs(evs, new Date(), { calname: `${t.label} season` }));
  nFeeds++;
}
writeFileSync(new URL('teams.ics', siteDir), buildIcs(allSeasons, new Date(), { calname: CITY.ics.teams }));
nFeeds++;

const nPast = merged.filter((e) => e.date < today).length;
console.log(`Wrote ${merged.length} events (${nPast} past, ${merged.length - nPast} upcoming) + ${nFeeds} filtered feeds`);
