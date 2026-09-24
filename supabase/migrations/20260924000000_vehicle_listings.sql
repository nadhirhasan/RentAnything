-- RentAnything v1: vehicle listings.
-- See docs/SPEC.md sections 4–8.
--
-- Access model:
--   * Visitors never read tables directly. Public data comes from the
--     security-definer functions search_vehicles() and get_vehicle(), which
--     return the town and distance but never the exact location.
--   * Owner phone numbers are only returned by get_listing_contact(), which
--     requires a signed-in user and logs a contact_events row.
--   * Owners read and write their own rows through RLS.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.vehicle_type as enum (
  'car', 'suv', 'van', 'buddy_van', 'mini_bus', 'bus',
  'double_cab', 'lorry', 'three_wheeler', 'motorbike', 'other'
);
create type public.transmission as enum ('auto', 'manual');
create type public.fuel_type as enum ('petrol', 'diesel', 'hybrid', 'electric');
-- same_level: return with the same fuel level; pay_used: customer pays for
-- fuel used; included: fuel is included in the price.
create type public.fuel_policy as enum ('same_level', 'pay_used', 'included');
create type public.contact_channel as enum ('call', 'whatsapp');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  phone text check (phone ~ '^\+?[0-9 ]{9,16}$'),
  whatsapp text check (whatsapp ~ '^\+?[0-9 ]{9,16}$'),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select is_admin from public.profiles where id = (select auth.uid())),
    false
  )
$$;

alter table public.profiles enable row level security;

-- Phone numbers are private: a user can only read their own profile.
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_admin());
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, whatsapp) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Listings (generic, one row per rentable thing)
-- ---------------------------------------------------------------------------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category text not null default 'vehicle' check (category in ('vehicle')),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  location extensions.geography(point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  town text not null check (char_length(town) between 2 and 80),
  is_available boolean not null default true,
  -- When switched off, the date the listing automatically comes back.
  available_again_on date,
  -- Set by admins only.
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_location_idx on public.listings using gist (location);
create index listings_owner_idx on public.listings (owner_id);

create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

-- A listing shows in search when it isn't hidden and is either switched on
-- or its back-on date (Sri Lanka time) has arrived.
create function public.is_live(l public.listings) returns boolean
language sql stable as $$
  select not l.is_hidden and (
    l.is_available
    or (l.available_again_on is not null
        and l.available_again_on <= (now() at time zone 'Asia/Colombo')::date)
  )
$$;

alter table public.listings enable row level security;

create policy "listings: owner or admin reads" on public.listings
  for select to authenticated using (owner_id = (select auth.uid()) or public.is_admin());
create policy "listings: owner inserts" on public.listings
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "listings: owner updates" on public.listings
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "listings: owner deletes" on public.listings
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.listings from anon, authenticated;
grant select, delete on public.listings to authenticated;
grant insert (title, description, lat, lng, town, is_available, available_again_on)
  on public.listings to authenticated;
grant update (title, description, lat, lng, town, is_available, available_again_on)
  on public.listings to authenticated;

-- ---------------------------------------------------------------------------
-- Vehicle details (1:1 with a vehicle listing)
-- ---------------------------------------------------------------------------

create table public.vehicle_details (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  vehicle_type public.vehicle_type not null,
  make text not null check (char_length(make) between 1 and 40),
  model text not null check (char_length(model) between 1 and 60),
  year smallint check (year between 1950 and 2100),
  seats smallint not null check (seats between 1 and 100),
  -- Buddy vans normally have one seat row behind the driver; "double seat"
  -- means it has been modified to two rows.
  double_seat boolean not null default false,
  has_ac boolean not null default false,
  transmission public.transmission,
  fuel_type public.fuel_type,

  -- Prices in LKR.
  price_per_day integer not null check (price_per_day > 0),
  km_per_day integer check (km_per_day > 0), -- null = unlimited
  extra_km_rate integer check (extra_km_rate >= 0),
  min_days smallint not null default 1 check (min_days between 1 and 365),
  weekly_price integer check (weekly_price > 0),   -- total for 7 days
  weekly_km integer check (weekly_km > 0),         -- null = unlimited
  monthly_price integer check (monthly_price > 0), -- total for 30 days
  monthly_km integer check (monthly_km > 0),       -- null = unlimited

  self_drive boolean not null default true,
  driver_available boolean not null default false,
  driver_price_per_day integer check (driver_price_per_day >= 0), -- all-inclusive

  deposit integer check (deposit >= 0),
  documents text[] not null default '{}'
    check (documents <@ array['nic', 'driving_licence', 'proof_of_address', 'guarantor']),
  fuel_policy public.fuel_policy,
  terms_notes text not null default '' check (char_length(terms_notes) <= 1000),

  constraint vehicle_details_hire_mode check (self_drive or driver_available),
  constraint vehicle_details_driver_price check (not driver_available or driver_price_per_day is not null),
  constraint vehicle_details_double_seat check (not double_seat or vehicle_type = 'buddy_van'),
  constraint vehicle_details_extra_km check (km_per_day is null or extra_km_rate is not null),
  -- Km included in an offer only makes sense with the offer's price.
  constraint vehicle_details_weekly check (weekly_km is null or weekly_price is not null),
  constraint vehicle_details_monthly check (monthly_km is null or monthly_price is not null)
);

create index vehicle_details_type_idx on public.vehicle_details (vehicle_type);

create function public.owns_listing(p_listing_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listings
    where id = p_listing_id and owner_id = (select auth.uid())
  )
$$;

alter table public.vehicle_details enable row level security;

create policy "vehicle_details: owner or admin reads" on public.vehicle_details
  for select to authenticated using (public.owns_listing(listing_id) or public.is_admin());
create policy "vehicle_details: owner inserts" on public.vehicle_details
  for insert to authenticated with check (public.owns_listing(listing_id));
create policy "vehicle_details: owner updates" on public.vehicle_details
  for update to authenticated using (public.owns_listing(listing_id))
  with check (public.owns_listing(listing_id));

revoke all on public.vehicle_details from anon, authenticated;
grant select, insert, update on public.vehicle_details to authenticated;

-- ---------------------------------------------------------------------------
-- Photos (files live in the public "listing-photos" storage bucket under
-- <owner_id>/<listing_id>/<file>)
-- ---------------------------------------------------------------------------

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  path text not null check (char_length(path) <= 300),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index listing_photos_listing_idx on public.listing_photos (listing_id, position);

alter table public.listing_photos enable row level security;

create policy "listing_photos: owner reads" on public.listing_photos
  for select to authenticated using (public.owns_listing(listing_id));
create policy "listing_photos: owner inserts" on public.listing_photos
  for insert to authenticated with check (public.owns_listing(listing_id));
create policy "listing_photos: owner updates" on public.listing_photos
  for update to authenticated using (public.owns_listing(listing_id))
  with check (public.owns_listing(listing_id));
create policy "listing_photos: owner deletes" on public.listing_photos
  for delete to authenticated using (public.owns_listing(listing_id));

revoke all on public.listing_photos from anon, authenticated;
grant select, insert, update, delete on public.listing_photos to authenticated;

-- ---------------------------------------------------------------------------
-- Contact events (written only by get_listing_contact)
-- ---------------------------------------------------------------------------

create table public.contact_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel public.contact_channel not null,
  created_at timestamptz not null default now()
);

