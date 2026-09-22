import test from 'node:test';
import assert from 'node:assert/strict';
import { getEtRotationDayNumber as edition } from '../src/dailyRefresh.js';

for (const [season, before, noon] of [
  ['summer', '2026-09-22T15:59:59Z', '2026-09-22T16:00:00Z'],
  ['winter', '2026-01-22T16:59:59Z', '2026-01-22T17:00:00Z'],
  ['spring DST', '2026-03-08T15:59:59Z', '2026-03-08T16:00:00Z'],
  ['fall DST', '2026-11-01T16:59:59Z', '2026-11-01T17:00:00Z'],
]) {
  test(`${season}: changes exactly at noon ET`, () => {
    assert.equal(edition(new Date(noon)), edition(new Date(before)) + 1);
    assert.equal(edition(new Date(Date.parse(noon) + 60_000)), edition(new Date(noon)));
  });
}
test('midnight ET keeps the previous noon edition', () => {
  assert.equal(edition(new Date('2026-09-23T04:00:00Z')), edition(new Date('2026-09-22T16:00:00Z')));
});
test('reopening several days later catches up immediately', () => {
  assert.equal(edition(new Date('2026-09-25T16:00:00Z')) - edition(new Date('2026-09-22T16:00:00Z')), 3);
});
