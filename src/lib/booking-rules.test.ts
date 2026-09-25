/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDays,
  commissionFor,
  formatDay,
  formatRange,
  isBookedDay,
  isValidHandoverCode,
  lastDay,
  overlapsBooked,
  reasonLabel,
  stateLabel,
} from './booking-rules.ts';

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('lastDay is inclusive, like end_date in the database', () => {
  assert.equal(lastDay('2026-10-12', 1), '2026-10-12');
  assert.equal(lastDay('2026-10-12', 5), '2026-10-16');
});

test('overlapsBooked matches the database constraint', () => {
  const booked = [{ start_date: '2026-10-12', end_date: '2026-10-16' }];
  assert.equal(overlapsBooked('2026-10-10', 2, booked), false); // 10-11
  assert.equal(overlapsBooked('2026-10-10', 3, booked), true); // 10-12
  assert.equal(overlapsBooked('2026-10-16', 1, booked), true);
  assert.equal(overlapsBooked('2026-10-17', 4, booked), false);
  assert.equal(isBookedDay('2026-10-14', booked), true);
  assert.equal(isBookedDay('2026-10-17', booked), false);
});

test('date labels', () => {
  assert.equal(formatDay('2026-10-12'), 'Mon 12 Oct');
  assert.equal(formatRange('2026-10-12', '2026-10-16'), '12 – 16 Oct');
  assert.equal(formatRange('2026-10-30', '2026-11-02'), '30 Oct – 2 Nov');
  assert.equal(formatRange('2026-10-12', '2026-10-12'), '12 Oct');
});

test('commission rounds like Postgres', () => {
  assert.equal(commissionFor(38000, 5), 1900);
  assert.equal(commissionFor(12345, 5), 617); // 617.25
  assert.equal(commissionFor(12350, 5), 618); // 617.5 rounds up
  assert.equal(commissionFor(40000, 0), 0);
});

test('handover code is 4 digits', () => {
  assert.equal(isValidHandoverCode('0427'), true);
  assert.equal(isValidHandoverCode(' 0427 '), true);
  assert.equal(isValidHandoverCode('427'), false);
  assert.equal(isValidHandoverCode('12a4'), false);
});

test('labels', () => {
  assert.equal(stateLabel('requested', 'owner'), 'New request');
  assert.equal(stateLabel('requested', 'customer'), 'Waiting for owner');
  assert.equal(reasonLabel('customer_no_show'), "The customer didn't turn up");
  assert.equal(reasonLabel('nope'), null);
  assert.equal(reasonLabel(null), null);
});
