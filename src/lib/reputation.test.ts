/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nextTier, scoreLabel, tierLabel } from './reputation.ts';

test('badge labels', () => {
  assert.equal(tierLabel('top_rated_plus'), 'Top Rated Plus');
  assert.equal(tierLabel('rising'), 'Rising Star');
  assert.equal(tierLabel(null), null);
  assert.equal(tierLabel('nope'), null);
  assert.equal(scoreLabel(96), '96% success');
  assert.equal(scoreLabel(null), null);
});

test('next badge', () => {
  assert.deepEqual(nextTier(null, 0, null), {
    label: 'Rising Star',
    needs: ['a success score (after 3 rentals or reviews)', '1 more rental started with the code'],
  });
  assert.deepEqual(nextTier(83, 6, 'rising'), {
    label: 'Top Rated',
    needs: ['90% success score (you have 83%)'],
  });
  assert.deepEqual(nextTier(95, 12, 'top_rated'), { label: 'Top Rated Plus', needs: ['8 more rentals started with the code'] });
  assert.equal(nextTier(98, 40, 'top_rated_plus'), null);
});
