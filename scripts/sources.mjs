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
