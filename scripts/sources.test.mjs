import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poeDate, parsePoeMonths, parsePoeEvents } from './sources.mjs';

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
