-- Tests for pickup time: collect the evening before, return on the last night.
-- Runs after test.sql (helpers in schema "test").

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000002a1', 'o3@x.lk', '{"full_name":"Priyantha Owner"}'),
  ('00000000-0000-0000-0000-0000000002b1', 'c3@x.lk', '{"full_name":"Tharindu Customer"}'),
  ('00000000-0000-0000-0000-0000000002b2', 'c4@x.lk', '{"full_name":"Ishara Customer"}'),
  ('00000000-0000-0000-0000-0000000002b3', 'c5@x.lk', '{"full_name":"Nadeeka Customer"}');
update public.profiles set phone = '0770000001' where id in (
  '00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-0000000002b1',
  '00000000-0000-0000-0000-0000000002b2', '00000000-0000-0000-0000-0000000002b3');

create temp table pv (name text primary key, id uuid);
grant all on pv to anon, authenticated;
with ins as (
  insert into public.listings (owner_id, title, lat, lng, town)
  values ('00000000-0000-0000-0000-0000000002a1', 'Nissan Caravan', 7.29, 80.63, 'Kandy')
  returning id
)
insert into pv select 'van', id from ins;
insert into public.vehicle_details (listing_id, vehicle_type, make, model, seats, price_per_day)
select id, 'van', 'Nissan', 'Caravan', 14, 12000 from pv where name = 'van';

create temp table pd as select (now() at time zone 'Asia/Colombo')::date as today;
grant select on pd to anon, authenticated;

set role authenticated;
select test.as_user('00000000-0000-0000-0000-0000000002b1');

-- A trip today can't be collected "the evening before".
select test.raises($$select public.request_booking((select id from pv where name = 'van'), (select today from pd), 1,
                                                   pickup => 'night_before')$$, 'booking_pickup_passed');
select test.raises($$select public.request_booking((select id from pv where name = 'van'), (select today + 3 from pd), 1,
                                                   pickup => 'noon')$$, 'booking_bad_pickup');

-- Trip on day+1, collected tonight, back the night of day+1: 1 day.
insert into pv values ('b1', public.request_booking((select id from pv where name = 'van'), (select today + 1 from pd), 1,
                                                    pickup => 'night_before'));
select test.eq((select pickup from public.get_booking((select id from pv where name = 'b1'))), 'night_before', 'pickup saved');
select test.eq((select estimate from public.get_booking((select id from pv where name = 'b1'))), 12000, 'one day');
select test.eq((select body from public.messages
                where conversation_id = public.open_booking_chat((select id from pv where name = 'b1'))
                order by id desc limit 1)
               like '%Collect on the evening of ' || to_char((select today from pd), 'Dy FMDD Mon')
                 || ' · return by the night of ' || to_char((select today + 1 from pd), 'Dy FMDD Mon') || '.',
               true, 'chat says when to collect and return');

-- The owner has to act today (handover tonight).
select test.as_user('00000000-0000-0000-0000-0000000002a1');
select public.respond_booking((select id from pv where name = 'b1'), true);
select test.eq((select needs_action from public.my_bookings(true) where id = (select id from pv where name = 'b1')), true,
               'owner hands over tonight');

-- Back-to-back: the next customer collects on the night this one comes back.
select test.as_user('00000000-0000-0000-0000-0000000002b2');
insert into pv values ('b2', public.request_booking((select id from pv where name = 'van'), (select today + 2 from pd), 2,
                                                    pickup => 'night_before'));
select test.as_user('00000000-0000-0000-0000-0000000002a1');
select public.respond_booking((select id from pv where name = 'b2'), true);
select test.eq((select state from public.get_booking((select id from pv where name = 'b2'))), 'accepted',
               'back-to-back bookings allowed');
select test.eq((select needs_action from public.my_bookings(true) where id = (select id from pv where name = 'b2')), false,
               'not yet: handover is tomorrow evening');

-- Morning pickup is still possible, and is the default.
select test.as_user('00000000-0000-0000-0000-0000000002b3');
insert into pv values ('b3', public.request_booking((select id from pv where name = 'van'), (select today + 10 from pd), 1));
select test.eq((select pickup from public.get_booking((select id from pv where name = 'b3'))), 'morning', 'default is morning');
