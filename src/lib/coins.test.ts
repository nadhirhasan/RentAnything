/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatCoins, freeRentalsLeft, ownerBadge, rentalFee, toCoins, topUpPacks, walletCoins } from './coins.ts';

test('coins from rupees', () => {
  assert.equal(toCoins(2000, 10), 200);
  assert.equal(toCoins(617, 10), 61.7);
  assert.equal(walletCoins(6400, 10), -640); // owes 6,400 rupees
  assert.equal(walletCoins(-1000, 10), 100); // paid in advance
  assert.equal(walletCoins(0, 10), 0);
  assert.equal(formatCoins(1), '1 coin');
  assert.equal(formatCoins(1240), '1,240 coins');
  assert.equal(formatCoins(-35), '-35 coins');
});

test('fee preview matches the database', () => {
  const rules = { percent: 5, cap: 3000, coinValue: 10, freeLeft: 0 };
  assert.equal(rentalFee(40000, rules), 2000);
  assert.equal(rentalFee(12345, rules), 620); // 617 → 62 coins
  assert.equal(rentalFee(200000, rules), 3000); // capped
  assert.equal(rentalFee(200000, { ...rules, cap: 0 }), 10000);
  assert.equal(rentalFee(40000, { ...rules, freeLeft: 2 }), 0);
  assert.equal(freeRentalsLeft(3, 1), 2);
  assert.equal(freeRentalsLeft(3, 7), 0);
});

test('top-up packs start with what you owe', () => {
  assert.deepEqual(topUpPacks(0), [100, 300, 500, 1000]);
  assert.deepEqual(topUpPacks(640), [640, 1000]);
  assert.deepEqual(topUpPacks(95), [100, 300, 500, 1000]);
  assert.deepEqual(topUpPacks(300), [300, 500, 1000]);
});

test('owner badge', () => {
  assert.equal(ownerBadge(0), null);
  assert.deepEqual(ownerBadge(1), { label: '1 verified rental', top: false });
  assert.deepEqual(ownerBadge(12), { label: 'Top owner · 12 rentals', top: true });
});
