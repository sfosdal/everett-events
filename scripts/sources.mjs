/**
 * Parsers for the Port of Everett's Revize CMS calendar. The calendar app
 * loads plain XML files from /calendar_app/db/ — an active-month index plus
 * one events file per month. Repeating events carry an explicit <dates>
 * list of occurrences (MM-DD-YYYY), which we expand to one event each.
 */

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// 'Aug 4, 2026' (or 'August 4, 2026') → '2026-08-04'; '' if unparseable
export function poeDate(s) {
  const m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),\s*(\d{4})/.exec(String(s).trim());
  if (!m) return '';
  const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
  return mo ? `${m[3]}-${mo}-${m[2].padStart(2, '0')}` : '';
}

// active-month index → ['202608', '202609', ...]
export function parsePoeMonths(xml) {
  return [...String(xml).matchAll(/<month>(\d{6})<\/month>/g)].map((m) => m[1]);
}

// one month's events file → [{title, date, time}], one entry per occurrence.
// Cancellations and the Port's "special event parking rates" notices (which
// shadow the real events) are dropped.
export function parsePoeEvents(xml) {
  const out = [];
  for (const ev of String(xml).match(/<event [\s\S]*?<\/event>/g) || []) {
    const grab = (re) => { const m = ev.match(re); return m ? m[1].trim() : ''; };
    const title = grab(/<name>\s*<!\[CDATA\[([\s\S]*?)\]\]/);
    if (!title || /^CANCEL/i.test(title) || /^Special Event Parking/i.test(title)) continue;
    const rawTime = grab(/<time_begin>([^<]*)<\/time_begin>/);
    const time = /^\d{1,2}:\d{2}$/.test(rawTime) ? `${rawTime.padStart(5, '0')}:00` : '';
    const dates = [];
    const rawDates = grab(/<dates>\s*([^<]*?)\s*<\/dates>/);
    if (rawDates) {
      for (const d of rawDates.split(',')) {
        const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d.trim());
        if (m) dates.push(`${m[3]}-${m[1]}-${m[2]}`);
      }
    } else {
      const iso = poeDate(grab(/<date_begin>([^<]*)<\/date_begin>/));
      if (iso) dates.push(iso);
    }
    for (const date of dates) out.push({ title, date, time });
  }
  return out;
}

/**
 * Squarespace calendar/event collections (Everett Music Initiative, Late
 * Shift Everett) answer `<page>?format=json` with the same data the page
 * renders: `upcoming` items carrying an epoch-ms startDate, an HTML-escaped
 * title, a site-relative fullUrl and a location.addressTitle venue.
 */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'", nbsp: ' ' };
function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, name) => {
    if (name in ENTITIES) return ENTITIES[name];
    if (/^#x/i.test(name)) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name[0] === '#') return String.fromCodePoint(parseInt(name.slice(1), 10));
    return m;
  });
}

export function parseSquarespaceEvents(data, { base, fallbackVenue = 'Everett' }) {
  const tz = data?.website?.timeZone || 'America/Los_Angeles';
  const fmtDate = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, dateStyle: 'short' });
  const fmtTime = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, timeStyle: 'medium' });
  const out = [];
  for (const it of data?.upcoming || []) {
    if (!Number.isFinite(it.startDate)) continue;
    const start = new Date(it.startDate);
    out.push({
      venue: (it.location?.addressTitle || '').trim() || fallbackVenue,
      title: decodeEntities(it.title || '').replace(/\s+/g, ' ').trim(),
      date: fmtDate.format(start),
      time: fmtTime.format(start),
      url: it.fullUrl ? new URL(it.fullUrl, base).href : base,
    });
  }
  return out;
}

// Church events are never listed (Steve, 2026-10-11: "keep church event 100%
// not listed"): a listing whose venue or title names a church, chapel,
// ministry, worship service, congregation, parish or cathedral is dropped at
// every source and from the archive, before venue folding (so it cannot hide
// in "Elsewhere in Everett"). Tested in sources.test.mjs.
const CHURCH_RE = /\b(?:church(?:es)?|chapel|ministr(?:y|ies)|worship|congregation|parish|cathedral|tabernacle|sermon|bible stud(?:y|ies)|new life center)\b/i;
export function isChurch(e) { return CHURCH_RE.test(e.venue || '') || CHURCH_RE.test(e.title || ''); }

