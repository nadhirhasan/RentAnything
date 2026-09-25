-- Tests for reports, moderation, reviews, the contact limit and account
-- deletion. Runs after test.sql's helpers exist (schema "test").

-- Users: A owner, B/C/D customers, E admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@x.lk', '{"full_name":"Sunil Perera"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@x.lk', '{"full_name":"Kasun Silva"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@x.lk', '{"full_name":"Nimal"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@x.lk', '{"full_name":"Dilani Fernando"}'),
  ('00000000-0000-0000-0000-0000000000e1', 'e@x.lk', '{"full_name":"Admin"}');
update public.profiles set phone = '0771234567' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000000e1';

-- 32 live vans owned by A (L0 is the one under test).
create temp table l (n int primary key, id uuid);
grant all on l to anon, authenticated;
with ins as (
  insert into public.listings (owner_id, title, lat, lng, town)
  select '00000000-0000-0000-0000-0000000000a1', 'Van ' || g, 7, 79.93, 'Kadawatha'
  from generate_series(0, 31) g
  returning id, (regexp_match(title, '\d+'))[1]::int as n
)
insert into l select n, id from ins;
insert into public.vehicle_details (listing_id, vehicle_type, make, model, seats, price_per_day)
select id, 'van', 'Toyota', 'KDH', 14, 10000 from l;

create function test.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
end $$;
grant execute on function test.as_user to anon, authenticated;

-- Reports ---------------------------------------------------------------------
set role authenticated;
select test.as_user('00000000-0000-0000-0000-0000000000a1');
select test.raises($$select public.report_listing((select id from l where n = 0), 'other')$$, 'cannot_report_own');
select test.raises($$select * from public.admin_report_queue()$$, 'admin_only');
select test.raises($$select * from public.reports$$, 'permission denied');

select test.as_user('00000000-0000-0000-0000-0000000000b1');
select public.report_listing((select id from l where n = 0), 'fake_or_scam', 'Owner asked for advance payment');
select public.report_listing((select id from l where n = 0), 'wrong_details', 'updated note'); -- same person: updates
select test.as_user('00000000-0000-0000-0000-0000000000c1');
select public.report_listing((select id from l where n = 0), 'fake_or_scam');
select test.eq((select count(*) from public.search_vehicles(7, 79.93, page_size => 50) where title = 'Van 0'),
               1::bigint, '2 reporters: still visible');
select test.as_user('00000000-0000-0000-0000-0000000000d1');
select public.report_listing((select id from l where n = 0), 'not_available');
select test.eq((select count(*) from public.search_vehicles(7, 79.93, page_size => 50) where title = 'Van 0'),
               0::bigint, '3 reporters: auto-hidden');

-- Owner sees why it's hidden (get_vehicle works for owners).
select test.as_user('00000000-0000-0000-0000-0000000000a1');
select test.eq((select hidden_reason from public.get_vehicle((select id from l where n = 0))),
               'reports', 'owner sees hidden_reason');

-- Admin queue and moderation.
select test.as_user('00000000-0000-0000-0000-0000000000e1');
select test.eq((select open_count from public.admin_report_queue() where title = 'Van 0'), 3, 'queue counts reports');
select test.eq((select reports -> 0 ->> 'reason' from public.admin_report_queue() where title = 'Van 0'),
               'not_available', 'newest report first');
select test.eq((select count(*) from public.admin_hidden_listings() where title = 'Van 0'), 1::bigint, 'hidden list');
select public.admin_moderate_listing((select id from l where n = 0), 'dismiss');
select test.eq((select count(*) from public.admin_report_queue()), 0::bigint, 'dismiss clears queue');
select test.eq((select count(*) from public.search_vehicles(7, 79.93, page_size => 50) where title = 'Van 0'),
               1::bigint, 'dismiss un-hides an auto-hidden listing');
select public.admin_moderate_listing((select id from l where n = 0), 'hide');
select test.eq((select hidden_reason from public.admin_hidden_listings() where title = 'Van 0'), 'admin', 'admin hide');
select public.admin_moderate_listing((select id from l where n = 0), 'unhide');
select test.eq((select count(*) from public.admin_hidden_listings() where title = 'Van 0'), 0::bigint, 'unhide');

-- Report limit: 10 per person per day.
select test.as_user('00000000-0000-0000-0000-0000000000c1');
select public.report_listing(id, 'other') from l where n between 1 and 9;
select test.raises($$select public.report_listing((select id from l where n = 10), 'other')$$, 'report_limit');

-- Contact limit: 30 new conversations per day ------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000000d1');
select count(*) from l, public.send_message(public.start_conversation(l.id), 'Hi, is it available?')
where n between 1 and 30;
select test.raises($$select public.start_conversation((select id from l where n = 31))$$, 'contact_limit');
-- A conversation that already exists still opens.
select test.eq(public.start_conversation((select id from l where n = 5)) is not null, true, 'existing conversation opens');

-- Reviews ------------------------------------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000000b1');
select test.eq((select eligibility from public.my_review_status((select id from l where n = 0))),
               'not_contacted', 'must contact first');
select test.raises($$select public.submit_review((select id from l where n = 0), 5::smallint)$$, 'review_not_contacted');
select public.send_message(public.start_conversation((select id from l where n = 0)), 'Is it free on Friday?');
select test.eq((select eligibility from public.my_review_status((select id from l where n = 0))),
               'too_soon', 'wait a day after contacting');
reset role;
update public.contact_events set created_at = now() - interval '2 days'
where user_id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1');
set role authenticated;
select test.eq((select eligibility from public.my_review_status((select id from l where n = 0))),
               'ok', 'can review after a day');
select test.eq((select count(*) from public.my_review_invites()), 1::bigint, 'invite listed');
select public.submit_review((select id from l where n = 0), 5::smallint, 5::smallint, 4::smallint, 5::smallint,
                            array['clean', 'on_time'], 'Great van, driver was on time.');
select public.submit_review((select id from l where n = 0), 4::smallint, comment => 'Edited: good van.');
select test.eq((select count(*) from public.list_reviews((select id from l where n = 0))), 1::bigint, 'one review per person');
select test.eq((select comment from public.list_reviews((select id from l where n = 0))), 'Edited: good van.', 'review edited');
select test.eq((select reviewer_name from public.list_reviews((select id from l where n = 0))), 'Kasun S.', 'short name');
select test.eq((select verified from public.list_reviews((select id from l where n = 0))), false, 'not verified yet');
select test.eq((select count(*) from public.my_review_invites()), 0::bigint, 'invite gone after review');
select test.raises($$select public.submit_review((select id from l where n = 0), 6::smallint)$$, 'reviews_rating_check');
select test.raises($$select public.submit_review((select id from l where n = 0), 5::smallint, tags => array['bribe'])$$, 'reviews_tags_check');

-- Owner confirms the hire -> verified.
select test.as_user('00000000-0000-0000-0000-0000000000a1');
select test.eq((select name from public.recent_contacts((select id from l where n = 0))), 'Kasun S.', 'recent contacts');
select public.confirm_hire((select id from l where n = 0), '00000000-0000-0000-0000-0000000000b1');
select test.raises($$select public.confirm_hire((select id from l where n = 0), '00000000-0000-0000-0000-0000000000c1')$$,
                   'customer_not_contacted');
select test.eq((select verified from public.list_reviews((select id from l where n = 0))), true, 'verified hire');
select public.reply_to_review((select id from public.list_reviews((select id from l where n = 0))), 'Thank you Kasun!');
select test.eq((select owner_reply from public.list_reviews((select id from l where n = 0))), 'Thank you Kasun!', 'owner reply');
select test.as_user('00000000-0000-0000-0000-0000000000b1');
select test.raises($$select public.reply_to_review((select id from public.list_reviews((select id from l where n = 0))), 'x')$$,
                   'review_not_found');
select test.raises($$select public.recent_contacts((select id from l where n = 0))$$, 'listing_not_found');

-- Rating shows only from 3 reviews.
set role anon;
select test.eq((select rating_avg from public.get_vehicle((select id from l where n = 0))), null::numeric, 'no avg with 1 review');
select test.eq((select rating_count from public.get_vehicle((select id from l where n = 0))), 1, 'count with 1 review');
reset role;
insert into public.reviews (listing_id, reviewer_id, rating) values
  ((select id from l where n = 0), '00000000-0000-0000-0000-0000000000c1', 1),
  ((select id from l where n = 0), '00000000-0000-0000-0000-0000000000d1', 5);
set role anon;
-- (3*4 + 4+1+5) / 6 = 3.7
select test.eq((select rating_avg from public.get_vehicle((select id from l where n = 0))), 3.7, 'weighted average');
select test.eq((select verified_count from public.get_vehicle((select id from l where n = 0))), 1, 'verified count');
select test.eq((select owner_rating_count from public.get_vehicle((select id from l where n = 0))), 3, 'owner rating');
select test.eq((select rating_avg from public.search_vehicles(7, 79.93, sort_by => 'rating') limit 1), 3.7,
               'rated vehicle sorts first by rating');
select test.eq((select count(*) from public.list_reviews((select id from l where n = 0))), 3::bigint, 'anon sees reviews');
select test.raises($$select public.submit_review((select id from l where n = 0), 5::smallint)$$, 'permission denied');
select test.raises($$select public.report_listing((select id from l where n = 0), 'other')$$, 'permission denied');

-- Report a review 3 times -> hidden.
set role authenticated;
select test.as_user('00000000-0000-0000-0000-0000000000a1');
select public.report_review((select id from public.list_reviews((select id from l where n = 0)) where reviewer_name = 'Nimal'), 'offensive');
select test.as_user('00000000-0000-0000-0000-0000000000e1');
select public.report_review((select id from public.list_reviews((select id from l where n = 0)) where reviewer_name = 'Nimal'), 'offensive');
select test.as_user('00000000-0000-0000-0000-0000000000b1');
select public.report_review((select id from public.list_reviews((select id from l where n = 0)) where reviewer_name = 'Nimal'), 'offensive');
select test.eq((select count(*) from public.list_reviews((select id from l where n = 0))), 2::bigint, 'reported review hidden');
select test.as_user('00000000-0000-0000-0000-0000000000e1');
select test.eq((select reports -> 0 ->> 'review_comment' from public.admin_report_queue() where title = 'Van 0'), '', 'review reports in queue');
select public.admin_moderate_review((select (reports -> 0 ->> 'review_id')::bigint from public.admin_report_queue() where title = 'Van 0'), 'dismiss');
select test.eq((select count(*) from public.list_reviews((select id from l where n = 0))), 3::bigint, 'dismiss restores review');

-- Contacted-but-didn't-rent feedback.
select test.as_user('00000000-0000-0000-0000-0000000000d1');
select public.submit_contact_feedback((select id from l where n = 1), false, null);
select test.eq((select my_feedback ->> 'owner_answered' from public.my_review_status((select id from l where n = 1))),
               'false', 'feedback saved');

-- Review window closes 60 days after the last contact.
reset role;
update public.contact_events set created_at = now() - interval '61 days'
where user_id = '00000000-0000-0000-0000-0000000000d1';
set role authenticated;
select test.eq((select eligibility from public.my_review_status((select id from l where n = 2))), 'expired', 'expired');

-- Account deletion cascades.
select public.delete_my_account();
reset role;
select test.eq((select count(*) from auth.users where id = '00000000-0000-0000-0000-0000000000d1'), 0::bigint, 'user deleted');
select test.eq((select count(*) from public.reviews where reviewer_id = '00000000-0000-0000-0000-0000000000d1'), 0::bigint,
               'their reviews deleted');
select test.eq((select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'), 0::bigint,
               'their profile deleted');
