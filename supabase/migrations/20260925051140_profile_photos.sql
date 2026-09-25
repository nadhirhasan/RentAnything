-- Profile photos (docs/SPEC.md §15). Stored in the listing-photos bucket under
-- the user's own folder (<user id>/avatar-<time>.jpg), so the existing storage
-- policies apply. Shown next to names on the vehicle page, in chat and on
-- bookings; the lookups below gain an avatar column (drop + create).

alter table public.profiles
  add column avatar_path text,
  add constraint profiles_avatar_path_check
    check (avatar_path ~ ('^' || id::text || '/avatar-[0-9]+\.(jpg|png|webp)$'));

grant update (avatar_path) on public.profiles to authenticated;

drop function public.get_vehicle(uuid, double precision, double precision);

create function public.get_vehicle(
  listing_id uuid,
  origin_lat double precision default null,
  origin_lng double precision default null
) returns table (
  id uuid,
  title text,
  description text,
  town text,
  distance_km double precision,
  is_live boolean,
  is_mine boolean,
  hidden_reason text,
  owner_name text,
  owner_avatar text,
  owner_listing_count bigint,
  owner_rating_avg numeric,
  owner_rating_count integer,
  rating_avg numeric,
  rating_count integer,
  verified_count integer,
  photos text[],
  vehicle_type public.vehicle_type,
  make text,
  model text,
  year smallint,
  seats smallint,
  double_seat boolean,
  has_ac boolean,
  transmission public.transmission,
  fuel_type public.fuel_type,
  price_per_day integer,
  km_per_day integer,
  extra_km_rate integer,
  min_days smallint,
  weekly_price integer,
  weekly_km integer,
  monthly_price integer,
  monthly_km integer,
  self_drive boolean,
  driver_available boolean,
  driver_price_per_day integer,
  deposit integer,
  documents text[],
  fuel_policy public.fuel_policy,
  terms_notes text
)
language sql stable security definer set search_path = '' as $$
  select
    l.id, l.title, l.description, l.town,
    case when origin_lat is null or origin_lng is null then null else
      round((extensions.st_distance(
        l.location,
        extensions.st_setsrid(extensions.st_makepoint(origin_lng, origin_lat), 4326)::extensions.geography
      ) / 1000)::numeric, 1)::double precision
    end,
    public.is_live(l),
    l.owner_id = (select auth.uid()),
    case when l.owner_id = (select auth.uid()) then
      coalesce(l.hidden_reason, case when public.owner_is_restricted(l.owner_id) then 'dues' end)
    end,
    p.full_name,
    p.avatar_path,
    (select count(*) from public.listings o where o.owner_id = l.owner_id and not o.is_hidden),
    orr.rating_avg, orr.rating_count,
    rs.rating_avg, rs.rating_count, rs.verified_count,
    coalesce(
      (select array_agg(ph.path order by ph.position, ph.created_at)
         from public.listing_photos ph where ph.listing_id = l.id),
      '{}'
    ),
    v.vehicle_type, v.make, v.model, v.year, v.seats, v.double_seat, v.has_ac,
    v.transmission, v.fuel_type,
    v.price_per_day, v.km_per_day, v.extra_km_rate, v.min_days,
    v.weekly_price, v.weekly_km, v.monthly_price, v.monthly_km,
    v.self_drive, v.driver_available, v.driver_price_per_day,
    v.deposit, v.documents, v.fuel_policy, v.terms_notes
  from public.listings l
  join public.vehicle_details v on v.listing_id = l.id
  join public.profiles p on p.id = l.owner_id
  cross join lateral public.rating_summary(array[l.id]) rs
  cross join lateral public.rating_summary(array(
    select o.id from public.listings o where o.owner_id = l.owner_id
  )) orr
  where l.id = get_vehicle.listing_id
    and (public.is_live(l) or l.owner_id = (select auth.uid()))
$$;

drop function public.my_conversations();

create function public.my_conversations()
returns table (
  id uuid,
  listing_id uuid,
  title text,
  cover_photo text,
  role text,
  other_name text,
  other_avatar text,
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
      op.avatar_path,
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

drop function public.get_conversation(uuid);

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
  other_avatar text,
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
      op.avatar_path,
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
  other_avatar text,
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
      op.avatar_path,
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

revoke execute on function
  public.get_vehicle, public.my_conversations, public.get_conversation, public.get_booking
  from public, anon, authenticated;
grant execute on function public.get_vehicle to anon, authenticated;
grant execute on function public.my_conversations, public.get_conversation, public.get_booking
  to authenticated;