create index contact_events_listing_idx on public.contact_events (listing_id, created_at desc);

alter table public.contact_events enable row level security;

-- Owners can count how many people contacted them.
create policy "contact_events: owner reads" on public.contact_events
  for select to authenticated using (public.owns_listing(listing_id));

revoke all on public.contact_events from anon, authenticated;
grant select on public.contact_events to authenticated;

-- ---------------------------------------------------------------------------
-- Public read API
-- ---------------------------------------------------------------------------

-- Live vehicles near a point, nearest first (or cheapest first).
-- driver_mode: null = any, 'with_driver', 'self_drive'.
-- search_text matches the title, make, model or town.
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
  cover_photo text,
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
    v.self_drive, v.driver_available, v.driver_price_per_day,
    (select p.path from public.listing_photos p
      where p.listing_id = l.id order by p.position, p.created_at limit 1),
    count(*) over ()
  from public.listings l
  join public.vehicle_details v on v.listing_id = l.id
  cross join origin o
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
    extensions.st_distance(l.location, o.g),
    l.id
  limit greatest(1, least(page_size, 50))
  offset greatest(0, page_offset)
$$;

-- One vehicle's public details. Returns nothing if the listing isn't live,
-- unless the caller owns it (so owners can preview a switched-off listing).
-- origin_lat/origin_lng are optional; without them distance_km is null.
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
  owner_name text,
  owner_listing_count bigint,
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
    p.full_name,
    (select count(*) from public.listings o where o.owner_id = l.owner_id and not o.is_hidden),
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
  where l.id = get_vehicle.listing_id
    and (public.is_live(l) or l.owner_id = (select auth.uid()))
$$;

