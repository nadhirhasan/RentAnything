-- Tests for chat, contact masking, push notifications and admin access.
-- Runs after test.sql (helpers in schema "test").

-- Users: O owner, C customer, X stranger, M admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001a1', 'o2@x.lk', '{"full_name":"Chaminda Silva"}'),
  ('00000000-0000-0000-0000-0000000001b1', 'c2@x.lk', '{"full_name":"Nuwan Fernando"}'),
  ('00000000-0000-0000-0000-0000000001c1', 'x2@x.lk', '{"full_name":"Other Person"}'),
  ('00000000-0000-0000-0000-0000000001e1', 'm2@x.lk', '{"full_name":"Admin Three"}');
update public.profiles set phone = '0712223333' where id = '00000000-0000-0000-0000-0000000001a1';
update public.profiles set phone = '0764445555' where id in (
  '00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001c1');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000001e1';

create temp table cv (name text primary key, id uuid);
grant all on cv to anon, authenticated;
with ins as (
  insert into public.listings (owner_id, title, lat, lng, town)
  values ('00000000-0000-0000-0000-0000000001a1', 'Toyota Hiace', 6.05, 80.22, 'Galle')
  returning id
)
insert into cv select 'van', id from ins;
insert into public.vehicle_details (listing_id, vehicle_type, make, model, seats, price_per_day)
select id, 'van', 'Toyota', 'Hiace', 12, 15000 from cv where name = 'van';

create temp table dd as select (now() at time zone 'Asia/Colombo')::date as today;
grant select on dd to anon, authenticated;

-- Masking -------------------------------------------------------------------------
select test.eq(public.mask_contacts('Call me on 077 123 4567 tomorrow'), 'Call me on ••• ••• •••• tomorrow', 'spaced number');
select test.eq(public.mask_contacts('+94771234567'), '••• ••• ••••', 'international number');
select test.eq(public.mask_contacts('077-123-4567'), '••• ••• ••••', 'dashed number');
select test.eq(public.mask_contacts('wa.me/94771234567 please'), '[link hidden] please', 'WhatsApp link');
select test.eq(public.mask_contacts('see https://fb.com/x'), 'see [link hidden]', 'link');
select test.eq(public.mask_contacts('mail kasun.p@gmail.com'), 'mail [email hidden]', 'email');
select test.eq(public.mask_contacts('Rs 12,000 a day, pickup 8.30 on 2026-10-12'),
               'Rs 12,000 a day, pickup 8.30 on 2026-10-12', 'prices, times and dates stay');

set role authenticated;

-- Starting a conversation -----------------------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000001a1');
select test.raises($$select public.start_conversation((select id from cv where name = 'van'))$$, 'conversation_own_listing');

select test.as_user('00000000-0000-0000-0000-0000000001b1');
insert into cv values ('chat', public.start_conversation((select id from cv where name = 'van')));
select test.eq(public.start_conversation((select id from cv where name = 'van')), (select id from cv where name = 'chat'),
               'one conversation per customer per vehicle');
select test.raises($$insert into public.messages (conversation_id, sender_id, body)
                     values ((select id from cv where name = 'chat'), auth.uid(), 'x')$$, 'permission denied');
select public.register_push_token('ExponentPushToken[customer-device-1]', 'android');
select test.raises($$select public.register_push_token('not-a-token', 'android')$$, 'push_token_invalid');

-- Before a booking, contact details are hidden.
select test.eq((public.send_message((select id from cv where name = 'chat'),
                'Hi! Is it free? Call me on 076 444 5555 or wa.me/94764445555') ->> 'masked'), 'true', 'masked');
select test.eq((select body from public.messages where conversation_id = (select id from cv where name = 'chat')
                order by id desc limit 1),
               'Hi! Is it free? Call me on ••• ••• •••• or [link hidden]', 'stored masked');
select test.eq((public.send_message((select id from cv where name = 'chat'), 'For 5 days from Monday?') ->> 'masked'),
               'false', 'normal message');
select test.raises($$select public.send_message((select id from cv where name = 'chat'), '   ')$$, 'message_invalid');
select test.raises($$select * from public.get_listing_contact((select id from cv where name = 'van'), 'call')$$,
                   'contact_after_booking');

-- The owner's inbox.
select test.as_user('00000000-0000-0000-0000-0000000001a1');
select test.eq((select unread from public.my_conversations() where id = (select id from cv where name = 'chat')), 2,
               'two unread');
select test.eq(public.my_unread_count(), 2, 'unread badge');
select test.eq((select other_name from public.get_conversation((select id from cv where name = 'chat'))), 'Nuwan F.',
               'short name before a booking');
select test.eq((select other_phone from public.get_conversation((select id from cv where name = 'chat'))), null::text,
               'no phone before a booking');
select test.eq((select count(*) from public.messages where conversation_id = (select id from cv where name = 'chat')),
               2::bigint, 'owner reads the messages');
select public.mark_conversation_read((select id from cv where name = 'chat'));
select test.eq(public.my_unread_count(), 0, 'read');

-- Replying sends a push to the customer's phone.
reset role;
select count(*) as before from net.test_requests \gset
set role authenticated;
select public.send_message((select id from cv where name = 'chat'), 'Yes, it is free. Send a booking request.');
reset role;
select test.eq((select count(*) from net.test_requests), :before + 1::bigint, 'push sent');
select test.eq((select body -> 0 ->> 'to' from net.test_requests order by id desc limit 1),
               'ExponentPushToken[customer-device-1]', 'to the customer');
select test.eq((select body -> 0 ->> 'title' from net.test_requests order by id desc limit 1),
               'Chaminda S. · Toyota Hiace', 'push title');
