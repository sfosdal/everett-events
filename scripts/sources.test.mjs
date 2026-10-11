import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poeDate, parsePoeMonths, parsePoeEvents, parseNwacIcal, isChurch } from './sources.mjs';

test('isChurch drops church events by venue or title and nothing else', () => {
  assert.ok(isChurch({ venue: 'New Life Church', title: 'Steven Curtis Chapman: Speechless 25th Anniversary Tour' }));
  assert.ok(isChurch({ venue: 'New Life Center', title: 'Christmas Concert' }));
  assert.ok(isChurch({ venue: 'Everett', title: 'Worship Night with Phil Wickham' }));
  assert.ok(isChurch({ venue: 'Angel of the Winds Arena', title: 'Harvest Ministries Crusade' }));
  assert.ok(isChurch({ venue: 'Our Lady of Perpetual Help Parish', title: 'Spaghetti Dinner' }));
  assert.ok(!isChurch({ venue: 'Angel of the Winds Arena', title: 'Everett Silvertips vs Spokane Chiefs' }));
  assert.ok(!isChurch({ venue: 'Village Theatre', title: 'Ragtime The Musical' }));
  assert.ok(!isChurch({ venue: 'El Sid', title: 'Gospel Brunch' })); // a bar's brunch is a bar event
  assert.ok(!isChurch({ venue: 'Funko Field', title: 'Faith & Family Night' })); // a ballpark promotion stays
  assert.ok(isChurch({ venue: 'APEX Everett', title: 'Church of Misery' })); // a band with "church" in its name goes too: the rule errs toward dropping ("100% not listed")
});

test('poeDate parses the Port calendar date style', () => {
  assert.equal(poeDate('Aug 4, 2026'), '2026-08-04');
  assert.equal(poeDate('August 22, 2026'), '2026-08-22');
  assert.equal(poeDate('Dec 31, 2026'), '2026-12-31');
  assert.equal(poeDate('not a date'), '');
});

test('parsePoeMonths reads the active-month index', () => {
  assert.deepEqual(
    parsePoeMonths('<months><month>202608</month><month>202609</month></months>'),
    ['202608', '202609'],
  );
});

const SAMPLE = `
<events format="3.2">
  <event id="1" calendarid="1">
    <name><![CDATA[Music at the Marina]]></name>
    <date_begin>Jul 2, 2026</date_begin>
    <time_begin>18:00</time_begin>
    <repeat>weekly</repeat>
    <dates>08-06-2026,08-13-2026</dates>
  </event>
  <event id="2" calendarid="1">
    <name><![CDATA[Wheels on the Waterfront Car Show]]></name>
    <date_begin>Aug 22, 2026</date_begin>
    <time_begin></time_begin>
    <repeat />
    <dates />
  </event>
  <event id="3" calendarid="1">
    <name><![CDATA[CANCELED: Commission Meeting]]></name>
    <date_begin>Aug 20, 2026</date_begin>
    <time_begin>12:00</time_begin>
    <dates />
  </event>
  <event id="4" calendarid="1">
    <name><![CDATA[Special Event Parking Rates in Effect: Music at the Marina]]></name>
    <date_begin>Aug 6, 2026</date_begin>
    <time_begin></time_begin>
    <dates />
  </event>
</events>`;

test('parsePoeEvents expands repeats and drops noise', () => {
  const evs = parsePoeEvents(SAMPLE);
  assert.deepEqual(evs, [
    { title: 'Music at the Marina', date: '2026-08-06', time: '18:00:00' },
    { title: 'Music at the Marina', date: '2026-08-13', time: '18:00:00' },
    { title: 'Wheels on the Waterfront Car Show', date: '2026-08-22', time: '' },
  ]);
});

import { parseSquarespaceEvents, dropTimeClashes } from './sources.mjs';

// Trimmed from lateshifteverett.com/eventscalendar?format=json — startDate is
// epoch ms; the site's time zone is America/Los_Angeles.
const SQ_SAMPLE = {
  website: { timeZone: 'America/Los_Angeles' },
  upcoming: [
    {
      title: 'Leroy Bell &amp; His Only Friends + Lady A',
      startDate: 1789178400694, // 2026-09-11 19:00 PDT
      fullUrl: '/shows/2026/9/11/leroy-bell',
      location: { addressTitle: 'Kings Hall at APEX Everett' },
    },
    {
      title: 'And Then There Were None',
      startDate: 1798929000337, // 2027-01-02 14:30 PST
      fullUrl: '/eventscalendar/and-then',
      location: {},
    },
    { title: 'No date, skipped', fullUrl: '/x', location: { addressTitle: 'Lucky Dime' } },
  ],
};