-- Owner's phone / WhatsApp for a live listing. Signed-in users only; every
-- call is logged in contact_events.
create function public.get_listing_contact(
  listing_id uuid,
  channel public.contact_channel
) returns table (phone text, whatsapp text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;

  select l.owner_id into v_owner
  from public.listings l
  where l.id = get_listing_contact.listing_id and public.is_live(l);

  if v_owner is null then
    raise exception 'listing_not_available' using errcode = 'P0002';
  end if;

  insert into public.contact_events (listing_id, user_id, channel)
  values (get_listing_contact.listing_id, (select auth.uid()), get_listing_contact.channel);

  return query
    select p.phone, coalesce(p.whatsapp, p.phone)
    from public.profiles p where p.id = v_owner;
end $$;

-- ---------------------------------------------------------------------------
-- Owner write API: create or update a vehicle listing in one transaction.
-- Runs as the caller, so RLS and column grants still apply.
-- ---------------------------------------------------------------------------

create function public.save_vehicle_listing(
  listing jsonb,
  details jsonb,
  listing_id uuid default null
) returns uuid
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_id uuid;
  d public.vehicle_details;
begin
  if (select auth.uid()) is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and phone is not null
  ) then
    raise exception 'phone_required' using errcode = '23514',
      hint = 'Add a phone number to your account before listing a vehicle.';
  end if;

  d := jsonb_populate_record(null::public.vehicle_details, details);

  if save_vehicle_listing.listing_id is null then
    insert into public.listings (title, description, lat, lng, town, is_available, available_again_on)
    values (
      listing ->> 'title',
      coalesce(listing ->> 'description', ''),
      (listing ->> 'lat')::double precision,
      (listing ->> 'lng')::double precision,
      listing ->> 'town',
      coalesce((listing ->> 'is_available')::boolean, true),
      (listing ->> 'available_again_on')::date
    )
    returning id into v_id;

    insert into public.vehicle_details (
      listing_id, vehicle_type, make, model, year, seats, double_seat, has_ac,
      transmission, fuel_type, price_per_day, km_per_day, extra_km_rate, min_days,
      weekly_price, weekly_km, monthly_price, monthly_km,
      self_drive, driver_available, driver_price_per_day,
      deposit, documents, fuel_policy, terms_notes
    ) values (
      v_id, d.vehicle_type, d.make, d.model, d.year, d.seats,
      coalesce(d.double_seat, false), coalesce(d.has_ac, false),
      d.transmission, d.fuel_type, d.price_per_day, d.km_per_day, d.extra_km_rate,
      coalesce(d.min_days, 1),
      d.weekly_price, d.weekly_km, d.monthly_price, d.monthly_km,
      coalesce(d.self_drive, true), coalesce(d.driver_available, false), d.driver_price_per_day,
      d.deposit, coalesce(d.documents, '{}'), d.fuel_policy, coalesce(d.terms_notes, '')
    );
  else
    update public.listings set
      title = listing ->> 'title',
      description = coalesce(listing ->> 'description', ''),
      lat = (listing ->> 'lat')::double precision,
      lng = (listing ->> 'lng')::double precision,
      town = listing ->> 'town',
      is_available = coalesce((listing ->> 'is_available')::boolean, true),
      available_again_on = (listing ->> 'available_again_on')::date
    where id = save_vehicle_listing.listing_id
    returning id into v_id;

    if v_id is null then
      raise exception 'listing_not_found' using errcode = 'P0002';
    end if;

    update public.vehicle_details set
      vehicle_type = d.vehicle_type, make = d.make, model = d.model, year = d.year,
      seats = d.seats, double_seat = coalesce(d.double_seat, false),
      has_ac = coalesce(d.has_ac, false), transmission = d.transmission,
      fuel_type = d.fuel_type, price_per_day = d.price_per_day,
      km_per_day = d.km_per_day, extra_km_rate = d.extra_km_rate,
      min_days = coalesce(d.min_days, 1),
      weekly_price = d.weekly_price, weekly_km = d.weekly_km,
      monthly_price = d.monthly_price, monthly_km = d.monthly_km,
      self_drive = coalesce(d.self_drive, true),
      driver_available = coalesce(d.driver_available, false),
      driver_price_per_day = d.driver_price_per_day,
      deposit = d.deposit, documents = coalesce(d.documents, '{}'),
      fuel_policy = d.fuel_policy, terms_notes = coalesce(d.terms_notes, '')
    where vehicle_details.listing_id = v_id;
  end if;

  return v_id;
end $$;

-- Function privileges: Postgres grants EXECUTE to PUBLIC, and Supabase's
-- default privileges grant it to anon/authenticated. Start from nothing.
revoke execute on function public.search_vehicles, public.get_vehicle,
  public.get_listing_contact, public.save_vehicle_listing,
  public.is_admin, public.owns_listing, public.is_live, public.handle_new_user
  from public, anon, authenticated;
grant execute on function public.search_vehicles, public.get_vehicle to anon, authenticated;
grant execute on function public.get_listing_contact, public.save_vehicle_listing to authenticated;
-- Used inside RLS policies, which run with the caller's privileges.
grant execute on function public.is_admin, public.owns_listing to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public bucket for listing photos, writable only inside the
-- owner's own folder (<auth.uid()>/...).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "listing-photos: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "listing-photos: owner updates" on storage.objects
  for update to authenticated
  using (bucket_id = 'listing-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "listing-photos: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
