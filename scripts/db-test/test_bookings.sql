-- Tests for bookings, the handover code, owner dues and restrictions.
-- Runs after test.sql (helpers in schema "test").

-- Plain 5% here; free rentals, the cap and coin rounding are tested in test_rewards.sql.
update public.app_settings set free_rentals = 0, fee_cap = 0, coin_value = 1, dues_limit = 5000;

-- Users: O owner, C and K customers, N customer without phone, X stranger, M admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'o@x.lk', '{"full_name":"Ruwan Jayasinghe"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'c@x.lk', '{"full_name":"Amal Perera"}'),
  ('00000000-0000-0000-0000-0000000000f3', 'n@x.lk', '{"full_name":"No Phone"}'),
  ('00000000-0000-0000-0000-0000000000f4', 'k@x.lk', '{"full_name":"Kamal Dias"}'),
  ('00000000-0000-0000-0000-0000000000f5', 'x@x.lk', '{"full_name":"Stranger"}'),
  ('00000000-0000-0000-0000-0000000000f9', 'm@x.lk', '{"full_name":"Admin Two"}');
update public.profiles set phone = '0771111111' where id in (
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2',
  '00000000-0000-0000-0000-0000000000f4');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000f9';

-- Two buddy vans owned by O: 8,000/day, 50,000/week, driver 2,000/day.
create temp table bv (n int primary key, id uuid);
grant all on bv to anon, authenticated;
with ins as (
  insert into public.listings (owner_id, title, lat, lng, town)
  select '00000000-0000-0000-0000-0000000000f1', 'Buddy ' || g, 6.9, 79.9, 'Maharagama'
  from generate_series(1, 2) g
  returning id, (regexp_match(title, '\d+'))[1]::int as n
)
insert into bv select n, id from ins;
insert into public.vehicle_details (listing_id, vehicle_type, make, model, seats, price_per_day,
  weekly_price, driver_available, driver_price_per_day, min_days)
select id, 'buddy_van', 'Suzuki', 'Every', 4, 8000, 50000, true, 2000, 2 from bv;

create temp table d as select (now() at time zone 'Asia/Colombo')::date as today;
grant select on d to anon, authenticated;

-- Pricing mirrors estimateTrip().
select test.eq(public.trip_price(v, 5, false), 40000, '5 days daily') from public.vehicle_details v
  where listing_id = (select id from bv where n = 1);
select test.eq(public.trip_price(v, 7, false), 50000, '7 days weekly') from public.vehicle_details v
  where listing_id = (select id from bv where n = 1);
select test.eq(public.trip_price(v, 10, false), 71429, '10 days pro-rated weekly') from public.vehicle_details v
  where listing_id = (select id from bv where n = 1);
select test.eq(public.trip_price(v, 5, true), 50000, 'driver added') from public.vehicle_details v
  where listing_id = (select id from bv where n = 1);

set role authenticated;

-- Requesting --------------------------------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000000f3');
select test.raises($$select public.request_booking((select id from bv where n = 1), (select today + 3 from d), 5)$$,
                   'booking_needs_phone');
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.raises($$select public.request_booking((select id from bv where n = 1), (select today + 3 from d), 5)$$,
                   'booking_own_listing');
select test.as_user('00000000-0000-0000-0000-0000000000f2');
select test.raises($$select public.request_booking((select id from bv where n = 1), (select today - 1 from d), 5)$$,
                   'booking_bad_dates');
select test.raises($$select public.request_booking((select id from bv where n = 1), (select today + 3 from d), 1)$$,
                   'booking_min_days');
select test.raises($$select * from public.bookings$$, 'permission denied');

create temp table bk (name text primary key, id uuid);
grant all on bk to anon, authenticated;
insert into bk values ('c1', public.request_booking((select id from bv where n = 1), (select today + 3 from d), 5,
                                                    false, 'Trip to Ella'));
select test.eq((select estimate from public.get_booking((select id from bk where name = 'c1'))), 40000, 'estimate');
select test.eq((select state from public.get_booking((select id from bk where name = 'c1'))), 'requested', 'requested');
select test.eq((select handover_code from public.get_booking((select id from bk where name = 'c1'))), null::text,
               'no code before accept');
