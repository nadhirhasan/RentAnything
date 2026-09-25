-- In-app chat and push notifications (docs/SPEC.md §13).
--
--   * Customers reach owners through chat. Phone numbers are shared only once
--     the owner accepts a booking; before that, phone numbers, emails and
--     links typed in chat are hidden.
--   * Booking events appear in the chat as system messages.
--   * RentAnything can read a conversation only when it is reported or part
--     of a booking dispute, and every read is logged.
--   * Push notifications go through Expo's push service, sent from the
--     database with pg_net (async, never blocks the write).

-- pg_net isn't available on plain Postgres; the tests stub net.http_post.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

alter type public.contact_channel add value if not exists 'chat';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One conversation per customer per listing.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  last_message_at timestamptz,
  last_message text not null default '',       -- preview for the inbox
  last_sender_id uuid,                          -- null = system message
  owner_read_at timestamptz,
  customer_read_at timestamptz,
  blocked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (listing_id, customer_id),
  check (owner_id <> customer_id)
);

create index conversations_owner_idx on public.conversations (owner_id, last_message_at desc);
create index conversations_customer_idx on public.conversations (customer_id, last_message_at desc);
create index conversations_blocked_by_idx on public.conversations (blocked_by);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete cascade, -- null = system message
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text not null check (char_length(body) between 1 and 2000),
  -- Contact details were hidden from this message.
  masked boolean not null default false,
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, id desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_booking_idx on public.messages (booking_id);

create table public.conversation_reports (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason public.report_reason not null,
  note text not null default '' check (char_length(note) <= 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, reporter_id)
);

create index conversation_reports_reporter_idx on public.conversation_reports (reporter_id, created_at desc);

create trigger conversation_reports_updated_at before update on public.conversation_reports
  for each row execute function public.set_updated_at();

-- Every time an admin opens a conversation.
create table public.admin_chat_access (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index admin_chat_access_admin_idx on public.admin_chat_access (admin_id);
create index admin_chat_access_conversation_idx on public.admin_chat_access (conversation_id);

create table public.push_tokens (
  token text primary key check (char_length(token) <= 200),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reports enable row level security;
alter table public.admin_chat_access enable row level security;
alter table public.push_tokens enable row level security;
revoke all on public.conversations, public.messages, public.conversation_reports,
  public.admin_chat_access, public.push_tokens
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_conversation_member(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations
    where id = p_conversation and (select auth.uid()) in (owner_id, customer_id)
  )
$$;

-- Participants read messages directly (needed for Realtime); all writes go
-- through send_message().
create policy "messages: participants read" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
grant select on public.messages to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Phone numbers are shared once the owner has accepted a booking between
-- these two people for this vehicle.
create function public.conversation_unlocked(p_listing uuid, p_customer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.listing_id = p_listing and b.customer_id = p_customer
      and (b.status in ('accepted', 'started', 'no_deal')
           or (b.status = 'cancelled' and b.responded_at is not null))
  )
$$;

-- Hides links, emails and phone numbers (9+ digits, optionally separated by
-- single spaces, dots or dashes). Prices and dates are left alone.
create function public.mask_contacts(p_text text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(p_text, '(https?://|www\.)\S+|\m(wa|t)\.me/\S*', '[link hidden]', 'gi'),
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email hidden]', 'g'),
    '\+?\d([\s.-]?\d){8,}', '••• ••• ••••', 'g')
$$;

-- Sends a push notification to all of a user's devices. Never raises.
create function public.notify_user(p_user uuid, p_title text, p_body text, p_data jsonb default '{}')
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_messages jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', left(p_title, 80),
    'body', left(p_body, 180),
    'data', coalesce(p_data, '{}'::jsonb),
    'sound', 'default',
    'priority', 'high',
    'channelId', 'default'
  ))
  into v_messages
  from public.push_tokens t where t.user_id = p_user;
  if v_messages is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
exception when others then
  raise warning 'push not sent: %', sqlerrm;
end $$;

