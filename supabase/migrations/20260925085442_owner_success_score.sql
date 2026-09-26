-- Owner success score and badges (docs/SPEC.md §16), like Upwork's Job Success
-- Score. Over the last 12 months:
--   good = reviews with 4-5 stars on the owner's vehicles
--        + rentals started with the code where that customer left no review
--   bad  = reviews with 1-2 stars
--        + accepted bookings the owner cancelled
--        + "owner didn't turn up" / "not as described" from the customer
--        + rentals charged after a dispute (the code was skipped)
--   score = good / (good + bad), shown after 3 outcomes.
-- Badges: Top Rated Plus (90%+, 20+ verified rentals), Top Rated (90%+, 5+),
-- Rising Star (80%+, 1+).

create function public.owner_reputation(p_owner uuid)
returns table (score integer, tier text, verified integer, good integer, bad integer)
language sql stable security definer set search_path = '' as $$
  with since as (select now() - interval '365 days' as t),
  rv as (
    select r.rating, r.reviewer_id, r.listing_id
    from public.reviews r join public.listings l on l.id = r.listing_id, since
    where l.owner_id = p_owner and not r.is_hidden and r.created_at > since.t
  ),
  bk as (
    select b.* from public.bookings b, since
    where b.owner_id = p_owner and b.created_at > since.t
  ),
  c as (
    select
      (select count(*) from rv where rating >= 4)
        + (select count(*) from bk
           where bk.started_at is not null and bk.dispute is null
             and not exists (select 1 from rv where rv.reviewer_id = bk.customer_id
                                                and rv.listing_id = bk.listing_id)) as good,
      (select count(*) from rv where rating <= 2)
        + (select count(*) from bk
           where (bk.status = 'cancelled' and bk.closed_by = 'owner' and bk.responded_at is not null)
              or (bk.status = 'no_deal' and bk.closed_by = 'customer'
                  and bk.close_reason in ('owner_no_show', 'not_as_described'))
              or bk.dispute = 'charged') as bad,
      public.owner_verified_rentals(p_owner) as verified
  ),
  s as (
    select good::integer, bad::integer, verified,
           case when good + bad >= 3 then round(100.0 * good / (good + bad))::integer end as score
    from c
  )
  select
    score,
    case
      when score >= 90 and verified >= 20 then 'top_rated_plus'
      when score >= 90 and verified >= 5 then 'top_rated'
      when score >= 80 and verified >= 1 then 'rising'
    end,
    verified, good, bad
  from s
$$;

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
  owner_score integer,      -- success score 0-100, null until 3 outcomes
  owner_tier text,          -- 'top_rated_plus' | 'top_rated' | 'rising' | null
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
    rep.verified, rep.score, rep.tier,
    (select p.path from public.listing_photos p
      where p.listing_id = l.id order by p.position, p.created_at limit 1),
    rs.rating_avg, rs.rating_count,
    count(*) over ()
  from public.listings l
  join public.vehicle_details v on v.listing_id = l.id
  cross join origin o
  cross join lateral public.rating_summary(array[l.id]) rs
  cross join lateral public.owner_reputation(l.owner_id) rep
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
    -- 'recommended': trusted owners count as closer (verified rentals and
    -- badges), owners with a low success score as further away.
    case when sort_by = 'recommended'
      then extensions.st_distance(l.location, o.g)
           * case when rep.score < 60 then 1.5 else 1 end
           / (1 + 0.1 * least(rep.verified, 10)
                + case rep.tier when 'top_rated_plus' then 0.5 when 'top_rated' then 0.3
                                when 'rising' then 0.1 else 0 end)
    end asc nulls last,
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
  owner_score integer,
  owner_tier text,
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
    rep.verified, rep.score, rep.tier,
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
  cross join lateral public.owner_reputation(l.owner_id) rep
  cross join lateral public.rating_summary(array(
    select o.id from public.listings o where o.owner_id = l.owner_id
  )) orr
  where l.id = get_vehicle.listing_id
    and (public.is_live(l) or l.owner_id = (select auth.uid()))
$$;

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
  owner_score integer,       -- success score, null until 3 outcomes
  owner_tier text,
  good_outcomes integer,
  bad_outcomes integer,
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
      s.coin_value, s.fee_cap, s.free_rentals, rep.verified, rep.score, rep.tier, rep.good, rep.bad,
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
    from public.owner_dues(v_uid) d, public.app_settings s, public.owner_reputation(v_uid) rep;
end $$;

revoke execute on function
  public.owner_reputation, public.search_vehicles, public.get_vehicle, public.my_dues
  from public, anon, authenticated;
grant execute on function public.search_vehicles, public.get_vehicle to anon, authenticated;
grant execute on function public.my_dues to authenticated;
