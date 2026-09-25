/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HELP, minHireLabel, minHireSentence } from './help.ts';

test('minimum hire labels', () => {
  assert.equal(minHireLabel(1), null);
  assert.equal(minHireLabel(3), 'Minimum 3 days');
  assert.equal(minHireLabel(7), 'Minimum 1 week');
  assert.equal(minHireLabel(14), 'Minimum 2 weeks');
  assert.equal(minHireLabel(30), 'Minimum 1 month');
  assert.equal(minHireLabel(60), 'Minimum 2 months');
  assert.equal(minHireSentence(1), null);
  assert.equal(minHireSentence(30), 'You must rent this vehicle for at least 1 month (30 days).');
  assert.equal(minHireSentence(3), 'You must rent this vehicle for at least 3 days.');
});

test('every help text has a title and text', () => {
  for (const h of Object.values(HELP)) {
    assert.ok(h.title.length > 0 && h.text.length > 20, h.title);
  }
});
