-- Database behaviour tests. Run with scripts/db-test/run.sh.

create schema test;
grant usage on schema test to anon, authenticated;

create function test.raises(stmt text, pattern text) returns void
language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected error matching "%" from: %', pattern, stmt;
exception when others then
  if sqlerrm like 'expected error matching%' then raise; end if;
  if sqlerrm not ilike '%' || pattern || '%' then
    raise exception 'wrong error for %: got "%", wanted "%"', stmt, sqlerrm, pattern;
  end if;
end $$;
grant execute on function test.raises to anon, authenticated;

create function test.eq(got anyelement, want anyelement, label text) returns void
language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '%: got %, want %', label, got, want;
  end if;
end $$;
grant execute on function test.eq(anyelement, anyelement, text) to anon, authenticated;

-- Users: A = owner with phone, B = owner without phone, C = customer.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"full_name":"Sunil Perera"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{}');

select test.eq((select count(*) from public.profiles), 3::bigint, 'profiles created by trigger');
select test.eq((select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
               'Sunil Perera', 'full_name copied from metadata');

-- Owner A sets their phone and lists four vehicles ---------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

select test.raises($$update public.profiles set is_admin = true$$, 'permission denied');
update public.profiles set phone = '077 123 4567' where id = auth.uid();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;

insert into ids select 'kdh', public.save_vehicle_listing(
  '{"title":"Toyota KDH High Roof","lat":7.0080,"lng":79.9290,"town":"Kiribathgoda"}',
  '{"vehicle_type":"van","make":"Toyota","model":"KDH","year":2014,"seats":14,"has_ac":true,
    "transmission":"auto","fuel_type":"diesel","price_per_day":12000,"km_per_day":100,
    "extra_km_rate":60,"monthly_price":240000,"monthly_km":3000,"self_drive":false,
    "driver_available":true,"driver_price_per_day":3500,"documents":["nic"],"fuel_policy":"pay_used"}');

insert into ids select 'buddy', public.save_vehicle_listing(
  '{"title":"Suzuki Every Buddy Van","lat":7.0010,"lng":79.9530,"town":"Kadawatha",
    "is_available":false,"available_again_on":"2999-01-01"}',
  '{"vehicle_type":"buddy_van","make":"Suzuki","model":"Every","seats":5,"double_seat":true,
    "has_ac":true,"price_per_day":6000,"km_per_day":100,"extra_km_rate":45,"weekly_price":38000,
    "weekly_km":700}');

insert into ids select 'axio', public.save_vehicle_listing(
  '{"title":"Toyota Axio","lat":6.9553,"lng":79.9220,"town":"Kelaniya"}',
  '{"vehicle_type":"car","make":"Toyota","model":"Axio","seats":5,"has_ac":true,"price_per_day":8500}');

insert into ids select 'bus', public.save_vehicle_listing(
  '{"title":"Rosa Bus","lat":7.2906,"lng":80.6337,"town":"Kandy"}',
  '{"vehicle_type":"bus","make":"Toyota","model":"Coaster","seats":29,"has_ac":false,
    "price_per_day":25000,"km_per_day":150,"extra_km_rate":90,"self_drive":false,
    "driver_available":true,"driver_price_per_day":0}');

select test.eq((select count(*) from public.listings), 4::bigint, 'owner sees own listings');
select test.eq((select documents from public.vehicle_details v join ids on ids.id = v.listing_id
                where ids.name = 'kdh'), array['nic'], 'documents array stored');

-- Constraint checks.
select test.raises($$select public.save_vehicle_listing(
  '{"title":"Van","lat":7,"lng":80,"town":"Kandy"}',
  '{"vehicle_type":"van","make":"Toyota","model":"HiAce","seats":10,"double_seat":true,"price_per_day":9000}')$$,
  'vehicle_details_double_seat');
