-- Tests for profile photos. Runs after test_pickup.sql (helpers in schema "test").

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000003a1', 'o4@x.lk', '{"full_name":"Chaminda Owner"}'),
  ('00000000-0000-0000-0000-0000000003b1', 'c6@x.lk', '{"full_name":"Dilani Customer"}');
update public.profiles set phone = '0770000001' where id in (
  '00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-0000000003b1');

create temp table av (name text primary key, id uuid);
grant all on av to anon, authenticated;
with ins as (
  insert into public.listings (owner_id, title, lat, lng, town)
  values ('00000000-0000-0000-0000-0000000003a1', 'Toyota Hiace', 6.93, 79.85, 'Colombo')
  returning id
)
insert into av select 'van', id from ins;
insert into public.vehicle_details (listing_id, vehicle_type, make, model, seats, price_per_day)
select id, 'van', 'Toyota', 'Hiace', 12, 11000 from av where name = 'van';

set role authenticated;
select test.as_user('00000000-0000-0000-0000-0000000003a1');

-- Only a photo in your own folder is accepted.
select test.raises($$update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000003b1/avatar-1.jpg'
                     where id = '00000000-0000-0000-0000-0000000003a1'$$, 'profiles_avatar_path_check');
select test.raises($$update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000003a1/x.jpg'
                     where id = '00000000-0000-0000-0000-0000000003a1'$$, 'profiles_avatar_path_check');
update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000003a1/avatar-1727000000000.jpg'
  where id = '00000000-0000-0000-0000-0000000003a1';
-- Someone else's row can't be changed.
update public.profiles set full_name = 'Hacked' where id = '00000000-0000-0000-0000-0000000003b1';

select test.eq((select owner_avatar from public.get_vehicle((select id from av where name = 'van'))),
               '00000000-0000-0000-0000-0000000003a1/avatar-1727000000000.jpg', 'vehicle page shows owner photo');

-- The customer sees the owner's photo on the booking, chat header and inbox.
select test.as_user('00000000-0000-0000-0000-0000000003b1');
insert into av values ('b1', public.request_booking((select id from av where name = 'van'),
                                                    ((now() at time zone 'Asia/Colombo')::date + 5), 2,
                                                    pickup => 'night_before'));
select test.eq((select other_avatar from public.get_booking((select id from av where name = 'b1'))),
               '00000000-0000-0000-0000-0000000003a1/avatar-1727000000000.jpg', 'booking shows owner photo');
select test.eq((select other_avatar from public.get_conversation(public.open_booking_chat((select id from av where name = 'b1')))),
               '00000000-0000-0000-0000-0000000003a1/avatar-1727000000000.jpg', 'chat header shows owner photo');
select test.eq((select other_avatar from public.my_conversations() where listing_id = (select id from av where name = 'van')),
               '00000000-0000-0000-0000-0000000003a1/avatar-1727000000000.jpg', 'inbox shows owner photo');

-- The customer has no photo, so the owner gets null.
select test.as_user('00000000-0000-0000-0000-0000000003a1');
select test.eq((select other_avatar from public.get_booking((select id from av where name = 'b1'))), null::text,
               'no photo is null');

-- Anonymous visitors still get the vehicle page.
reset role;
set role anon;
select test.eq((select count(*) from public.get_vehicle((select id from av where name = 'van'))), 1::bigint,
               'anon can open the vehicle page');
reset role;
select test.eq((select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000003b1'),
               'Dilani Customer', 'other profiles are not writable');