// Secondary sources list shows the primary ones already carry under slightly
// different titles ("… & Lady A" vs "… + Lady A"), so exact-key de-dupe
// misses them. A candidate is dropped when an existing event sits at the
// same venue, date and clock time; untimed events never clash.
export function dropTimeClashes(candidates, existing) {
  const taken = new Set(existing.filter((e) => e.time).map((e) => `${e.venue}|${e.date}|${e.time}`));
  return candidates.filter((e) => !e.time || !taken.has(`${e.venue}|${e.date}|${e.time}`));
}

/**
 * NWAC (Northwest Athletic Conference) schedules — the Everett Community
 * College Trojans' home games. nwacsports.com runs on PrestoSports, whose
 * schedule pages answer `?print=ical` with the whole conference's season for
 * one sport (the teamId parameter is ignored), so the feed is filtered to
 * the one college here. A VEVENT carries DTSTART (UTC, or ;VALUE=DATE for a
 * day with no time yet), SUMMARY "(Women's Soccer) Northwest University at
 * Everett (6-0)" — the sport in parentheses, "A at B" with B the host or
 * "A vs. B" at a neutral site, a score once final — CATEGORIES the sport,
 * LOCATION the ground ("Everett Memorial Stadium\, 3900 Broadway\, Everett\,
 * WA"), URL the box score's site path. A game is a home game when the
 * LOCATION names Everett (an "Everett vs." friendly at Starfire is not).
 */
const PT_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Los_Angeles', dateStyle: 'short' });
const PT_TIME = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Los_Angeles', timeStyle: 'medium' });
function icsText(s) { return String(s || '').replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ').trim(); }
export function parseNwacIcal(ics, { team = 'Everett', name = 'Everett CC Trojans', venue = 'Everett Community College', sport = '', base = 'https://nwacsports.com' } = {}) {
  const text = String(ics).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); // unfold continuation lines
  const out = [];
  for (const ev of text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []) {
    const grab = (key) => { const m = ev.match(new RegExp(`^${key}(;[^:\\n]*)?:(.*)$`, 'm')); return m ? [m[2].trim(), m[1] || ''] : ['', '']; };
    const [summaryRaw] = grab('SUMMARY'), [location] = grab('LOCATION'), [categories] = grab('CATEGORIES'), [url] = grab('URL'), [dtstart, params] = grab('DTSTART');
    const summary = icsText(summaryRaw);
    const m = summary.match(/^(?:\(([^)]*)\)\s*)?(.*?)(?:\s*\(\d+-\d+\))?$/); // "(sport) A at B (score)"
    const kind = (m && m[1]) || icsText(categories) || sport;
    const matchup = (m && m[2]) || summary;
    const sides = matchup.split(/\s+(?:at|vs\.?)\s+/i);
    if (sides.length !== 2) continue;
    const away = /\s+at\s+/i.test(matchup) ? sides[0] : null;
    const hasTeam = new RegExp(`\\b${team}\\b`, 'i');
    if (!hasTeam.test(sides[0]) && !hasTeam.test(sides[1])) continue;
    const home = /everett/i.test(icsText(location)) || (!icsText(location) && away !== null && hasTeam.test(sides[1]));
    if (!home) continue;
    const opp = hasTeam.test(sides[0]) ? sides[1] : sides[0];
    let date = '', time = '';
    if (/VALUE=DATE/i.test(params)) { const d = dtstart.match(/^(\d{4})(\d{2})(\d{2})/); if (d) date = `${d[1]}-${d[2]}-${d[3]}`; }
    else { const d = dtstart.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/); if (d) { const t = new Date(Date.UTC(+d[1], d[2] - 1, +d[3], +d[4], +d[5], +d[6])); date = PT_DATE.format(t); time = PT_TIME.format(t); } }
    if (!date) continue;
    out.push({ venue, title: `${name} vs ${opp}${kind ? ` (${kind})` : ''}`, date, time, url: url ? new URL(icsText(url), base).href : base, type: 'sports' });
  }
  return out;
}
