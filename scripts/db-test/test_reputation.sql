-- Tests for the owner success score and badges. Runs after test_rewards.sql.

insert into auth.users (id, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000005' || lpad(n::text, 2, '0'))::uuid, 'rep' || n || '@x.lk',
       jsonb_build_object('full_name', 'Person ' || n)
from generate_series(1, 12) n;
-- 01 = owner A (mixed), 02 = owner B (new), 03 = owner C (all good), 04-12 = customers
update public.profiles set phone = '0770000001'
where id::text like '00000000-0000-0000-0000-0000000005%';

create temp table rp (name text primary key, id uuid);
grant all on rp to anon, authenticated;
with ins as (
  insert into public.listings (owner_id, title, lat, lng, town)
  values ('00000000-0000-0000-0000-000000000501', 'Rep Van A', 8.30, 80.40, 'Anuradhapura'),
         ('00000000-0000-0000-0000-000000000502', 'Rep Van B', 8.30, 80.41, 'Anuradhapura'),
         ('00000000-0000-0000-0000-000000000503', 'Rep Van C', 8.30, 80.42, 'Anuradhapura')
  returning id, owner_id
)
insert into rp select 'van' || right(owner_id::text, 1), id from ins;
insert into public.vehicle_details (listing_id, vehicle_type, make, model, seats, price_per_day)
select id, 'van', 'Toyota', 'Hiace', 12, 10000 from rp;

-- Owner A: six rentals started with the code (customers 04-09).
insert into public.bookings (listing_id, owner_id, customer_id, start_date, days, estimate,
                             commission_percent, status, started_at, responded_at, agreed_total, commission)
select (select id from rp where name = 'van1'), '00000000-0000-0000-0000-000000000501',
       ('00000000-0000-0000-0000-0000000005' || lpad(n::text, 2, '0'))::uuid,
       public.lk_today() - 100 + n * 3, 1, 10000, 5, 'started', now() - interval '10 days', now(), 10000, 0
from generate_series(4, 9) n;
-- Reviews: 5 and 4 stars (good), 2 stars (bad). The other three rentals count as good.
insert into public.reviews (listing_id, reviewer_id, rating)
values ((select id from rp where name = 'van1'), '00000000-0000-0000-0000-000000000504', 5),
       ((select id from rp where name = 'van1'), '00000000-0000-0000-0000-000000000505', 4),
       ((select id from rp where name = 'van1'), '00000000-0000-0000-0000-000000000506', 2);

-- Owner C: five good rentals, no reviews.
insert into public.bookings (listing_id, owner_id, customer_id, start_date, days, estimate,
                             commission_percent, status, started_at, responded_at, agreed_total, commission)
select (select id from rp where name = 'van3'), '00000000-0000-0000-0000-000000000503',
       ('00000000-0000-0000-0000-0000000005' || lpad(n::text, 2, '0'))::uuid,
       public.lk_today() - 100 + n * 3, 1, 10000, 5, 'started', now() - interval '10 days', now(), 10000, 0
from generate_series(4, 8) n;

-- 5 good / 1 bad = 83%: Rising Star.
select test.eq((select score from public.owner_reputation('00000000-0000-0000-0000-000000000501')), 83, 'A score');
select test.eq((select tier from public.owner_reputation('00000000-0000-0000-0000-000000000501')), 'rising', 'A rising');
select test.eq((select verified from public.owner_reputation('00000000-0000-0000-0000-000000000501')), 6, 'A verified');
-- New owner: no score yet.
select test.eq((select score from public.owner_reputation('00000000-0000-0000-0000-000000000502')), null::integer, 'B no score');
select test.eq((select tier from public.owner_reputation('00000000-0000-0000-0000-000000000502')), null::text, 'B no badge');
-- 100% with 5 verified rentals: Top Rated.
select test.eq((select tier from public.owner_reputation('00000000-0000-0000-0000-000000000503')), 'top_rated', 'C top rated');

-- Owner A cancels an accepted booking: 5 / 7 = 71%, no badge.
insert into public.bookings (listing_id, owner_id, customer_id, start_date, days, estimate, commission_percent,
                             status, responded_at, closed_by, close_reason, closed_at)
values ((select id from rp where name = 'van1'), '00000000-0000-0000-0000-000000000501',
        '00000000-0000-0000-0000-000000000510', public.lk_today() + 5, 1, 10000, 5,
        'cancelled', now(), 'owner', 'vehicle_unavailable', now());
select test.eq((select score from public.owner_reputation('00000000-0000-0000-0000-000000000501')), 71, 'A after cancel');
select test.eq((select tier from public.owner_reputation('00000000-0000-0000-0000-000000000501')), null::text, 'A lost badge');
-- Hidden reviews don't count: without the 2-star review that rental is a plain
-- good rental → 6 good / 1 bad (the cancellation) = 86%.
update public.reviews set is_hidden = true where rating = 2 and listing_id = (select id from rp where name = 'van1');
select test.eq((select score from public.owner_reputation('00000000-0000-0000-0000-000000000501')), 86, 'hidden review ignored');

-- Public lookups show the score and badge; the owner sees them in my_dues.
set role anon;
select test.eq((select owner_tier from public.search_vehicles(8.30, 80.40) where title = 'Rep Van C'), 'top_rated',
               'search shows badge');
select test.eq((select owner_score from public.get_vehicle((select id from rp where name = 'van1'))), 86,
               'vehicle page shows score');
-- From here the new owner's van B is nearest (0.44 km) but Top Rated C (0.66 km) ranks first.
select test.eq((select title from public.search_vehicles(8.30, 80.414, radius_km => 5) limit 1),
               'Rep Van B', 'nearest: B first');
select test.eq((select title from public.search_vehicles(8.30, 80.414, radius_km => 5, sort_by => 'recommended') limit 1),
               'Rep Van C', 'recommended: Top Rated owner first');
reset role;
set role authenticated;
select test.as_user('00000000-0000-0000-0000-000000000501');
select test.eq((select owner_score from public.my_dues()), 86, 'owner sees own score');
select test.eq((select good_outcomes from public.my_dues()), 6, 'good outcomes');
select test.eq((select bad_outcomes from public.my_dues()), 1, 'bad outcomes');
reset role;
