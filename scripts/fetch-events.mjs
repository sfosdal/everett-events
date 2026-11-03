#!/usr/bin/env node
/**
 * Aggregates upcoming events around Everett, WA into site/events.json and
 * site/events.ics. Runs in CI (see .github/workflows/events.yml) and locally
 * for preview. The pipeline is lqa-events' (scripts/*.mjs are its files,
 * byte for byte; the build itself is scripts/build.mjs); only the readers below and site/city.js are Everett's.
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
import { spawnSync } from 'node:child_process';
import { parsePoeMonths, parsePoeEvents, parseSquarespaceEvents, parseNwacIcal, parseCivicPlusRss, parseBiblioCommonsEvents, parseJsonLdEvents, parseMillCreekEvents, millCreekTime } from './sources.mjs';
import { CITY } from './badges.mjs';
import { build, tmPages, tmEvent, keepPrimary, BROWSER_UA, WINDOW_DAYS } from './build.mjs';

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

await build({
  feedUrl: 'https://everett.here.events/events.json',
  archiveUrl: 'https://raw.githubusercontent.com/sfosdal/everett-events/archive/events-archive.json',
  feedUrlOld: 'https://fosdal.net/everett-events/events.json',
  cityFeedsSecond: true,
  primary: (s) => [
    ...s.tmFirst,
    ...s.feedsFirst, // venues whose own calendar leads (city.js `feed`)
    ticketmasterEverett,
    portOfEverett,
    nwacTrojans,
    everettPublicLibrary, cityOfEverett, cityOfMarysville, cityOfMukilteo, cityOfSnohomish, // the library first, so the City's repeats of its programs de-dupe onto it
    snoIsleLibraries, historicDowntownSnohomish, cityOfMillCreek, schackArtCenter, historicEverettTheatre,
  ],
  // secondary sources re-list shows the primaries carry under other titles; city.js `feeds` (Stranger Tickets) ride
  // behind the calendars, so a show Late Shift already lists stays theirs
  secondary: (s) => [everettMusicInitiative, lateShiftEverett, scuttlebuttBrewing, ...s.tmSecond, ...s.feedsSecond],
});