test('parseSquarespaceEvents maps items to local date/time, decoded title, absolute url', () => {
  const evs = parseSquarespaceEvents(SQ_SAMPLE, { base: 'https://www.example.com', fallbackVenue: 'Everett' });
  assert.deepEqual(evs, [
    { venue: 'Kings Hall at APEX Everett', title: 'Leroy Bell & His Only Friends + Lady A',
      date: '2026-09-11', time: '19:00:00', url: 'https://www.example.com/shows/2026/9/11/leroy-bell' },
    { venue: 'Everett', title: 'And Then There Were None',
      date: '2027-01-02', time: '14:30:00', url: 'https://www.example.com/eventscalendar/and-then' },
  ]);
});

test('dropTimeClashes drops candidates already covered at the same venue, date and time', () => {
  const existing = [
    { venue: 'APEX Everett', date: '2026-09-11', time: '19:00:00', title: 'Leroy Bell & His Only Friends & Lady A' },
    { venue: 'Port of Everett', date: '2026-09-11', time: '', title: 'Jetty Island Days' },
  ];
  const candidates = [
    { venue: 'APEX Everett', date: '2026-09-11', time: '19:00:00', title: 'Leroy Bell + Lady A' }, // clash
    { venue: 'APEX Everett', date: '2026-09-11', time: '21:00:00', title: 'Late show' },           // different time
    { venue: 'Port of Everett', date: '2026-09-11', time: '', title: 'Untimed thing' },            // no time: never a clash
  ];
  assert.deepEqual(dropTimeClashes(candidates, existing).map((e) => e.title), ['Late show', 'Untimed thing']);
});

test('parseNwacIcal: the one college\'s home games — "at Everett" or an Everett ground — in Pacific time, with the sport; friendlies elsewhere and other colleges\' games dropped', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20260903T020000Z', 'SUMMARY:(Women\'s Soccer) Northwest University at Everett (6-0)', 'CATEGORIES:Women\'s Soccer',
    'LOCATION:Everett Memorial Stadium\\, 3900 Broadway\\, Everett\\,', ' WA', 'URL:/sports/wsoc/2026-27/boxscores/20260902_iapq.xml', 'END:VEVENT',
    'BEGIN:VEVENT', 'DTSTART:20260818T220000Z', 'SUMMARY:(Women\'s Soccer) Everett vs. Blue Mountain (1-2)', 'LOCATION:Starfire Sports Complex', 'END:VEVENT', // a neutral-site friendly in Tukwila
    'BEGIN:VEVENT', 'DTSTART:20260910T010000Z', 'SUMMARY:(Women\'s Soccer) Everett at Skagit Valley', 'LOCATION:Skagit Valley College\\, Mount Vernon\\, WA', 'END:VEVENT', // away
    'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261121', 'SUMMARY:(Men\'s Basketball) Bellevue at Everett', 'LOCATION:Everett Community College', 'END:VEVENT', // no time yet
    'BEGIN:VEVENT', 'DTSTART:20260910T010000Z', 'SUMMARY:(Women\'s Soccer) Peninsula at Olympic', 'LOCATION:Bremerton\\, WA', 'END:VEVENT', // another college's
    'END:VCALENDAR',
  ].join('\r\n');
  const out = parseNwacIcal(ics);
  assert.deepEqual(out, [
    { venue: 'Everett Community College', title: 'Everett CC Trojans vs Northwest University (Women\'s Soccer)', date: '2026-09-02', time: '19:00:00', url: 'https://nwacsports.com/sports/wsoc/2026-27/boxscores/20260902_iapq.xml', type: 'sports' },
    { venue: 'Everett Community College', title: 'Everett CC Trojans vs Bellevue (Men\'s Basketball)', date: '2026-11-21', time: '', url: 'https://nwacsports.com', type: 'sports' },
  ]);
});