select test.eq((select body -> 0 -> 'data' ->> 'url' from net.test_requests order by id desc limit 1),
               '/chat/' || (select id from cv where name = 'chat'), 'push opens the chat');
set role authenticated;

-- Strangers can't see or write.
select test.as_user('00000000-0000-0000-0000-0000000001c1');
select test.eq((select count(*) from public.messages where conversation_id = (select id from cv where name = 'chat')),
               0::bigint, 'stranger reads nothing');
select test.raises($$select * from public.get_conversation((select id from cv where name = 'chat'))$$,
                   'conversation_not_found');
select test.raises($$select public.send_message((select id from cv where name = 'chat'), 'hi')$$,
                   'conversation_not_found');

-- Booking events appear in the chat ---------------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000001b1');
insert into cv values ('booking', public.request_booking((select id from cv where name = 'van'),
                                                         (select today + 2 from dd), 3));
select test.eq((select body from public.messages where conversation_id = (select id from cv where name = 'chat')
                order by id desc limit 1) like 'Booking request: %', true, 'request in the chat');
select test.eq(public.open_booking_chat((select id from cv where name = 'booking')), (select id from cv where name = 'chat'),
               'booking opens the same chat');

select test.as_user('00000000-0000-0000-0000-0000000001a1');
select public.register_push_token('ExpoPushToken[owner-device-1]', 'ios');
select public.respond_booking((select id from cv where name = 'booking'), true);
reset role;
select test.eq((select body -> 0 ->> 'title' from net.test_requests order by id desc limit 1), 'Booking accepted',
               'customer told');
set role authenticated;

-- After acceptance, numbers are shared.
select test.as_user('00000000-0000-0000-0000-0000000001b1');
select test.eq((public.send_message((select id from cv where name = 'chat'), 'My number is 076 444 5555') ->> 'masked'),
               'false', 'numbers allowed after acceptance');
select test.eq((select other_phone from public.get_conversation((select id from cv where name = 'chat'))), '0712223333',
               'owner phone shown');
select test.eq((select other_name from public.get_conversation((select id from cv where name = 'chat'))), 'Chaminda Silva',
               'full name after acceptance');
select test.eq((select whatsapp from public.get_listing_contact((select id from cv where name = 'van'), 'whatsapp')),
               '0712223333', 'whatsapp falls back to phone');

-- Blocking --------------------------------------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000001a1');
select public.set_conversation_blocked((select id from cv where name = 'chat'), true);
select test.as_user('00000000-0000-0000-0000-0000000001b1');
select test.raises($$select public.send_message((select id from cv where name = 'chat'), 'hello?')$$, 'conversation_blocked');
select public.set_conversation_blocked((select id from cv where name = 'chat'), false); -- not theirs to undo
select test.eq((select blocked from public.get_conversation((select id from cv where name = 'chat'))), true, 'still blocked');
select test.as_user('00000000-0000-0000-0000-0000000001a1');
select public.set_conversation_blocked((select id from cv where name = 'chat'), false);

-- Admin access: only reported or disputed chats -------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000001c1');
insert into cv values ('other', public.start_conversation((select id from cv where name = 'van')));
select public.send_message((select id from cv where name = 'other'), 'Hello');
select test.raises($$select * from public.admin_chat_queue()$$, 'admin_only');

select test.as_user('00000000-0000-0000-0000-0000000001e1');
select test.raises($$select * from public.admin_read_conversation((select id from cv where name = 'other'))$$,
                   'chat_access_denied');
select test.eq((select count(*) from public.admin_chat_queue()), 0::bigint, 'nothing to review');

select test.as_user('00000000-0000-0000-0000-0000000001b1');
select public.report_conversation((select id from cv where name = 'chat'), 'rude_or_unsafe', 'Shouted at me');
select test.as_user('00000000-0000-0000-0000-0000000001e1');
select test.eq((select open_reports from public.admin_chat_queue() where conversation_id = (select id from cv where name = 'chat')),
               1, 'reported chat in the queue');
select test.eq((select count(*) from public.admin_read_conversation((select id from cv where name = 'chat'))
                where sender = 'system'), 2::bigint, 'admin sees booking updates');
select test.eq((select sender from public.admin_read_conversation((select id from cv where name = 'chat')) order by id limit 1),
               'customer', 'first message from the customer');
reset role;
select test.eq((select count(*) from public.admin_chat_access
                where conversation_id = (select id from cv where name = 'chat')), 2::bigint, 'every read logged');
set role authenticated;
select public.admin_resolve_chat_reports((select id from cv where name = 'chat'), 'block');
select test.eq((select count(*) from public.admin_chat_queue()), 0::bigint, 'queue cleared');

-- Rate limit: 60 messages in 10 minutes ---------------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000001c1');
select count(*) from generate_series(2, 60) g, public.send_message((select id from cv where name = 'other'), 'msg ' || g);
select test.raises($$select public.send_message((select id from cv where name = 'other'), 'one more')$$, 'message_limit');

-- Payment answers are pushed to the owner --------------------------------------------
select test.as_user('00000000-0000-0000-0000-0000000001a1');
select public.report_dues_payment(1000, 'bank', 'TX-1');
select test.as_user('00000000-0000-0000-0000-0000000001e1');
select public.admin_review_payment(((select pending_payment from public.admin_dues_overview()
  where owner_id = '00000000-0000-0000-0000-0000000001a1') ->> 'id')::bigint, true);
reset role;
select test.eq((select body -> 0 ->> 'title' from net.test_requests order by id desc limit 1), 'Payment received',
               'owner told about the payment');

-- Signing out removes the device.
set role authenticated;
select test.as_user('00000000-0000-0000-0000-0000000001a1');
select public.unregister_push_token('ExpoPushToken[owner-device-1]');
reset role;
select test.eq((select count(*) from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000001a1'),
               0::bigint, 'token removed');
