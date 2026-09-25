-- Search results include the owner's minimum hire, so Explore cards can show
-- "1 month minimum" (docs/SPEC.md §14). The return type changes: drop + create.

drop function public.search_vehicles(
  double precision, double precision, text, public.vehicle_type[], integer, boolean, text,
  boolean, integer, boolean, double precision, text, integer, integer
);

-- sort_by: 'nearest' | 'price' | 'rating'
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
    (select p.path from public.listing_photos p
      where p.listing_id = l.id order by p.position, p.created_at limit 1),
    rs.rating_avg, rs.rating_count,
    count(*) over ()
  from public.listings l
  join public.vehicle_details v on v.listing_id = l.id
  cross join origin o
  cross join lateral public.rating_summary(array[l.id]) rs
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
    extensions.st_distance(l.location, o.g),
    l.id
  limit greatest(1, least(page_size, 50))
  offset greatest(0, page_offset)
$$;

revoke execute on function public.search_vehicles from public, anon, authenticated;
grant execute on function public.search_vehicles to anon, authenticated;