select test.raises($$select public.save_vehicle_listing(
  '{"title":"Van","lat":7,"lng":80,"town":"Kandy"}',
  '{"vehicle_type":"van","make":"Toyota","model":"HiAce","seats":10,"self_drive":false,"price_per_day":9000}')$$,
  'vehicle_details_hire_mode');
select test.raises($$select public.save_vehicle_listing(
  '{"title":"Van","lat":7,"lng":80,"town":"Kandy"}',
  '{"vehicle_type":"van","make":"Toyota","model":"HiAce","seats":10,"km_per_day":100,"price_per_day":9000}')$$,
  'vehicle_details_extra_km');
-- Owners can't hide/unhide (admin only).
select test.raises($$update public.listings set is_hidden = true$$, 'permission denied');

-- Owner can update via save_vehicle_listing.
select public.save_vehicle_listing(
  '{"title":"Toyota Axio 2015","lat":6.9553,"lng":79.9220,"town":"Kelaniya"}',
  '{"vehicle_type":"car","make":"Toyota","model":"Axio","year":2015,"seats":5,"has_ac":true,"price_per_day":8000}',
  (select id from ids where name = 'axio'));
select test.eq((select price_per_day from public.vehicle_details v join ids on ids.id = v.listing_id
                where ids.name = 'axio'), 8000, 'update saved');

-- Owner B has no phone: can't list ------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select test.raises($$select public.save_vehicle_listing(
  '{"title":"Car","lat":7,"lng":80,"town":"Kandy"}',
  '{"vehicle_type":"car","make":"Toyota","model":"Vitz","seats":4,"price_per_day":5000}')$$,
  'phone_required');
-- ...and can't see or touch A's listings.
select test.eq((select count(*) from public.listings), 0::bigint, 'B sees no listings');
update public.listings set title = 'hacked';
select test.raises($$insert into public.listings (title, lat, lng, town, owner_id)
  values ('x', 7, 80, 'Kandy', '00000000-0000-0000-0000-00000000000a')$$, 'permission denied');
select test.raises($$select public.save_vehicle_listing(
  '{"title":"hacked","lat":7,"lng":80,"town":"Kandy"}',
  '{"vehicle_type":"car","make":"x","model":"x","seats":4,"price_per_day":1}',
  (select id from ids where name = 'kdh'))$$, 'phone_required');
update public.profiles set phone = '0711111111' where id = auth.uid();
select test.raises($$select public.save_vehicle_listing(
  '{"title":"hacked","lat":7,"lng":80,"town":"Kandy"}',
  '{"vehicle_type":"car","make":"x","model":"x","seats":4,"price_per_day":1}',
  (select id from ids where name = 'kdh'))$$, 'listing_not_found');
select test.eq((select count(*) from public.profiles), 1::bigint, 'B only reads own profile');

-- Visitors (anon) -------------------------------------------------------------
reset request.jwt.claim.sub;
set role anon;

select test.raises($$select * from public.listings$$, 'permission denied');
select test.raises($$select * from public.profiles$$, 'permission denied');
select test.raises($$select * from public.get_listing_contact(
  (select id from ids where name = 'kdh'), 'call')$$, 'permission denied');
select test.raises($$select public.save_vehicle_listing('{}', '{}')$$, 'permission denied');

-- Search from Kiribathgoda junction. Buddy van is switched off, so 3 results,
-- nearest first.
select test.eq((select array_agg(title order by distance_km)
                from public.search_vehicles(7.0000, 79.9300)),
               array['Toyota KDH High Roof', 'Toyota Axio 2015', 'Rosa Bus'], 'nearest first');
select test.eq((select title from public.search_vehicles(7.0000, 79.9300) limit 1),
               'Toyota KDH High Roof', 'order kept by function');
