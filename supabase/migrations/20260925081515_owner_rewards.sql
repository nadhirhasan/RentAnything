-- Owner rewards and coins (docs/SPEC.md §16).
-- * Fees: the owner's first `free_rentals` rentals started with the code are
--   free; after that the fee is capped at `fee_cap` rupees and rounded to whole
--   coins (1 coin = `coin_value` rupees). The app shows balances in coins.
-- * Verified rentals (started with the code) rank owners higher in search
--   ('recommended' sort) and show as a badge.

alter table public.app_settings
  add column free_rentals smallint not null default 3 check (free_rentals between 0 and 50),
  add column fee_cap integer not null default 3000 check (fee_cap between 0 and 1000000),
  add column coin_value integer not null default 10 check (coin_value between 1 and 1000);

-- Rentals the owner started with the customer's code (not ones an admin
-- charged after a dispute).
create function public.owner_verified_rentals(p_owner uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.bookings
  where owner_id = p_owner and started_at is not null and dispute is null
$$;

-- RentAnything's fee for a rental, in rupees (always whole coins).
create function public.rental_fee(p_owner uuid, p_total integer, p_percent numeric, p_allow_free boolean)
returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when p_allow_free and public.owner_verified_rentals(p_owner) < s.free_rentals then 0
    else (round(
      least(round(p_total * p_percent / 100), case when s.fee_cap > 0 then s.fee_cap else 2147483647 end)
      / s.coin_value::numeric
    ) * s.coin_value)::integer
  end
  from public.app_settings s limit 1
$$;

create or replace function public.start_booking(booking_id uuid, code text, agreed_total integer default null)
returns text
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  b public.bookings;
  v_total integer;
  v_commission integer;
  v_title text;
begin
  select * into b from public.bookings
  where id = start_booking.booking_id and owner_id = v_uid for update;
  if b.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if b.status <> 'accepted' then
    raise exception 'booking_not_open' using errcode = '55000';
  end if;
  if b.code_attempts >= 5 and b.code_attempted_at > now() - interval '15 minutes' then
    return 'locked';
  end if;
  if trim(coalesce(start_booking.code, '')) <> b.handover_code then
    update public.bookings set
      code_attempts = case when code_attempted_at < now() - interval '15 minutes' then 1
                           else code_attempts + 1 end,
      code_attempted_at = now()
    where id = b.id;
    return 'wrong_code';
  end if;

  v_total := coalesce(start_booking.agreed_total, b.estimate);
  if v_total < 0 or v_total > 10000000 then
    raise exception 'booking_bad_amount' using errcode = '22023';
  end if;
  -- Free for the owner's first rentals, capped, whole coins (rental_fee).
  v_commission := public.rental_fee(b.owner_id, v_total, b.commission_percent, true);

  update public.bookings set
    status = 'started', started_at = now(), agreed_total = v_total,
    commission = v_commission, code_attempts = 0
  where id = b.id;

  select title into v_title from public.listings where id = b.listing_id;
  if v_commission > 0 then
    insert into public.owner_ledger (owner_id, kind, amount, booking_id, note, created_by)
    values (v_uid, 'commission', v_commission, b.id,
            left(v_title || ' · ' || to_char(b.start_date, 'DD Mon') || ' · '
                 || b.days || ' day' || case when b.days = 1 then '' else 's' end, 300),
            v_uid);
  end if;

  -- A real hire: the customer's review gets the "Verified hire" badge.
  insert into public.hire_confirmations (listing_id, customer_id)
  values (b.listing_id, b.customer_id)
  on conflict (listing_id, customer_id) do update set confirmed_at = now();

  -- Out on hire: off until the day after it comes back.
  update public.listings set is_available = false, available_again_on = b.end_date + 1
  where id = b.listing_id;
  return 'ok';
end $$;

create or replace function public.admin_resolve_dispute(booking_id uuid, charge boolean)
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_admin();
  b public.bookings;
  v_commission integer;
begin
  select * into b from public.bookings
  where id = admin_resolve_dispute.booking_id and dispute = 'open' for update;
  if b.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if not admin_resolve_dispute.charge then
    update public.bookings set dispute = 'dismissed' where id = b.id;
    return;
  end if;
  -- Caught without the code: no free rental, but the same cap.
  v_commission := public.rental_fee(b.owner_id, coalesce(b.agreed_total, b.estimate), b.commission_percent, false);
  update public.bookings set
    dispute = 'charged',
    status = 'started',
    started_at = coalesce(started_at, now()),
    agreed_total = coalesce(agreed_total, estimate),
    commission = v_commission,
    closed_by = null, close_reason = null, closed_at = null
  where id = b.id;
  if v_commission > 0 then
    insert into public.owner_ledger (owner_id, kind, amount, booking_id, note, created_by)
    select b.owner_id, 'commission', v_commission, b.id,
           left(l.title || ' · ' || to_char(b.start_date, 'DD Mon') || ' · confirmed by customer', 300), v_uid
    from public.listings l where l.id = b.listing_id
    on conflict (booking_id) where kind = 'commission' do nothing;
  end if;
  insert into public.hire_confirmations (listing_id, customer_id)
  values (b.listing_id, b.customer_id)
  on conflict (listing_id, customer_id) do nothing;
end $$;

drop function public.my_dues();

create function public.my_dues()
returns table (
  balance integer,
  pending integer,
  restricted boolean,
  restricted_reason text,
  due_by date,              -- pay by this day to avoid the "overdue" restriction
  dues_limit integer,
  dues_days smallint,
  commission_percent numeric,
  payment_details text,
  coin_value integer,        -- rupees per coin
  fee_cap integer,           -- 0 = no cap
  free_rentals smallint,
  verified_rentals integer,  -- rentals started with the code
  entries jsonb,            -- latest ledger entries
  payments jsonb            -- latest reported payments
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  return query
    select
      d.balance, d.pending, d.restricted, d.restricted_reason,
      (d.oldest_unpaid_at at time zone 'Asia/Colombo')::date + s.dues_days,
      s.dues_limit, s.dues_days, s.commission_percent, s.payment_details,
      s.coin_value, s.fee_cap, s.free_rentals, public.owner_verified_rentals(v_uid),
      coalesce((
        select jsonb_agg(e order by e.created_at desc) from (
          select g.id, g.kind, g.amount, g.note, g.booking_id, g.created_at
          from public.owner_ledger g where g.owner_id = v_uid
          order by g.created_at desc limit 50
        ) e
      ), '[]'::jsonb),
      coalesce((
        select jsonb_agg(p order by p.created_at desc) from (
          select q.id, q.amount, q.method, q.reference, q.status, q.admin_note, q.created_at
          from public.dues_payments q where q.owner_id = v_uid
          order by q.created_at desc limit 10
        ) p
      ), '[]'::jsonb)
    from public.owner_dues(v_uid) d, public.app_settings s;
end $$;

drop function public.get_app_settings();

create function public.get_app_settings()
returns table (
  commission_percent numeric, dues_limit integer, dues_days smallint, payment_details text,
  free_rentals smallint, fee_cap integer, coin_value integer
)
language sql stable security definer set search_path = '' as $$
  select commission_percent, dues_limit, dues_days, payment_details, free_rentals, fee_cap, coin_value
  from public.app_settings limit 1
$$;

drop function public.admin_update_settings(numeric, integer, integer, text);

create function public.admin_update_settings(
  commission_percent numeric,
  dues_limit integer,
  dues_days integer,
  payment_details text,
  free_rentals integer default 3,
  fee_cap integer default 3000,
  coin_value integer default 10
) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  update public.app_settings set
    commission_percent = admin_update_settings.commission_percent,
    dues_limit = admin_update_settings.dues_limit,
    dues_days = admin_update_settings.dues_days,
    payment_details = trim(coalesce(admin_update_settings.payment_details, '')),
    free_rentals = admin_update_settings.free_rentals,
    fee_cap = admin_update_settings.fee_cap,
    coin_value = admin_update_settings.coin_value
  where id;
end $$;

drop function public.search_vehicles(
  double precision, double precision, text, public.vehicle_type[], integer, boolean, text,
  boolean, integer, boolean, double precision, text, integer, integer
);

create function public.search_vehicles(
  origin_lat double precision,
  origin_lng double precision,
  search_text text default null,
  vehicle_types public.vehicle_type[] default null,
  min_seats integer default null,
  ac_only boolean default false,
  driver_mode text default null,
  double_seat_only boolean default false,
  max_price_per_day integer default null,
  unlimited_km_only boolean default false,
  radius_km double precision default null,
  sort_by text default 'nearest',
  page_size integer default 20,
  page_offset integer default 0
) returns table (
  id uuid,
  title text,
  town text,
  distance_km double precision,
  vehicle_type public.vehicle_type,
  make text,
  model text,
  year smallint,
  seats smallint,
  double_seat boolean,
  has_ac boolean,
  price_per_day integer,
  km_per_day integer,
  extra_km_rate integer,
  weekly_price integer,
  weekly_km integer,
  monthly_price integer,
  monthly_km integer,
  self_drive boolean,
  driver_available boolean,
  driver_price_per_day integer,
  min_days smallint,
  owner_verified integer,   -- owner's rentals started with the code
  cover_photo text,
  rating_avg numeric,
  rating_count integer,
  total_count bigint
)
language sql stable security definer set search_path = '' as $$
  with origin as (
    select extensions.st_setsrid(
      extensions.st_makepoint(origin_lng, origin_lat), 4326
    )::extensions.geography as g
  )
  select
    l.id, l.title, l.town,
    round((extensions.st_distance(l.location, o.g) / 1000)::numeric, 1)::double precision,
    v.vehicle_type, v.make, v.model, v.year, v.seats, v.double_seat, v.has_ac,
    v.price_per_day, v.km_per_day, v.extra_km_rate,
    v.weekly_price, v.weekly_km, v.monthly_price, v.monthly_km,
    v.self_drive, v.driver_available, v.driver_price_per_day, v.min_days,
    ov.n,
    (select p.path from public.listing_photos p
      where p.listing_id = l.id order by p.position, p.created_at limit 1),
    rs.rating_avg, rs.rating_count,
    count(*) over ()
  from public.listings l
  join public.vehicle_details v on v.listing_id = l.id
  cross join origin o
  cross join lateral public.rating_summary(array[l.id]) rs
  cross join lateral (select public.owner_verified_rentals(l.owner_id) as n) ov
  where public.is_live(l)
    and (coalesce(trim(search_text), '') = ''
         or concat_ws(' ', l.title, v.make, v.model, l.town)
            ilike '%' || replace(replace(replace(trim(search_text), '\', '\\'), '%', '\%'), '_', '\_') || '%')
    and (vehicle_types is null or cardinality(vehicle_types) = 0 or v.vehicle_type = any (vehicle_types))
    and (min_seats is null or v.seats >= min_seats)
    and (not ac_only or v.has_ac)
    and (driver_mode is null
         or (driver_mode = 'with_driver' and v.driver_available)
         or (driver_mode = 'self_drive' and v.self_drive))
    and (not double_seat_only or v.double_seat)
    and (max_price_per_day is null or v.price_per_day <= max_price_per_day)
    and (not unlimited_km_only or v.km_per_day is null)
    and (radius_km is null or extensions.st_dwithin(l.location, o.g, radius_km * 1000))
  order by
    case when sort_by = 'price' then v.price_per_day end asc nulls last,
    case when sort_by = 'rating' then rs.rating_avg end desc nulls last,
    -- 'recommended': owners with verified rentals count as closer (10+ = half
    -- the distance), so honest owners get more bookings.
    case when sort_by = 'recommended'
      then extensions.st_distance(l.location, o.g) / (1 + 0.1 * least(ov.n, 10)) end asc nulls last,
    extensions.st_distance(l.location, o.g),
    l.id
  limit greatest(1, least(page_size, 50))
  offset greatest(0, page_offset)
$$;

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
  owner_verified integer,
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
    public.owner_verified_rentals(l.owner_id),
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

revoke execute on function
  public.owner_verified_rentals, public.rental_fee, public.my_dues, public.get_app_settings,
  public.admin_update_settings, public.search_vehicles, public.get_vehicle
  from public, anon, authenticated;
grant execute on function public.search_vehicles, public.get_vehicle to anon, authenticated;
grant execute on function public.my_dues, public.get_app_settings, public.admin_update_settings to authenticated;
