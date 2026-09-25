/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HELP, minHireLabel, minHireSentence } from './help.ts';

test('minimum hire labels', () => {
  assert.equal(minHireLabel(1), null);
  assert.equal(minHireLabel(3), '3 days minimum');
  assert.equal(minHireLabel(7), '1 week minimum');
  assert.equal(minHireLabel(14), '2 weeks minimum');
  assert.equal(minHireLabel(30), '1 month minimum');
  assert.equal(minHireLabel(60), '2 months minimum');
  assert.equal(minHireSentence(1), null);
  assert.equal(minHireSentence(30), 'This vehicle can only be hired for 1 month or more (30 days).');
  assert.equal(minHireSentence(3), 'This vehicle can only be hired for 3 days or more.');
});

test('every help text has a title and text', () => {
  for (const h of Object.values(HELP)) {
    assert.ok(h.title.length > 0 && h.text.length > 20, h.title);
  }
});