select test.eq((select other_phone from public.get_booking((select id from bk where name = 'c1'))), null::text,
               'no phone before accept');
select test.raises($$select public.request_booking((select id from bv where n = 1), (select today + 20 from d), 2)$$,
                   'booking_exists');

-- K asks for overlapping days while C's request is still open: allowed.
select test.as_user('00000000-0000-0000-0000-0000000000f4');
insert into bk values ('k1', public.request_booking((select id from bv where n = 1), (select today + 5 from d), 2));

-- Strangers can't read either booking.
select test.as_user('00000000-0000-0000-0000-0000000000f5');
select test.raises($$select * from public.get_booking((select id from bk where name = 'c1'))$$, 'booking_not_found');

-- Owner: requests, badge, customer summary.
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.eq(public.my_booking_badge(), 2, 'badge counts open requests');
select test.eq((select count(*) from public.my_bookings(true) where needs_action), 2::bigint, 'owner needs action');
select test.eq((select customer ->> 'name' from public.get_booking((select id from bk where name = 'c1'))),
               'Amal P.', 'customer summary');
select test.eq((select handover_code from public.get_booking((select id from bk where name = 'c1'))), null::text,
               'owner never sees the code');

-- Accepting C's request declines K's overlapping one.
select public.respond_booking((select id from bk where name = 'c1'), true);
select test.eq((select state from public.get_booking((select id from bk where name = 'k1'))), 'declined',
               'overlapping request declined');
select test.eq((select close_reason from public.get_booking((select id from bk where name = 'k1'))), 'dates_taken',
               'decline reason');
select test.raises($$select public.respond_booking((select id from bk where name = 'c1'), true)$$, 'booking_not_open');
select test.eq((select other_phone from public.get_booking((select id from bk where name = 'c1'))), '0771111111',
               'owner sees customer phone after accept');

-- Booked days are public and block new requests.
reset role;
set role anon;
select test.eq((select count(*) from public.listing_booked_dates((select id from bv where n = 1))), 1::bigint,
               'booked dates public');
set role authenticated;
select test.as_user('00000000-0000-0000-0000-0000000000f4');
select test.raises($$select public.request_booking((select id from bv where n = 1), (select today + 6 from d), 3)$$,
                   'booking_dates_taken');

-- Customer sees the code and the owner's number.
select test.as_user('00000000-0000-0000-0000-0000000000f2');
select test.eq((select length(handover_code) from public.get_booking((select id from bk where name = 'c1'))), 4,
               'customer sees code');
select test.eq((select other_name from public.get_booking((select id from bk where name = 'c1'))), 'Ruwan Jayasinghe',
               'full owner name after accept');

-- Handover -------------------------------------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.eq(public.start_booking((select id from bk where name = 'c1'), 'xxxx'), 'wrong_code', 'wrong code');
select public.start_booking((select id from bk where name = 'c1'), 'xxxx') from generate_series(1, 4);
select test.eq(public.start_booking((select id from bk where name = 'c1'), 'xxxx'), 'locked', 'locked after 5');
reset role;
-- Even the right code waits out the lock.
select test.eq(public.start_booking((select id from bk where name = 'c1'), handover_code), 'locked', 'lock holds')
from public.bookings where id = (select id from bk where name = 'c1');
update public.bookings set code_attempted_at = now() - interval '16 minutes'
where id = (select id from bk where name = 'c1');
select set_config('test.code', handover_code, false) from public.bookings where id = (select id from bk where name = 'c1');
set role authenticated;
select test.eq(public.start_booking((select id from bk where name = 'c1'), current_setting('test.code'), 38000),
               'ok', 'handover');
select test.eq((select state from public.get_booking((select id from bk where name = 'c1'))), 'started', 'started');
select test.eq((select commission from public.get_booking((select id from bk where name = 'c1'))), 1900,
               '5% of the agreed 38,000');
