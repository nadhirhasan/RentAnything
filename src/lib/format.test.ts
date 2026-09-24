/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  base64ToBytes,
  colomboDate,
  formatDistance,
  formatLKR,
  parseAmount,
  telUrl,
  toInternationalLK,
  whatsappUrl,
} from './format.ts';

test('formatLKR', () => {
  assert.equal(formatLKR(12000), 'Rs 12,000');
  assert.equal(formatLKR(240000.4), 'Rs 240,000');
});

test('formatDistance', () => {
  assert.equal(formatDistance(null), null);
  assert.equal(formatDistance(0.04), '100 m away');
  assert.equal(formatDistance(0.46), '500 m away');
  assert.equal(formatDistance(1.8), '1.8 km away');
  assert.equal(formatDistance(23.4), '23 km away');
});

test('parseAmount', () => {
  assert.equal(parseAmount('12,000'), 12000);
  assert.equal(parseAmount('Rs 3500'), 3500);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
});

test('Sri Lankan phone numbers become international', () => {
  assert.equal(toInternationalLK('077 123 4567'), '94771234567');
  assert.equal(toInternationalLK('+94 77 123 4567'), '94771234567');
  assert.equal(toInternationalLK('0094771234567'), '94771234567');
  assert.equal(toInternationalLK('771234567'), '94771234567');
  assert.equal(telUrl('077 123 4567'), 'tel:+94771234567');
  assert.equal(
    whatsappUrl('0771234567', 'Hi! Is it free?'),
    'https://wa.me/94771234567?text=Hi!%20Is%20it%20free%3F',
  );
});

test('colomboDate uses Sri Lanka time (UTC+5:30)', () => {
  // 20:00 UTC is already 01:30 the next day in Colombo.
  const now = new Date('2026-10-04T20:00:00Z');
  assert.equal(colomboDate(0, now), '2026-10-05');
  assert.equal(colomboDate(1, now), '2026-10-06');
});

test('base64ToBytes', () => {
  assert.deepEqual([...base64ToBytes('aGVsbG8=')], [...Buffer.from('hello')]);
  assert.deepEqual([...base64ToBytes('AAEC/w==')], [0, 1, 2, 255]);
});
