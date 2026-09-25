-- Pickup time for bookings (docs/SPEC.md §12.1).
--
-- In Sri Lanka a rental day usually runs night to night: for a trip on the
-- 27th the customer collects the vehicle on the evening of the 26th and
-- brings it back on the night of the 27th. That is still 1 day. Bookings keep
-- their trip days (start_date .. end_date); `pickup` says whether the vehicle
-- is collected the evening before the first day or on its morning. Either
-- way it comes back on the night of the last day, so back-to-back bookings
-- don't overlap.

alter table public.bookings
  add column pickup text not null default 'morning' check (pickup in ('night_before', 'morning'));

-- "Collect on the evening of Sat 26 Sep · return by the night of Sun 27 Sep"
create function public.booking_handover_text(b public.bookings) returns text
language sql stable set search_path = '' as $$
  select 'Collect on the '
    || case when b.pickup = 'night_before'
         then 'evening of ' || to_char(b.start_date - 1, 'Dy FMDD Mon')
         else 'morning of ' || to_char(b.start_date, 'Dy FMDD Mon') end
    || ' · return by the night of ' || to_char(b.end_date, 'Dy FMDD Mon')
$$;

-- ---------------------------------------------------------------------------
-- request_booking gets a pickup parameter (new signature: drop + create)
-- ---------------------------------------------------------------------------

drop function public.request_booking(uuid, date, integer, boolean, text);

create function public.request_booking(
  listing_id uuid,
  start_date date,
  days integer,
  with_driver boolean default false,
  note text default '',
  pickup text default 'morning'
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  v_today date := public.lk_today();
  l public.listings;
  d public.vehicle_details;
  v_driver boolean;
  v_id uuid;
begin
  select * into l from public.listings where id = request_booking.listing_id;
  if l.id is null or l.is_hidden or public.owner_is_restricted(l.owner_id) then
    raise exception 'listing_not_available' using errcode = 'P0002';
  end if;
  if l.owner_id = v_uid then
    raise exception 'booking_own_listing' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and phone is not null) then
    raise exception 'booking_needs_phone' using errcode = '23514';
  end if;
  select * into d from public.vehicle_details where listing_id = l.id;

  if request_booking.start_date is null
     or request_booking.start_date < v_today
     or request_booking.start_date > v_today + 180
     or request_booking.days is null or request_booking.days > 180 then
    raise exception 'booking_bad_dates' using errcode = '22023';
  end if;
  if coalesce(request_booking.pickup, '') not in ('night_before', 'morning') then
    raise exception 'booking_bad_pickup' using errcode = '22023';
  end if;
  -- Collecting the evening before a trip that starts today is in the past.
  if request_booking.pickup = 'night_before' and request_booking.start_date - 1 < v_today then
    raise exception 'booking_pickup_passed' using errcode = '22023';
  end if;
  if request_booking.days < greatest(d.min_days, 1) then
    raise exception 'booking_min_days' using errcode = '22023';
  end if;
  -- Switched off: only bookable from the back-on date.
  if not l.is_available
     and (l.available_again_on is null or request_booking.start_date < l.available_again_on) then
    raise exception 'listing_not_available' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.bookings b
    where b.listing_id = l.id and b.status in ('accepted', 'started')
      and daterange(b.start_date, b.end_date, '[]')
          && daterange(request_booking.start_date, request_booking.start_date + request_booking.days - 1, '[]')
  ) then
    raise exception 'booking_dates_taken' using errcode = '23P01';
  end if;
  if exists (
    select 1 from public.bookings b
    where b.listing_id = l.id and b.customer_id = v_uid
      and public.booking_state(b) in ('requested', 'accepted')
  ) then
    raise exception 'booking_exists' using errcode = '23505';
  end if;
  -- Anti-spam: 3 open requests at a time, 10 a day.
  if (select count(*) from public.bookings b
      where b.customer_id = v_uid and public.booking_state(b) = 'requested') >= 3
     or (select count(*) from public.bookings b
         where b.customer_id = v_uid and b.created_at > now() - interval '1 day') >= 10 then
    raise exception 'booking_limit' using errcode = '54000';
  end if;

  v_driver := case
    when not d.self_drive then true
    when not d.driver_available then false
    else coalesce(request_booking.with_driver, false)
  end;

  insert into public.bookings (
    listing_id, owner_id, customer_id, start_date, days, with_driver, note, pickup,
    estimate, commission_percent
  ) values (
    l.id, l.owner_id, v_uid, request_booking.start_date, request_booking.days, v_driver,
    left(trim(coalesce(request_booking.note, '')), 500), request_booking.pickup,
    public.trip_price(d, request_booking.days, v_driver),
    (select commission_percent from public.app_settings limit 1)
  )
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- get_booking returns the pickup (new column: drop + create)
-- ---------------------------------------------------------------------------

drop function public.get_booking(uuid);