select test.eq((select balance from public.my_dues()), 1900, 'commission on the balance');
select test.eq((select restricted from public.my_dues()), false, 'under the limit');
select test.eq((select count(*) from public.search_vehicles(6.9, 79.9, page_size => 50) where title = 'Buddy 1'),
               0::bigint, 'on hire: switched off');
select test.eq((select count(*) from public.search_vehicles(6.9, 79.9, page_size => 50) where title = 'Buddy 2'),
               1::bigint, 'other van still live');
select public.rate_customer((select id from bk where name = 'c1'), 5::smallint, array['on_time', 'careful']);
select test.eq((select customer ->> 'rating_avg' from public.get_booking((select id from bk where name = 'c1'))), '5.0',
               'customer rated');

-- The customer can now review, with the verified badge.
select test.as_user('00000000-0000-0000-0000-0000000000f2');
select test.eq((select eligibility from public.my_review_status((select id from bv where n = 1))), 'ok',
               'booking makes the customer eligible');
select test.eq((select verified from public.my_review_status((select id from bv where n = 1))), true, 'verified hire');
select test.raises($$select public.cancel_booking((select id from bk where name = 'c1'))$$, 'booking_not_open');

-- Restriction: limit -----------------------------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.raises($$select public.admin_update_settings(5, 1000, 30, '')$$, 'admin_only');
select test.as_user('00000000-0000-0000-0000-0000000000f9');
select public.admin_update_settings(5, 1000, 30, 'BOC 12345678 · RentAnything (Pvt) Ltd');
select test.eq((select restricted_reason from public.admin_dues_overview()
                where owner_id = '00000000-0000-0000-0000-0000000000f1'), 'limit', 'admin sees restricted owner');
select test.as_user('00000000-0000-0000-0000-0000000000f4');
select test.eq((select count(*) from public.search_vehicles(6.9, 79.9, page_size => 50) where title = 'Buddy 2'),
               0::bigint, 'restricted owner out of search');
select test.raises($$select public.start_conversation((select id from bv where n = 2))$$,
                   'listing_not_available');
select test.raises($$select public.request_booking((select id from bv where n = 2), (select today + 3 from d), 2)$$,
                   'listing_not_available');
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.eq((select hidden_reason from public.get_vehicle((select id from bv where n = 2))), 'dues',
               'owner sees why');
select test.eq((select payment_details from public.my_dues()), 'BOC 12345678 · RentAnything (Pvt) Ltd',
               'payment details shown');
select test.raises($$select public.delete_my_account()$$, 'dues_outstanding');

-- Reporting a payment lifts the restriction until an admin checks it.
select public.report_dues_payment(1900, 'bank', 'TXN-778');
select test.eq((select restricted from public.my_dues()), false, 'pending payment counts');
select test.raises($$select public.report_dues_payment(100, 'bank')$$, 'payment_pending_exists');
select test.as_user('00000000-0000-0000-0000-0000000000f9');
select public.admin_review_payment(((select pending_payment from public.admin_dues_overview()
  where owner_id = '00000000-0000-0000-0000-0000000000f1') ->> 'id')::bigint, false, 'Not in the account');
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.eq((select restricted from public.my_dues()), true, 'rejected: restricted again');
select public.report_dues_payment(1900, 'lankaqr', 'QR-1');
select test.as_user('00000000-0000-0000-0000-0000000000f9');
select public.admin_review_payment(((select pending_payment from public.admin_dues_overview()
  where owner_id = '00000000-0000-0000-0000-0000000000f1') ->> 'id')::bigint, true);
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.eq((select balance from public.my_dues()), 0, 'paid');
select test.eq((select jsonb_array_length(entries) from public.my_dues()), 2, 'commission + payment entries');

-- Restriction: overdue -------------------------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000000f9');
select public.admin_update_settings(5, 5000, 30, 'BOC 12345678 · RentAnything (Pvt) Ltd');
select public.admin_adjust_dues('00000000-0000-0000-0000-0000000000f1', 500, 'Test charge');
reset role;
-- Payments go against the oldest charges first, so age the earlier entries too.
update public.owner_ledger set created_at = now() - interval '40 days'
where owner_id = '00000000-0000-0000-0000-0000000000f1' and note <> 'Test charge';
update public.owner_ledger set created_at = now() - interval '31 days' where note = 'Test charge';
set role authenticated;
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.eq((select restricted_reason from public.my_dues()), 'overdue', 'unpaid for 30+ days');
select test.as_user('00000000-0000-0000-0000-0000000000f9');
select public.admin_adjust_dues('00000000-0000-0000-0000-0000000000f1', -500, 'Waived');
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.eq((select restricted from public.my_dues()), false, 'waived');