-- Adds a message from RentAnything (booking updates) to a conversation.
create function public.post_system_message(p_conversation uuid, p_body text, p_booking uuid, p_actor uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.messages (conversation_id, sender_id, kind, body, booking_id)
  values (p_conversation, null, 'system', p_body, p_booking);
  update public.conversations c set
    last_message_at = now(),
    last_message = left(p_body, 140),
    last_sender_id = null,
    -- The person who caused the update has seen it.
    owner_read_at = case when p_actor = c.owner_id then now() else c.owner_read_at end,
    customer_read_at = case when p_actor = c.customer_id then now() else c.customer_read_at end
  where c.id = p_conversation;
end $$;

-- ---------------------------------------------------------------------------
-- Chat API
-- ---------------------------------------------------------------------------

-- The customer's conversation about a listing (created if needed).
create function public.start_conversation(listing_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  l public.listings;
  v_id uuid;
begin
  select c.id into v_id from public.conversations c
  where c.listing_id = start_conversation.listing_id and c.customer_id = v_uid;
  if v_id is not null then
    return v_id;
  end if;

  select * into l from public.listings where id = start_conversation.listing_id;
  if l.id is null or not public.is_live(l) then
    raise exception 'listing_not_available' using errcode = 'P0002';
  end if;
  if l.owner_id = v_uid then
    raise exception 'conversation_own_listing' using errcode = '42501';
  end if;
  -- Anti-scraping / spam: 30 new conversations a day.
  if (select count(*) from public.conversations c
      where c.customer_id = v_uid and c.created_at > now() - interval '1 day') >= 30 then
    raise exception 'contact_limit' using errcode = '54000';
  end if;

  insert into public.conversations (listing_id, owner_id, customer_id)
  values (l.id, l.owner_id, v_uid)
  on conflict (listing_id, customer_id) do nothing
  returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.conversations c
    where c.listing_id = l.id and c.customer_id = v_uid;
  end if;
  return v_id;
end $$;

-- The conversation for a booking (either side).
create function public.open_booking_chat(booking_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  b public.bookings;
  v_id uuid;
begin
  select * into b from public.bookings where id = open_booking_chat.booking_id;
  if b.id is null or v_uid not in (b.customer_id, b.owner_id) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  insert into public.conversations (listing_id, owner_id, customer_id)
  values (b.listing_id, b.owner_id, b.customer_id)
  on conflict (listing_id, customer_id) do nothing;
  select c.id into v_id from public.conversations c
  where c.listing_id = b.listing_id and c.customer_id = b.customer_id;
  return v_id;
end $$;

-- Returns {id, body, masked}. Hides contact details until a booking is accepted.
create function public.send_message(conversation_id uuid, body text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  c public.conversations;
  v_text text := trim(coalesce(send_message.body, ''));
  v_sent text;
  v_id bigint;
  v_name text;
  v_title text;
begin
  select * into c from public.conversations where id = send_message.conversation_id for update;
  if c.id is null or v_uid not in (c.owner_id, c.customer_id) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if c.blocked_by is not null then
    raise exception 'conversation_blocked' using errcode = '42501';
  end if;
  if v_text = '' or char_length(v_text) > 2000 then
    raise exception 'message_invalid' using errcode = '22023';
  end if;
  if (select count(*) from public.messages m
      where m.sender_id = v_uid and m.created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'message_limit' using errcode = '54000';
  end if;

  v_sent := case when public.conversation_unlocked(c.listing_id, c.customer_id)
                 then v_text else public.mask_contacts(v_text) end;

  insert into public.messages (conversation_id, sender_id, body, masked)
  values (c.id, v_uid, v_sent, v_sent <> v_text)
  returning id into v_id;

  update public.conversations set
    last_message_at = now(),
    last_message = left(v_sent, 140),
    last_sender_id = v_uid,
    owner_read_at = case when v_uid = c.owner_id then now() else owner_read_at end,
    customer_read_at = case when v_uid = c.customer_id then now() else customer_read_at end
  where id = c.id;

  -- Counts as contacting the owner (reviews, "Who rented it?"), once a day.
  if v_uid = c.customer_id and not exists (
    select 1 from public.contact_events e
    where e.listing_id = c.listing_id and e.user_id = v_uid and e.created_at > now() - interval '1 day'
  ) then
    insert into public.contact_events (listing_id, user_id, channel)
    values (c.listing_id, v_uid, 'chat');
  end if;

  select public.short_name(p.full_name) into v_name from public.profiles p where p.id = v_uid;
  select l.title into v_title from public.listings l where l.id = c.listing_id;
  perform public.notify_user(
    case when v_uid = c.owner_id then c.customer_id else c.owner_id end,
    v_name || ' · ' || v_title,
    v_sent,
    jsonb_build_object('url', '/chat/' || c.id)
  );

  return jsonb_build_object('id', v_id, 'body', v_sent, 'masked', v_sent <> v_text);
end $$;

create function public.mark_conversation_read(conversation_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  update public.conversations set
    owner_read_at = case when v_uid = owner_id then now() else owner_read_at end,
    customer_read_at = case when v_uid = customer_id then now() else customer_read_at end
  where id = mark_conversation_read.conversation_id and v_uid in (owner_id, customer_id);
end $$;

-- Inbox: conversations with at least one message, newest first.
create function public.my_conversations()
returns table (
  id uuid,
  listing_id uuid,
  title text,
  cover_photo text,
  role text,
  other_name text,
  last_message text,
  last_message_at timestamptz,
  last_is_mine boolean,
  unread integer,
  booking_state text,
  blocked boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  return query
    select
      c.id, c.listing_id, l.title,
      (select p.path from public.listing_photos p where p.listing_id = l.id
        order by p.position, p.created_at limit 1),
      case when c.owner_id = v_uid then 'owner' else 'customer' end,
      case when public.conversation_unlocked(c.listing_id, c.customer_id)
        then coalesce(nullif(trim(op.full_name), ''), public.short_name(op.full_name))
        else public.short_name(op.full_name) end,
      c.last_message, c.last_message_at,
      c.last_sender_id is not distinct from v_uid,
      (select count(*) from public.messages m
       where m.conversation_id = c.id and m.sender_id is distinct from v_uid
         and m.created_at > coalesce(
           case when c.owner_id = v_uid then c.owner_read_at else c.customer_read_at end,
           '-infinity'))::integer,
      (select public.booking_state(b) from public.bookings b
       where b.listing_id = c.listing_id and b.customer_id = c.customer_id
       order by b.created_at desc limit 1),
      c.blocked_by is not null
    from public.conversations c
    join public.listings l on l.id = c.listing_id
    left join public.profiles op
      on op.id = case when c.owner_id = v_uid then c.customer_id else c.owner_id end
    where v_uid in (c.owner_id, c.customer_id) and c.last_message_at is not null
    order by c.last_message_at desc
    limit 100;
end $$;

create function public.my_unread_count() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((
    select count(*) from public.messages m
    where m.conversation_id = c.id and m.sender_id is distinct from (select auth.uid())
      and m.created_at > coalesce(
        case when c.owner_id = (select auth.uid()) then c.owner_read_at else c.customer_read_at end,
        '-infinity')
  )), 0)::integer
  from public.conversations c
  where (select auth.uid()) in (c.owner_id, c.customer_id)
$$;

create function public.get_conversation(conversation_id uuid)
returns table (
  id uuid,
  role text,
  listing_id uuid,
  title text,
  town text,
  cover_photo text,
  price_per_day integer,
  other_name text,
  unlocked boolean,
  other_phone text,          -- once unlocked
  other_whatsapp text,
  other_read_at timestamptz, -- for "Seen"
  blocked boolean,
  blocked_by_me boolean,
  booking_id uuid,           -- latest booking between them
  booking_state text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  return query
    with c as (
      select c.*, public.conversation_unlocked(c.listing_id, c.customer_id) as is_open
      from public.conversations c
      where c.id = get_conversation.conversation_id and v_uid in (c.owner_id, c.customer_id)
    ), b as (
      select b.id, public.booking_state(b) as st
      from public.bookings b, c
      where b.listing_id = c.listing_id and b.customer_id = c.customer_id
      order by b.created_at desc limit 1
    )
    select
      c.id,
      case when c.owner_id = v_uid then 'owner' else 'customer' end,
      c.listing_id, l.title, l.town,
      (select p.path from public.listing_photos p where p.listing_id = l.id
        order by p.position, p.created_at limit 1),
      v.price_per_day,
      case when c.is_open then coalesce(nullif(trim(op.full_name), ''), public.short_name(op.full_name))
        else public.short_name(op.full_name) end,
      c.is_open,
      case when c.is_open then op.phone end,
      case when c.is_open then coalesce(op.whatsapp, op.phone) end,
      case when c.owner_id = v_uid then c.customer_read_at else c.owner_read_at end,
      c.blocked_by is not null,
      c.blocked_by is not distinct from v_uid,
      (select b.id from b),
      (select b.st from b)
    from c
    join public.listings l on l.id = c.listing_id
    join public.vehicle_details v on v.listing_id = l.id
    left join public.profiles op
      on op.id = case when c.owner_id = v_uid then c.customer_id else c.owner_id end;
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
end $$;

create function public.set_conversation_blocked(conversation_id uuid, blocked boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  if not public.is_conversation_member(set_conversation_blocked.conversation_id) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if set_conversation_blocked.blocked then
    update public.conversations set blocked_by = v_uid
    where id = set_conversation_blocked.conversation_id and blocked_by is null;
  else
    -- Only the person who blocked can unblock.
    update public.conversations set blocked_by = null
    where id = set_conversation_blocked.conversation_id and blocked_by = v_uid;
  end if;
end $$;

create function public.report_conversation(
  conversation_id uuid,
  reason public.report_reason,
  note text default ''
) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  if not public.is_conversation_member(report_conversation.conversation_id) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.conversation_reports r
      where r.reporter_id = v_uid and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'report_limit' using errcode = '54000';
  end if;
  insert into public.conversation_reports (conversation_id, reporter_id, reason, note)
  values (report_conversation.conversation_id, v_uid, report_conversation.reason,
          left(coalesce(report_conversation.note, ''), 500))
  on conflict (conversation_id, reporter_id)
  do update set reason = excluded.reason, note = excluded.note, status = 'open';
end $$;

-- ---------------------------------------------------------------------------
-- Push tokens
-- ---------------------------------------------------------------------------

create function public.register_push_token(token text, platform text) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  if register_push_token.token !~ '^Expo(nent)?PushToken\[[^\]]{10,150}\]$' then
    raise exception 'push_token_invalid' using errcode = '22023';
  end if;
  -- A device belongs to whoever signed in on it last.
  insert into public.push_tokens (token, user_id, platform)
  values (register_push_token.token, v_uid, register_push_token.platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  -- Keep the 10 most recent devices.
  delete from public.push_tokens t
  where t.user_id = v_uid and t.token not in (
    select t2.token from public.push_tokens t2 where t2.user_id = v_uid
    order by t2.updated_at desc limit 10
  );
end $$;

create function public.unregister_push_token(token text) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  delete from public.push_tokens t
  where t.token = unregister_push_token.token and t.user_id = (select auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- Booking and payment events -> chat messages and notifications
-- ---------------------------------------------------------------------------

create function public.booking_events() returns trigger
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_conv uuid;
  v_title text;
  v_range text;
  v_customer text;
  v_text text;
  v_actor uuid;
  v_notify uuid;
  v_push_title text;
  v_push_body text;
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return new;
  end if;

  select l.title into v_title from public.listings l where l.id = new.listing_id;
  select public.short_name(p.full_name) into v_customer from public.profiles p where p.id = new.customer_id;
  v_range := to_char(new.start_date, 'FMDD Mon')
    || case when new.days > 1 then ' – ' || to_char(new.end_date, 'FMDD Mon') else '' end;

  insert into public.conversations (listing_id, owner_id, customer_id)
  values (new.listing_id, new.owner_id, new.customer_id)
  on conflict (listing_id, customer_id) do nothing;
  select c.id into v_conv from public.conversations c
  where c.listing_id = new.listing_id and c.customer_id = new.customer_id;

  if tg_op = 'INSERT' then
    v_actor := new.customer_id;
    v_text := 'Booking request: ' || v_range || ' · ' || new.days || ' day'
      || case when new.days = 1 then '' else 's' end
      || case when new.with_driver then ' · with driver' else '' end;
    v_notify := new.owner_id;
    v_push_title := 'New booking request';
    v_push_body := v_customer || ' wants your ' || v_title || ' · ' || v_range;
  elsif new.status = 'accepted' then
    v_actor := new.owner_id;
    v_text := 'Booking accepted. You can now see each other''s phone number.';
    v_notify := new.customer_id;
    v_push_title := 'Booking accepted';
    v_push_body := v_title || ' · ' || v_range || '. Tap to see the owner''s number.';
  elsif new.status = 'declined' then
    v_actor := new.owner_id;
    v_text := case when new.close_reason = 'dates_taken'
      then 'Booking declined: those days were booked by someone else.'
      else 'Booking declined.' end;
    v_notify := new.customer_id;
    v_push_title := 'Booking declined';
    v_push_body := v_title || ' · ' || v_range;
  elsif new.status = 'cancelled' then
    v_actor := case when new.closed_by = 'customer' then new.customer_id else new.owner_id end;
    v_text := 'Booking cancelled by the ' || coalesce(new.closed_by, 'owner') || '.';
    v_notify := case when new.closed_by = 'customer' then new.owner_id else new.customer_id end;
    v_push_title := 'Booking cancelled';
    v_push_body := v_title || ' · ' || v_range;
  elsif new.status = 'no_deal' then
    v_actor := case when new.closed_by = 'customer' then new.customer_id else new.owner_id end;
    v_text := 'Marked as no deal.';
    v_notify := case when new.closed_by = 'customer' then new.owner_id else new.customer_id end;
    v_push_title := 'No deal';
    v_push_body := v_title || ' · ' || v_range;
  elsif new.status = 'started' then
    v_actor := new.owner_id;
    v_text := 'Rental started'
      || case when new.agreed_total is not null
           then ' · Rs ' || to_char(new.agreed_total, 'FM999,999,999') || ' agreed' else '' end || '.';
    v_notify := new.customer_id;
    v_push_title := 'Rental started';
    v_push_body := 'Enjoy your trip! ' || v_title || ' · ' || v_range;
  else
    return new;
  end if;

  perform public.post_system_message(v_conv, v_text, new.id, v_actor);
  perform public.notify_user(v_notify, v_push_title, v_push_body,
                             jsonb_build_object('url', '/booking/' || new.id));
  return new;
end $$;

create trigger bookings_events after insert or update of status on public.bookings
  for each row execute function public.booking_events();

create function public.dues_payment_events() returns trigger
language plpgsql volatile security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public.notify_user(
      new.owner_id,
      case when new.status = 'approved' then 'Payment received' else 'Payment not received' end,
      'Rs ' || to_char(new.amount, 'FM999,999,999')
        || case when new.status = 'approved' then ' was added to your account. Thank you!'
                else '. ' || coalesce(nullif(new.admin_note, ''), 'Please contact support.') end,
      jsonb_build_object('url', '/dues')
    );
  end if;
  return new;
end $$;

create trigger dues_payments_events after update of status on public.dues_payments
  for each row execute function public.dues_payment_events();

-- ---------------------------------------------------------------------------
-- Owner phone numbers only after an accepted booking
-- ---------------------------------------------------------------------------

create or replace function public.get_listing_contact(
  listing_id uuid,
  channel public.contact_channel
) returns table (phone text, whatsapp text)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  select l.owner_id into v_owner from public.listings l where l.id = get_listing_contact.listing_id;
  if v_owner is null then
    raise exception 'listing_not_available' using errcode = 'P0002';
  end if;
  if not public.conversation_unlocked(get_listing_contact.listing_id, v_uid) then
    raise exception 'contact_after_booking' using errcode = '42501';
  end if;

  insert into public.contact_events (listing_id, user_id, channel)
  values (get_listing_contact.listing_id, v_uid, get_listing_contact.channel);

  return query
    select p.phone, coalesce(p.whatsapp, p.phone)
    from public.profiles p where p.id = v_owner;
end $$;

-- ---------------------------------------------------------------------------
-- Admin: only reported or disputed conversations, and every read is logged
-- ---------------------------------------------------------------------------

create function public.admin_chat_queue()
returns table (
  conversation_id uuid,
  listing_id uuid,
  title text,
  owner_name text,
  customer_name text,
  open_reports integer,
  reports jsonb,
  dispute text,
  last_message_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query
    select
      c.id, c.listing_id, l.title, po.full_name, pc.full_name,
      (select count(*) from public.conversation_reports r
       where r.conversation_id = c.id and r.status = 'open')::integer,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'reason', r.reason, 'note', r.note, 'created_at', r.created_at,
          'by', case when r.reporter_id = c.owner_id then 'owner' else 'customer' end
        ) order by r.created_at desc)
        from public.conversation_reports r where r.conversation_id = c.id and r.status = 'open'
      ), '[]'::jsonb),
      (select b.dispute from public.bookings b
       where b.listing_id = c.listing_id and b.customer_id = c.customer_id and b.dispute = 'open'
       limit 1),
      c.last_message_at
    from public.conversations c
    join public.listings l on l.id = c.listing_id
    left join public.profiles po on po.id = c.owner_id
    left join public.profiles pc on pc.id = c.customer_id
    where exists (select 1 from public.conversation_reports r
                  where r.conversation_id = c.id and r.status = 'open')
       or exists (select 1 from public.bookings b
                  where b.listing_id = c.listing_id and b.customer_id = c.customer_id
                    and b.dispute = 'open')
    order by c.last_message_at desc nulls last;
end $$;

create function public.admin_read_conversation(conversation_id uuid)
returns table (
  id bigint,
  sender text,          -- 'owner' | 'customer' | 'system'
  body text,
  masked boolean,
  created_at timestamptz
)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_admin();
  c public.conversations;
begin
  select * into c from public.conversations where id = admin_read_conversation.conversation_id;
  if c.id is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.conversation_reports r where r.conversation_id = c.id)
     and not exists (select 1 from public.bookings b
                     where b.listing_id = c.listing_id and b.customer_id = c.customer_id
                       and b.dispute is not null) then
    raise exception 'chat_access_denied' using errcode = '42501';
  end if;
  insert into public.admin_chat_access (admin_id, conversation_id) values (v_uid, c.id);
  return query
    select m.id,
      case when m.sender_id is null then 'system'
           when m.sender_id = c.owner_id then 'owner' else 'customer' end,
      m.body, m.masked, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.id;
end $$;

-- action: dismiss | block (stops the conversation)
create function public.admin_resolve_chat_reports(conversation_id uuid, action text) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_admin();
begin
  if action not in ('dismiss', 'block') then
    raise exception 'unknown_action' using errcode = '22023';
  end if;
  update public.conversation_reports r
  set status = case when action = 'block' then 'actioned' else 'dismissed' end::public.report_status
  where r.conversation_id = admin_resolve_chat_reports.conversation_id and r.status = 'open';
  if action = 'block' then
    update public.conversations set blocked_by = v_uid
    where id = admin_resolve_chat_reports.conversation_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.is_conversation_member, public.conversation_unlocked, public.mask_contacts,
  public.notify_user, public.post_system_message,
  public.start_conversation, public.open_booking_chat, public.send_message,
  public.mark_conversation_read, public.my_conversations, public.my_unread_count,
  public.get_conversation, public.set_conversation_blocked, public.report_conversation,
  public.register_push_token, public.unregister_push_token,
  public.booking_events, public.dues_payment_events, public.get_listing_contact,
  public.admin_chat_queue, public.admin_read_conversation, public.admin_resolve_chat_reports
  from public, anon, authenticated;

-- Used by the messages RLS policy, which runs as the caller.
grant execute on function public.is_conversation_member to authenticated;
grant execute on function
  public.start_conversation, public.open_booking_chat, public.send_message,
  public.mark_conversation_read, public.my_conversations, public.my_unread_count,
  public.get_conversation, public.set_conversation_blocked, public.report_conversation,
  public.register_push_token, public.unregister_push_token, public.get_listing_contact,
  public.admin_chat_queue, public.admin_read_conversation, public.admin_resolve_chat_reports
  to authenticated;
