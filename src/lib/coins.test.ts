/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { creditUsed, formatCoins, freeRentalsLeft, rentalFee, toCoins, topUpPacks, walletCoins } from './coins.ts';

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
  assert.deepEqual(topUpPacks(0), [500, 1000, 2000, 5000]);
  assert.deepEqual(topUpPacks(640), [640, 1000, 2000, 5000]);
  assert.deepEqual(topUpPacks(95), [100, 500, 1000, 2000]);
  assert.deepEqual(topUpPacks(2000), [2000, 5000, 10000, 20000]);
  assert.deepEqual(topUpPacks(6400), [6400, 10000, 20000, 50000]);
  // 1 coin = Rs 1, 1,000 coins of credit.
  assert.deepEqual(creditUsed(240, 1000, 1), { used: 240, limit: 1000, left: 760, fraction: 0.24 });
  assert.deepEqual(creditUsed(-500, 1000, 1), { used: 0, limit: 1000, left: 1000, fraction: 0 });
  assert.equal(creditUsed(1500, 1000, 1).fraction, 1);
});