select test.eq((select total_count from public.search_vehicles(7.0000, 79.9300, page_size => 1)),
               3::bigint, 'total_count ignores paging');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, search_text => ' kandy ')),
               1::bigint, 'text search matches town');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, search_text => 'toyota')),
               3::bigint, 'text search matches make');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, search_text => '%')),
               0::bigint, 'wildcards are escaped');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, radius_km => 25)),
               2::bigint, 'radius excludes Kandy');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, vehicle_types => '{van,bus}')),
               2::bigint, 'type filter');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, driver_mode => 'self_drive')),
               1::bigint, 'self-drive filter');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, driver_mode => 'with_driver')),
               2::bigint, 'with-driver filter');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, ac_only => true)),
               2::bigint, 'AC filter');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, min_seats => 10)),
               2::bigint, 'seats filter');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, max_price_per_day => 10000)),
               1::bigint, 'price filter');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, unlimited_km_only => true)),
               1::bigint, 'unlimited km filter');
select test.eq((select array_agg(title) from public.search_vehicles(7.0000, 79.9300, sort_by => 'price')),
               array['Toyota Axio 2015', 'Toyota KDH High Roof', 'Rosa Bus'], 'price sort');
select test.eq((select distance_km from public.search_vehicles(7.0000, 79.9300) limit 1),
               0.9::double precision, 'distance rounded to 0.1 km');

-- Vehicle page.
select test.eq((select owner_name from public.get_vehicle((select id from ids where name = 'kdh'))),
               'Sunil Perera', 'get_vehicle returns owner name');
select test.eq((select count(*) from public.get_vehicle((select id from ids where name = 'buddy'))),
               0::bigint, 'switched-off listing not public');

-- Back-on date reached (Sri Lanka time) -> live again ---------------------------
reset role;
update public.listings set available_again_on = (now() at time zone 'Asia/Colombo')::date
where id = (select id from ids where name = 'buddy');
set role anon;
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300)), 4::bigint,
               'back-on date brings listing back');
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300, double_seat_only => true)),
               1::bigint, 'double seat filter');

-- Admin hides a listing.
reset role;
update public.listings set is_hidden = true where id = (select id from ids where name = 'bus');
set role anon;
select test.eq((select count(*) from public.search_vehicles(7.0000, 79.9300)), 3::bigint,
               'hidden listing removed from search');

-- Customer C messages an owner (phone numbers come after a booking) --------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select test.raises($$select * from public.get_listing_contact(
  (select id from ids where name = 'kdh'), 'call')$$, 'contact_after_booking');
select public.send_message(public.start_conversation((select id from ids where name = 'kdh')), 'Is it free on Friday?');
select public.send_message(public.start_conversation((select id from ids where name = 'kdh')), 'For 3 days.');
select test.raises($$select public.start_conversation((select id from ids where name = 'bus'))$$,
                   'listing_not_available');
select test.eq((select count(*) from public.contact_events), 0::bigint, 'customer cannot read contact log');

-- Owner A sees the contact count and can preview a hidden listing.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select test.eq((select count(*) from public.contact_events), 1::bigint, 'chatting counts as one contact a day');
select test.eq((select count(*) from public.get_vehicle((select id from ids where name = 'bus'))),
               1::bigint, 'owner can preview own hidden listing');
select test.eq((select is_live from public.get_vehicle((select id from ids where name = 'bus'))),
               false, 'preview shows it is not live');

-- Owner deletes a listing; details and photos cascade.
insert into public.listing_photos (listing_id, path) values ((select id from ids where name = 'axio'), 'a/b/c.jpg');
delete from public.listings where id = (select id from ids where name = 'axio');
reset role;
select test.eq((select count(*) from public.vehicle_details), 3::bigint, 'details cascade on delete');
select test.eq((select count(*) from public.listing_photos), 0::bigint, 'photos cascade on delete');

-- Storage policy: users can only write inside their own folder.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into storage.objects (bucket_id, name) values
  ('listing-photos', '00000000-0000-0000-0000-00000000000a/l1/photo.jpg');
select test.raises($$insert into storage.objects (bucket_id, name) values
  ('listing-photos', '00000000-0000-0000-0000-00000000000c/l1/photo.jpg')$$, 'row-level security');
reset role;