-- No deal, disputes and cancelling ---------------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000000f4');
insert into bk values ('k2', public.request_booking((select id from bv where n = 2), (select today from d), 2, true));
select test.eq((select with_driver from public.get_booking((select id from bk where name = 'k2'))), true, 'with driver');
select test.eq((select estimate from public.get_booking((select id from bk where name = 'k2'))), 20000, 'driver priced');
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select public.respond_booking((select id from bk where name = 'k2'), true);
select public.mark_no_deal((select id from bk where name = 'k2'), 'customer_no_show');
select test.eq((select state from public.get_booking((select id from bk where name = 'k2'))), 'no_deal', 'no deal');
-- The customer says they did rent it: dispute for the admin.
select test.as_user('00000000-0000-0000-0000-0000000000f4');
select public.confirm_booking_outcome((select id from bk where name = 'k2'), true);
select test.raises($$select public.confirm_booking_outcome((select id from bk where name = 'k2'), false)$$,
                   'booking_not_open');
select test.as_user('00000000-0000-0000-0000-0000000000f9');
select test.eq((select count(*) from public.admin_disputes()), 1::bigint, 'dispute listed');
select public.admin_resolve_dispute((select id from bk where name = 'k2'), true);
select test.eq((select count(*) from public.admin_disputes()), 0::bigint, 'dispute resolved');
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.eq((select balance from public.my_dues()), 1000, 'charged 5% of 20,000');
select test.eq((select state from public.get_booking((select id from bk where name = 'k2'))), 'started',
               'charged dispute counts as a rental');

-- Cancelling: customer cancels a request; the owner can't cancel a request.
select test.as_user('00000000-0000-0000-0000-0000000000f2');
insert into bk values ('c2', public.request_booking((select id from bv where n = 2), (select today + 30 from d), 3));
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.raises($$select public.cancel_booking((select id from bk where name = 'c2'))$$, 'booking_not_open');
select test.as_user('00000000-0000-0000-0000-0000000000f2');
select public.cancel_booking((select id from bk where name = 'c2'), 'changed_plans');
select test.eq((select state from public.get_booking((select id from bk where name = 'c2'))), 'cancelled', 'cancelled');

-- Accepted but never picked up: the customer says it didn't happen.
insert into bk values ('c3', public.request_booking((select id from bv where n = 1), (select today + 40 from d), 2));
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select public.respond_booking((select id from bk where name = 'c3'), true);
reset role;
update public.bookings set start_date = (select today from d) where id = (select id from bk where name = 'c3');
set role authenticated;
select test.as_user('00000000-0000-0000-0000-0000000000f2');
select test.eq((select needs_action from public.my_bookings() where id = (select id from bk where name = 'c3')), true,
               'customer asked what happened');
select public.confirm_booking_outcome((select id from bk where name = 'c3'), false);
select test.eq((select close_reason from public.get_booking((select id from bk where name = 'c3'))), 'did_not_happen',
               'closed as not happened');

-- Unanswered requests expire after 48 hours and stop counting.
insert into bk values ('c4', public.request_booking((select id from bv where n = 2), (select today + 60 from d), 2));
reset role;
update public.bookings set created_at = now() - interval '49 hours' where id = (select id from bk where name = 'c4');
set role authenticated;
select test.eq((select state from public.get_booking((select id from bk where name = 'c4'))), 'expired', 'expired');
select test.as_user('00000000-0000-0000-0000-0000000000f1');
select test.raises($$select public.respond_booking((select id from bk where name = 'c4'), true)$$, 'booking_not_open');

reset role;
select test.eq((select count(*) from public.bookings), 6::bigint, 'six bookings');
