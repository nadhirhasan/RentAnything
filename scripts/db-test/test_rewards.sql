-- Tests for owner rewards: free first rentals, fee cap, whole coins, verified
-- rentals and search ranking. Runs after test_avatars.sql (helpers in "test").

-- The defaults: 1 coin = Rs 1, and 1,000 coins of credit.
select test.eq((select coin_value from public.app_settings), 1, 'coin default');
select test.eq((select column_default from information_schema.columns
                where table_name = 'app_settings' and column_name = 'dues_limit'), '1000', 'credit default');
-- The tests below were written for Rs 10 coins, so they still use that.
update public.app_settings set free_rentals = 3, fee_cap = 3000, coin_value = 10, dues_limit = 10000;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004a1', 'o5@x.lk', '{"full_name":"Honest Owner"}'),
  ('00000000-0000-0000-0000-0000000004a2', 'o6@x.lk', '{"full_name":"New Owner"}'),
  ('00000000-0000-0000-0000-0000000004a9', 'admin9@x.lk', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000004b1', 'c7@x.lk', '{"full_name":"Ruwan Customer"}');
update public.profiles set phone = '0770000001' where id in (
  '00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004a2',
  '00000000-0000-0000-0000-0000000004b1');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000004a9';

create temp table rw (name text primary key, id uuid);
grant all on rw to anon, authenticated;
-- The honest owner's van is a little further from the search point than the new owner's.
with ins as (
  insert into public.listings (owner_id, title, lat, lng, town)
  values ('00000000-0000-0000-0000-0000000004a1', 'Honest Van', 6.012, 81.06, 'Hambantota')
  returning id
)
insert into rw select 'honest', id from ins;
with ins as (
  insert into public.listings (owner_id, title, lat, lng, town)
  values ('00000000-0000-0000-0000-0000000004a2', 'New Van', 6.010, 81.06, 'Hambantota')
  returning id
)
insert into rw select 'new', id from ins;
insert into public.vehicle_details (listing_id, vehicle_type, make, model, seats, price_per_day)
select id, 'van', 'Toyota', 'Hiace', 12, 10000 from rw;

-- Five accepted bookings on the honest van, far apart.
with ins as (
  insert into public.bookings (listing_id, owner_id, customer_id, start_date, days, estimate,
                               commission_percent, status, handover_code, responded_at)
  select (select id from rw where name = 'honest'), '00000000-0000-0000-0000-0000000004a1',
         '00000000-0000-0000-0000-0000000004b1', public.lk_today() + n * 10, 1, 10000, 5,
         'accepted', '1111', now()
  from generate_series(1, 5) n
  returning id, start_date
)
insert into rw select 'b' || row_number() over (order by start_date), id from ins;

set role authenticated;
select test.as_user('00000000-0000-0000-0000-0000000004a1');

-- The first three rentals are free.
select test.eq(public.start_booking((select id from rw where name = 'b1'), '1111', 40000), 'ok', 'start 1');
select test.eq(public.start_booking((select id from rw where name = 'b2'), '1111', 40000), 'ok', 'start 2');
select test.eq(public.start_booking((select id from rw where name = 'b3'), '1111', 40000), 'ok', 'start 3');
select test.eq((select commission from public.get_booking((select id from rw where name = 'b3'))), 0, 'third rental free');
-- Then 5%, rounded to whole coins: 5% of 12,345 = 617 → 62 coins = Rs 620.
select test.eq(public.start_booking((select id from rw where name = 'b4'), '1111', 12345), 'ok', 'start 4');
select test.eq((select commission from public.get_booking((select id from rw where name = 'b4'))), 620, 'rounded to coins');
-- Capped: 5% of 200,000 = 10,000 → Rs 3,000.
select test.eq(public.start_booking((select id from rw where name = 'b5'), '1111', 200000), 'ok', 'start 5');
select test.eq((select commission from public.get_booking((select id from rw where name = 'b5'))), 3000, 'fee cap');

select test.eq((select balance from public.my_dues()), 3620, 'balance');
select test.eq((select verified_rentals from public.my_dues()), 5, 'verified rentals');
select test.eq((select coin_value from public.my_dues()), 10, 'coin value');
select test.eq((select free_rentals from public.my_dues()), 3::smallint, 'free rentals setting');
select test.eq((select fee_cap from public.my_dues()), 3000, 'fee cap setting');

-- A new owner caught without the code (dispute) gets no free rental.
reset role;
with ins as (
  insert into public.bookings (listing_id, owner_id, customer_id, start_date, days, estimate,
                               commission_percent, status, dispute, customer_says_rented)
  values ((select id from rw where name = 'new'), '00000000-0000-0000-0000-0000000004a2',
          '00000000-0000-0000-0000-0000000004b1', public.lk_today() - 2, 1, 20000, 5,
          'accepted', 'open', true)
  returning id
)
insert into rw select 'd1', id from ins;
set role authenticated;
select test.as_user('00000000-0000-0000-0000-0000000004a9');
select public.admin_resolve_dispute((select id from rw where name = 'd1'), true);
select test.as_user('00000000-0000-0000-0000-0000000004a2');
select test.eq((select balance from public.my_dues()), 1000, 'dispute charged, not free');
select test.eq((select verified_rentals from public.my_dues()), 0, 'disputes are not verified rentals');

-- Settings: admins can change them.
select test.as_user('00000000-0000-0000-0000-0000000004a9');
select public.admin_update_settings(5, 5000, 30, '', 2, 2500, 5);
select test.eq((select fee_cap from public.get_app_settings()), 2500, 'fee cap updated');
select public.admin_update_settings(5, 5000, 30, '', 3, 3000, 10);
-- An older app sends only the first four settings: the rest stay as they are.
select public.admin_update_settings(5, 5000, 30, '');
select test.eq((select coin_value from public.get_app_settings()), 10, 'coin value kept');
select test.eq((select fee_cap from public.get_app_settings()), 3000, 'fee cap kept');
select test.as_user('00000000-0000-0000-0000-0000000004a2');
select test.raises($$select public.admin_update_settings(5, 5000, 30, '', 3, 3000, 10)$$, 'admin_only');

-- Search: switched off while on hire; switch both vans back on.
reset role;
update public.listings set is_available = true, available_again_on = null
where id in (select id from rw where name in ('honest', 'new'));
set role anon;
select test.eq((select owner_verified from public.search_vehicles(6.0, 81.06) where title = 'Honest Van'), 5,
               'search shows verified rentals');
select test.eq((select title from public.search_vehicles(6.0, 81.06, radius_km => 5) limit 1), 'New Van',
               'nearest: the closer van first');
select test.eq((select title from public.search_vehicles(6.0, 81.06, radius_km => 5, sort_by => 'recommended') limit 1),
               'Honest Van', 'recommended: verified owner first');
select test.eq((select owner_verified from public.get_vehicle((select id from rw where name = 'honest'))), 5,
               'vehicle page shows verified rentals');
reset role;
