/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { estimateTrip, lowestDailyRate, type PricingInput } from './pricing.ts';

// The Toyota KDH from the Figma design.
const kdh: PricingInput = {
  price_per_day: 12000,
  km_per_day: 100,
  extra_km_rate: 60,
  min_days: 1,
  weekly_price: 77000,
  weekly_km: 700,
  monthly_price: 240000,
  monthly_km: 3000,
  driver_available: true,
  driver_price_per_day: 3500,
};

test('design example: 3 days, 450 km, with driver = Rs 55,500', () => {
  const e = estimateTrip(kdh, 3, 450, true);
  assert.equal(e.plan, 'daily');
  assert.equal(e.base, 36000);
  assert.equal(e.freeKm, 300);
  assert.equal(e.extraKm, 150);
  assert.equal(e.extraKmCost, 9000);
  assert.equal(e.driverCost, 10500);
  assert.equal(e.total, 55500);
});

test('no driver cost when self-driving', () => {
  assert.equal(estimateTrip(kdh, 3, 300, false).total, 36000);
});

test('uses the weekly offer when it is cheaper', () => {
  const e = estimateTrip(kdh, 7, 700, false);
  assert.equal(e.plan, 'weekly');
  assert.equal(e.base, 77000);
  assert.equal(e.extraKm, 0);
});

test('uses the monthly offer for 30+ days, pro-rated', () => {
  const e = estimateTrip(kdh, 45, 4500, false);
  assert.equal(e.plan, 'monthly');
  assert.equal(e.base, 360000);
  assert.equal(e.freeKm, 4500);
  assert.equal(e.total, 360000);
});

test('picks the plan with the lowest total including extra km', () => {
  // Weekly base is cheaper but has fewer free km than daily (700 vs 1000);
  // with 1000 km the daily plan wins.
  const p = { ...kdh, weekly_price: 83000, km_per_day: 150 };
  const e = estimateTrip(p, 7, 1000, false);
  assert.equal(e.plan, 'daily');
  assert.equal(e.total, 84000);
});

test('unlimited km never charges extra', () => {
  const e = estimateTrip({ ...kdh, km_per_day: null, weekly_price: null, monthly_price: null }, 2, 5000, false);
  assert.equal(e.freeKm, null);
  assert.equal(e.extraKmCost, 0);
  assert.equal(e.total, 24000);
});

test('minimum rental days are applied', () => {
  const e = estimateTrip({ ...kdh, min_days: 3 }, 1, 0, false);
  assert.equal(e.days, 3);
  assert.equal(e.minDaysApplied, true);
  assert.equal(e.total, 36000);
});

test('bad input falls back to 1 day, 0 km', () => {
  const e = estimateTrip(kdh, Number.NaN, -20, false);
  assert.equal(e.days, 1);
  assert.equal(e.extraKm, 0);
  assert.equal(e.total, 12000);
});

test('lowestDailyRate considers long-term offers', () => {
  assert.equal(lowestDailyRate(kdh), 8000);
  assert.equal(lowestDailyRate({ price_per_day: 6000, weekly_price: null, monthly_price: null }), 6000);
});