create function public.get_booking(booking_id uuid)
returns table (
  id uuid,
  role text,                -- 'customer' | 'owner'
  state text,
  listing_id uuid,
  title text,
  town text,
  cover_photo text,
  start_date date,
  end_date date,
  days smallint,
  with_driver boolean,
  pickup text,              -- 'night_before' | 'morning'
  note text,
  estimate integer,
  agreed_total integer,
  commission_percent numeric,
  commission integer,       -- owner only
  handover_code text,       -- customer only, once accepted
  code_locked boolean,
  close_reason text,
  close_note text,
  closed_by text,
  customer_says_rented boolean,
  dispute text,
  other_name text,
  other_phone text,         -- after the owner accepts
  other_whatsapp text,
  customer jsonb,           -- owner only: customer_summary()
  my_customer_rating jsonb, -- owner only
  reviewed boolean,         -- customer only: they reviewed this vehicle
  created_at timestamptz,
  responded_at timestamptz,
  started_at timestamptz,
  closed_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  return query
    select
      b.id,
      case when b.owner_id = v_uid then 'owner' else 'customer' end,
      public.booking_state(b),
      b.listing_id, l.title, l.town,
      (select p.path from public.listing_photos p where p.listing_id = l.id
        order by p.position, p.created_at limit 1),
      b.start_date, b.end_date, b.days, b.with_driver, b.pickup, b.note,
      b.estimate, b.agreed_total, b.commission_percent,
      case when b.owner_id = v_uid then b.commission end,
      case when b.customer_id = v_uid and b.status = 'accepted' then b.handover_code end,
      b.code_attempts >= 5 and b.code_attempted_at > now() - interval '15 minutes',
      b.close_reason, b.close_note, b.closed_by, b.customer_says_rented, b.dispute,
      case when b.status in ('accepted', 'started') or b.responded_at is not null and b.status <> 'declined'
        then nullif(trim(op.full_name), '') else public.short_name(op.full_name) end,
      case when b.status in ('accepted', 'started') then op.phone end,
      case when b.status in ('accepted', 'started') then coalesce(op.whatsapp, op.phone) end,
      case when b.owner_id = v_uid then public.customer_summary(b.customer_id) end,
      case when b.owner_id = v_uid then
        (select jsonb_build_object('rating', r.rating, 'tags', r.tags)
         from public.customer_ratings r where r.booking_id = b.id) end,
      case when b.customer_id = v_uid then
        exists (select 1 from public.reviews r
                where r.listing_id = b.listing_id and r.reviewer_id = v_uid) end,
      b.created_at, b.responded_at, b.started_at, b.closed_at
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    left join public.profiles op
      on op.id = case when b.owner_id = v_uid then b.customer_id else b.owner_id end
    where b.id = get_booking.booking_id and v_uid in (b.customer_id, b.owner_id);
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Owners need to act from the pickup day (the evening before, if so)
-- ---------------------------------------------------------------------------

create or replace function public.my_bookings(as_owner boolean default false)
returns table (
  id uuid,
  listing_id uuid,
  title text,
  town text,
  cover_photo text,
  start_date date,
  end_date date,
  days smallint,
  with_driver boolean,
  estimate integer,
  agreed_total integer,
  state text,
  other_name text,
  needs_action boolean,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  v_today date := public.lk_today();
begin
  return query
    with mine as (
      select b.*, public.booking_state(b) as st,
        b.start_date - case when b.pickup = 'night_before' then 1 else 0 end as pickup_day
      from public.bookings b
      where (my_bookings.as_owner and b.owner_id = v_uid)
         or (not my_bookings.as_owner and b.customer_id = v_uid)
    )
    select
      m.id, m.listing_id, l.title, l.town,
      (select p.path from public.listing_photos p where p.listing_id = l.id
        order by p.position, p.created_at limit 1),
      m.start_date, m.end_date, m.days, m.with_driver, m.estimate, m.agreed_total,
      m.st,
      public.short_name(op.full_name),
      case when my_bookings.as_owner
        then m.st = 'requested' or (m.st = 'accepted' and m.pickup_day <= v_today)
        else (m.st = 'accepted' and m.start_date <= v_today and m.customer_says_rented is null)
      end,
      m.created_at
    from mine m
    join public.listings l on l.id = m.listing_id
    left join public.profiles op
      on op.id = case when my_bookings.as_owner then m.customer_id else m.owner_id end
    order by
      (m.st in ('requested', 'accepted', 'started')) desc,
      case when m.st in ('requested', 'accepted', 'started') then m.start_date end asc,
      m.created_at desc
    limit 100;
end $$;

-- ---------------------------------------------------------------------------
-- Chat messages and notifications say when to collect and return
-- ---------------------------------------------------------------------------

create or replace function public.booking_events() returns trigger
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
      || case when new.with_driver then ' · with driver' else '' end
      || '. ' || public.booking_handover_text(new) || '.';
    v_notify := new.owner_id;
    v_push_title := 'New booking request';
    v_push_body := v_customer || ' wants your ' || v_title || ' · ' || v_range
      || case when new.pickup = 'night_before' then ' (collect the evening before)' else '' end;
  elsif new.status = 'accepted' then
    v_actor := new.owner_id;
    v_text := 'Booking accepted. ' || public.booking_handover_text(new)
      || '. You can now see each other''s phone number.';
    v_notify := new.customer_id;
    v_push_title := 'Booking accepted';
    v_push_body := v_title || ' · ' || public.booking_handover_text(new) || '.';
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
           then ' · Rs ' || to_char(new.agreed_total, 'FM999,999,999') || ' agreed' else '' end
      || '. Return by the night of ' || to_char(new.end_date, 'Dy FMDD Mon') || '.';
    v_notify := new.customer_id;
    v_push_title := 'Rental started';
    v_push_body := 'Enjoy your trip! Return the ' || v_title || ' by the night of '
      || to_char(new.end_date, 'Dy FMDD Mon') || '.';
  else
    return new;
  end if;

  perform public.post_system_message(v_conv, v_text, new.id, v_actor);
  perform public.notify_user(v_notify, v_push_title, v_push_body,
                             jsonb_build_object('url', '/booking/' || new.id));
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.booking_handover_text, public.request_booking, public.get_booking, public.my_bookings,
  public.booking_events
  from public, anon, authenticated;
grant execute on function public.request_booking, public.get_booking, public.my_bookings to authenticated;
