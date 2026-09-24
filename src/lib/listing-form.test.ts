/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMPTY_FORM, fromListing, suggestTitle, toInputs, validateStep, type FormState } from './listing-form.ts';
import type { MyListing } from './vehicles.ts';

const buddy: FormState = {
  ...EMPTY_FORM,
  vehicle_type: 'buddy_van',
  make: 'Suzuki',
  model: 'Every',
  year: '2016',
  seats: 5,
  double_seat: true,
  price_per_day: '6,000',
  km_per_day: '100',
  extra_km_rate: '45',
  weekly_on: true,
  weekly_price: '38,000',
  weekly_km: '700',
  lat: 7.001,
  lng: 79.953,
  town: 'Kadawatha',
  title: 'Suzuki Every Buddy Van · Double seat · AC',
};

test('suggestTitle', () => {
  assert.equal(suggestTitle(buddy), 'Suzuki Every Buddy Van · Double seat · AC');
  assert.equal(
    suggestTitle({ ...buddy, vehicle_type: 'van', make: 'Toyota', model: 'KDH', seats: 14 }),
    'Toyota KDH · 14 seats · AC',
  );
  assert.equal(suggestTitle({ ...buddy, make: '', model: '' }), '');
});

test('a complete form passes every step', () => {
  for (const step of [0, 1, 2, 3]) assert.deepEqual(validateStep(step, buddy, 2026), {});
});

test('step 1 requires type, make, model and a sensible year', () => {
  const e = validateStep(0, { ...EMPTY_FORM, year: '1800' }, 2026);
  assert.ok(e.vehicle_type && e.make && e.model && e.year);
});

test('step 2 requires km terms unless unlimited', () => {
  const f = { ...buddy, km_per_day: '', extra_km_rate: '' };
  assert.ok(validateStep(1, f).km_per_day);
  assert.ok(validateStep(1, f).extra_km_rate);
  assert.deepEqual(validateStep(1, { ...f, unlimited_km: true }), {});
  assert.ok(validateStep(1, { ...buddy, monthly_on: true }).monthly_price);
});

test('step 3 requires a hire mode and a driver price when a driver is offered', () => {
  assert.ok(validateStep(2, { ...buddy, self_drive: false, driver_available: false }).self_drive);
  assert.ok(validateStep(2, { ...buddy, driver_available: true }).driver_price_per_day);
  assert.deepEqual(validateStep(2, { ...buddy, driver_available: true, driver_price_per_day: '0' }), {});
});

test('step 4 requires location and title', () => {
  const e = validateStep(3, { ...buddy, lat: null, title: 'ab' });
  assert.ok(e.town && e.title);
});

test('toInputs converts text amounts and drops unused fields', () => {
  const { listing, details } = toInputs({ ...buddy, unlimited_km: true, is_available: false, available_again_on: '2026-10-05' });
  assert.equal(details.price_per_day, 6000);
  assert.equal(details.km_per_day, null);
  assert.equal(details.extra_km_rate, null);
  assert.equal(details.weekly_price, 38000);
  assert.equal(details.weekly_km, 700);
  assert.equal(details.monthly_price, null);
  assert.equal(details.driver_price_per_day, null);
  assert.equal(details.double_seat, true);
  assert.equal(details.year, 2016);
  assert.equal(listing.available_again_on, '2026-10-05');
  // Double seat only applies to buddy vans.
  assert.equal(toInputs({ ...buddy, vehicle_type: 'van' }).details.double_seat, false);
});

test('fromListing round-trips through toInputs', () => {
  const { listing, details } = toInputs(buddy);
  const row: MyListing = {
    ...listing,
    id: 'l1',
    is_hidden: false,
    created_at: '2026-09-24T00:00:00Z',
    vehicle_details: details,
    listing_photos: [{ id: 'p1', path: 'u/l1/a.jpg', position: 0 }],
  };
  const form = fromListing(row);
  assert.deepEqual(toInputs(form), toInputs({ ...buddy, price_per_day: '6000', weekly_price: '38000' }));
  assert.equal(form.photos[0].path, 'u/l1/a.jpg');
});
