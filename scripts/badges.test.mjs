import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, endEstimate, isDay, BADGE_FEEDS, TEAMS } from './badges.mjs';

test('slugify matches the browser-side rule', () => {
  assert.equal(slugify('APEX Everett'), 'apex-everett');
  assert.equal(slugify('Angel of the Winds Arena'), 'angel-of-the-winds-arena');
  assert.equal(slugify('Funko Field'), 'funko-field');
});

test('endEstimate prefers a real end, else start+3h, else empty', () => {
  assert.equal(endEstimate({ time: '13:00:00', end: '15:30:00' }), '15:30:00');
  assert.equal(endEstimate({ time: '13:00:00' }), '16:00:00');
  assert.equal(endEstimate({ time: '22:00:00' }), '');   // estimate would cross midnight
  assert.equal(endEstimate({ time: '' }), '');            // all-day: unknown
});

test('isDay means done by 4pm', () => {
  assert.equal(isDay({ time: '12:00:00' }), true);          // est. end 15:00
  assert.equal(isDay({ time: '14:00:00', end: '15:00:00' }), true);
  assert.equal(isDay({ time: '14:00:00' }), false);         // est. end 17:00
  assert.equal(isDay({ time: '' }), false);                 // all-day: unknown
});

test('team matchers hit game titles, not concerts', () => {
  const match = (title) => TEAMS.filter((t) => t.re.test(title)).map((t) => t.slug);
  assert.deepEqual(match('Everett Silvertips vs. Seattle Thunderbirds'), ['silvertips']);
  assert.deepEqual(match('Everett AquaSox vs. Eugene Emeralds'), ['aquasox']);
  assert.deepEqual(match('Washington Wolfpack vs. Oregon Blackbears'), ['wolfpack']);
  assert.deepEqual(match('An Evening with the Everett Philharmonic'), []);
});

test('badge predicates', () => {
  assert.equal(BADGE_FEEDS['21plus'][1]({ age21: true }), true);
  assert.equal(BADGE_FEEDS['soldout'][1]({}), false);
  assert.equal(BADGE_FEEDS['free'][1]({ free: true }), true);
  assert.equal(BADGE_FEEDS['day'][1]({ time: '11:00:00' }), true);   // ends 14:00
  assert.equal(BADGE_FEEDS['day'][1]({ time: '19:00:00' }), false);  // ends 22:00
});
