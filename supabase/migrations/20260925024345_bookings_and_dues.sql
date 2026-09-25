-- Bookings and owner dues (docs/SPEC.md §12).
--
-- Money flow ("cash, PickMe style"):
--   * The customer sends a booking request, the owner accepts it, they meet,
--     and the customer shows a 4-digit handover code. When the owner enters
--     the code the rental has started.
--   * The customer pays the owner in cash. RentAnything's commission (a % of
--     the agreed price) is added to the owner's balance at handover.
--   * Owners pay their balance by bank transfer / LankaQR / eZ Cash and tell
--     us in the app; an admin approves the payment.
--   * An owner who owes too much, or for too long, is restricted: their
--     vehicles leave search and they can't accept bookings until they pay.
--
-- As before, all tables are private and reached through the functions below.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Settings (one row, edited by admins)
-- ---------------------------------------------------------------------------

create table public.app_settings (
  id boolean primary key default true check (id),
  commission_percent numeric(4, 2) not null default 5 check (commission_percent between 0 and 30),
  -- Restricted when the balance reaches this amount (LKR)...
  dues_limit integer not null default 5000 check (dues_limit >= 0),
  -- ...or when a commission stays unpaid for this many days.
  dues_days smallint not null default 30 check (dues_days between 1 and 365),
  -- How to pay RentAnything (bank account, LankaQR, eZ Cash number).
  payment_details text not null default '' check (char_length(payment_details) <= 1000),
  updated_at timestamptz not null default now()
);

insert into public.app_settings default values;

create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

-- Stored status. Two more states are derived (see booking_state()):
-- 'expired' (a request nobody answered) and 'completed' (a started rental
-- whose last day has passed).
create type public.booking_status as enum (
  'requested', 'accepted', 'declined', 'cancelled', 'no_deal', 'started'
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  days smallint not null check (days between 1 and 180),
  end_date date generated always as (start_date + (days - 1)) stored, -- last day, inclusive
  with_driver boolean not null default false,
  note text not null default '' check (char_length(note) <= 500),
  estimate integer not null check (estimate >= 0),         -- listing price for these days
  agreed_total integer check (agreed_total >= 0),          -- entered by the owner at handover
  commission_percent numeric(4, 2) not null,
  commission integer check (commission >= 0),
  status public.booking_status not null default 'requested',
  handover_code text not null default lpad(floor(random() * 10000)::integer::text, 4, '0'),
  code_attempts smallint not null default 0,
  code_attempted_at timestamptz,
  close_reason text check (char_length(close_reason) <= 40),
  close_note text not null default '' check (char_length(close_note) <= 300),
  closed_by text check (closed_by in ('customer', 'owner', 'admin')),
  -- The customer's answer to "Did you rent it?" when no handover happened.
  customer_says_rented boolean,
  -- 'open' when the customer says they rented it but the owner never
  -- entered the handover code; an admin charges or dismisses it.
  dispute text check (dispute in ('open', 'charged', 'dismissed')),
  responded_at timestamptz,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A vehicle can't be accepted twice for the same days.
  constraint bookings_no_overlap exclude using gist (
    listing_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('accepted', 'started'))
);

create index bookings_customer_idx on public.bookings (customer_id, created_at desc);
create index bookings_owner_idx on public.bookings (owner_id, created_at desc);
create index bookings_dispute_idx on public.bookings (dispute) where dispute = 'open';

create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- Owners rate customers after a rental (or a no-show). Only other owners see
-- the summary, when deciding on a request.
create table public.customer_ratings (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  tags text[] not null default '{}' check (tags <@ array[
    'on_time', 'careful', 'returned_clean', 'friendly',
    'late', 'damaged', 'rude', 'no_show'
  ]),
  created_at timestamptz not null default now()
);

create index customer_ratings_customer_idx on public.customer_ratings (customer_id);
create index customer_ratings_owner_idx on public.customer_ratings (owner_id);

-- ---------------------------------------------------------------------------
-- Owner dues
-- ---------------------------------------------------------------------------

-- Payments an owner says they made. Approved ones become ledger entries.
create table public.dues_payments (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount between 1 and 10000000),
  method text not null check (method in ('bank', 'lankaqr', 'ezcash', 'other')),
  reference text not null default '' check (char_length(reference) <= 100),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text not null default '' check (char_length(admin_note) <= 300),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index dues_payments_one_pending on public.dues_payments (owner_id) where status = 'pending';
create index dues_payments_reviewer_idx on public.dues_payments (reviewed_by);

-- Balance = sum(amount). Positive = the owner owes RentAnything.
create table public.owner_ledger (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('commission', 'payment', 'adjustment')),
  amount integer not null check (amount <> 0),
  booking_id uuid references public.bookings (id) on delete set null,
  payment_id bigint references public.dues_payments (id) on delete set null,
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index owner_ledger_owner_idx on public.owner_ledger (owner_id, created_at);
create unique index owner_ledger_one_commission on public.owner_ledger (booking_id) where kind = 'commission';
create index owner_ledger_payment_idx on public.owner_ledger (payment_id);
create index owner_ledger_created_by_idx on public.owner_ledger (created_by);

alter table public.app_settings enable row level security;
alter table public.bookings enable row level security;
alter table public.customer_ratings enable row level security;
alter table public.dues_payments enable row level security;
alter table public.owner_ledger enable row level security;
revoke all on public.app_settings, public.bookings, public.customer_ratings,
  public.dues_payments, public.owner_ledger
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.lk_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Colombo')::date
$$;

-- Price for a number of days, without extra km. Mirrors estimateTrip() in
-- src/lib/pricing.ts (cheapest of daily / weekly / monthly, plus driver).
create function public.trip_price(d public.vehicle_details, p_days integer, p_with_driver boolean)
returns integer
language sql immutable set search_path = '' as $$
  select (
    least(
      p_days::numeric * d.price_per_day,
      case when d.weekly_price is not null and p_days >= 7
        then round(d.weekly_price::numeric * p_days / 7) end,
      case when d.monthly_price is not null and p_days >= 30
        then round(d.monthly_price::numeric * p_days / 30) end
    )
    + case when p_with_driver and d.driver_available
        then p_days::numeric * coalesce(d.driver_price_per_day, 0) else 0 end
  )::integer
$$;

create function public.booking_state(b public.bookings) returns text
language sql stable set search_path = '' as $$
  select case
    when b.status = 'requested'
         and (b.created_at < now() - interval '48 hours' or b.start_date < public.lk_today())
      then 'expired'
    when b.status = 'started' and b.end_date < public.lk_today()
      then 'completed'
    else b.status::text
  end
$$;

-- An owner's balance and whether they're restricted. Payments the owner
-- reported in the last 3 days count as paid until an admin checks them, so
-- paying at night brings the vehicles back straight away.
create function public.owner_dues(p_owner uuid)
returns table (
  balance integer,          -- what the ledger says they owe
  pending integer,          -- reported, not yet approved
  oldest_unpaid_at timestamptz,
  restricted boolean,
  restricted_reason text    -- 'limit' | 'overdue' | null
)
language sql stable security definer set search_path = '' as $$
  with s as (
    select dues_limit, dues_days from public.app_settings limit 1
  ), led as (
    select
      coalesce(sum(amount), 0)::integer as balance,
      coalesce(-sum(amount) filter (where amount < 0), 0)::integer as credited
    from public.owner_ledger where owner_id = p_owner
  ), pend as (
    select coalesce(sum(amount), 0)::integer as pending
    from public.dues_payments
    where owner_id = p_owner and status = 'pending' and created_at > now() - interval '3 days'
  ), charges as (
    select created_at, sum(amount) over (order by created_at, id) as running
    from public.owner_ledger where owner_id = p_owner and amount > 0
  ), oldest as (
    -- First charge not covered by payments (oldest first).
    select min(c.created_at) as first_at
    from charges c, led, pend
    where c.running > led.credited + pend.pending
  ), r as (
    select
      led.balance, pend.pending, oldest.first_at,
      case
        when led.balance - pend.pending <= 0 then null
        when led.balance - pend.pending >= s.dues_limit then 'limit'
        when oldest.first_at < now() - make_interval(days => s.dues_days) then 'overdue'
      end as reason
    from led, pend, oldest, s
  )
  select balance, pending, first_at, reason is not null, reason from r
$$;

create function public.owner_is_restricted(p_owner uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  -- Fast path for search: most owners have never owed anything.
  if not exists (select 1 from public.owner_ledger where owner_id = p_owner) then
    return false;
  end if;
  return coalesce((select d.restricted from public.owner_dues(p_owner) d), false);
end $$;

-- Restricted owners' vehicles leave search, the vehicle page and contact.
create or replace function public.is_live(l public.listings) returns boolean
language sql stable set search_path = '' as $$
  select not l.is_hidden
    and (
      l.is_available
      or (l.available_again_on is not null
          and l.available_again_on <= (now() at time zone 'Asia/Colombo')::date)
    )
    and not public.owner_is_restricted(l.owner_id)
$$;

-- What owners see about a customer before accepting.
create function public.customer_summary(p_customer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', public.short_name(p.full_name),
    'member_since', p.created_at,
    'rentals', (select count(*) from public.bookings b
                where b.customer_id = p_customer and b.status = 'started'),
    'rating_avg', (select round(avg(r.rating), 1) from public.customer_ratings r
                   where r.customer_id = p_customer),
    'rating_count', (select count(*) from public.customer_ratings r where r.customer_id = p_customer),
    'no_shows', (select count(*) from public.bookings b
                 where b.customer_id = p_customer and b.status = 'no_deal'
                   and b.close_reason = 'customer_no_show'),
    'late_cancels', (select count(*) from public.bookings b
                     where b.customer_id = p_customer and b.status = 'cancelled'
                       and b.closed_by = 'customer' and b.responded_at is not null),
    'tags', coalesce((
      select jsonb_object_agg(t, n) from (
        select t, count(*) as n
        from public.customer_ratings r, unnest(r.tags) t
        where r.customer_id = p_customer
        group by t
      ) x
    ), '{}'::jsonb)
  )
  from public.profiles p where p.id = p_customer
$$;

-- ---------------------------------------------------------------------------
-- Customer: request, cancel, confirm what happened
-- ---------------------------------------------------------------------------

create function public.request_booking(
  listing_id uuid,
  start_date date,
  days integer,
  with_driver boolean default false,
  note text default ''
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
    listing_id, owner_id, customer_id, start_date, days, with_driver, note,
    estimate, commission_percent
  ) values (
    l.id, l.owner_id, v_uid, request_booking.start_date, request_booking.days, v_driver,
    left(trim(coalesce(request_booking.note, '')), 500),
    public.trip_price(d, request_booking.days, v_driver),
    (select commission_percent from public.app_settings limit 1)
  )
  returning id into v_id;
  return v_id;
end $$;

-- Customer: a request or an accepted booking. Owner: an accepted booking
-- (a request is declined instead).
create function public.cancel_booking(booking_id uuid, reason text default 'other', note text default '')
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  b public.bookings;
  v_state text;
begin
  select * into b from public.bookings where id = cancel_booking.booking_id for update;
  if b.id is null or v_uid not in (b.customer_id, b.owner_id) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  v_state := public.booking_state(b);
  if not (v_state = 'accepted' or (v_state = 'requested' and v_uid = b.customer_id)) then
    raise exception 'booking_not_open' using errcode = '55000';
  end if;
  update public.bookings set
    status = 'cancelled',
    close_reason = case when cancel_booking.reason in
      ('changed_plans', 'found_another', 'vehicle_unavailable', 'customer_unreachable', 'other')
      then cancel_booking.reason else 'other' end,
    close_note = left(trim(coalesce(cancel_booking.note, '')), 300),
    closed_by = case when v_uid = b.customer_id then 'customer' else 'owner' end,
    closed_at = now()
  where id = b.id;
end $$;

-- "Did you rent it?" for a booking that never got a handover: after the
-- start date, or after the owner ended it. Yes opens a dispute.
create function public.confirm_booking_outcome(booking_id uuid, rented boolean)
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  b public.bookings;
begin
  select * into b from public.bookings
  where id = confirm_booking_outcome.booking_id and customer_id = v_uid for update;
  if b.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if b.customer_says_rented is not null
     or not ((b.status = 'accepted' and b.start_date <= public.lk_today())
             or (b.status in ('no_deal', 'cancelled') and b.closed_by = 'owner')) then
    raise exception 'booking_not_open' using errcode = '55000';
  end if;
  update public.bookings set
    customer_says_rented = confirm_booking_outcome.rented,
    dispute = case when confirm_booking_outcome.rented then 'open' else dispute end,
    status = case when not confirm_booking_outcome.rented and status = 'accepted'
                  then 'no_deal'::public.booking_status else status end,
    close_reason = case when not confirm_booking_outcome.rented and status = 'accepted'
                        then 'did_not_happen' else close_reason end,
    closed_by = case when not confirm_booking_outcome.rented and status = 'accepted'
                     then 'customer' else closed_by end,
    closed_at = case when not confirm_booking_outcome.rented and status = 'accepted'
                     then now() else closed_at end
  where id = b.id;
end $$;

-- ---------------------------------------------------------------------------
-- Owner: accept / decline, start with the handover code, rate the customer
-- ---------------------------------------------------------------------------

create function public.respond_booking(booking_id uuid, accept boolean, reason text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  b public.bookings;
begin
  select * into b from public.bookings
  where id = respond_booking.booking_id and owner_id = v_uid for update;
  if b.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if public.booking_state(b) <> 'requested' then
    raise exception 'booking_not_open' using errcode = '55000';
  end if;

  if respond_booking.accept then
    if public.owner_is_restricted(v_uid) then
      raise exception 'dues_overdue' using errcode = '42501';
    end if;
    begin
      update public.bookings set status = 'accepted', responded_at = now() where id = b.id;
    exception when exclusion_violation then
      raise exception 'booking_dates_taken' using errcode = '23P01';
    end;
    -- Other requests for the same days can't happen now.
    update public.bookings o set
      status = 'declined', close_reason = 'dates_taken', closed_by = 'owner',
      closed_at = now(), responded_at = now()
    where o.listing_id = b.listing_id and o.id <> b.id and o.status = 'requested'
      and daterange(o.start_date, o.end_date, '[]') && daterange(b.start_date, b.end_date, '[]');
  else
    update public.bookings set
      status = 'declined',
      close_reason = case when respond_booking.reason in
        ('dates_taken', 'not_available', 'customer_profile', 'other')
        then respond_booking.reason else 'other' end,
      closed_by = 'owner', closed_at = now(), responded_at = now()
    where id = b.id;
  end if;
end $$;

-- The owner enters the customer's code at pickup. Returns 'ok',
-- 'wrong_code' or 'locked' (5 wrong codes -> wait 15 minutes). Not raised as
-- errors so the attempt counter is saved.
create function public.start_booking(booking_id uuid, code text, agreed_total integer default null)
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
  v_commission := round(v_total * b.commission_percent / 100)::integer;

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

-- Either side, at the meeting: the rental isn't going ahead.
create function public.mark_no_deal(booking_id uuid, reason text, note text default '')
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  b public.bookings;
begin
  select * into b from public.bookings where id = mark_no_deal.booking_id for update;
  if b.id is null or v_uid not in (b.customer_id, b.owner_id) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if b.status <> 'accepted' then
    raise exception 'booking_not_open' using errcode = '55000';
  end if;
  update public.bookings set
    status = 'no_deal',
    close_reason = case
      when v_uid = b.customer_id and mark_no_deal.reason in
        ('not_as_described', 'owner_no_show', 'price', 'documents', 'changed_mind', 'other')
        then mark_no_deal.reason
      when v_uid = b.owner_id and mark_no_deal.reason in
        ('customer_no_show', 'customer_profile', 'price', 'documents', 'other')
        then mark_no_deal.reason
      else 'other' end,
    close_note = left(trim(coalesce(mark_no_deal.note, '')), 300),
    closed_by = case when v_uid = b.customer_id then 'customer' else 'owner' end,
    closed_at = now()
  where id = b.id;
end $$;

create function public.rate_customer(booking_id uuid, rating smallint, tags text[] default '{}')
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  b public.bookings;
begin
  select * into b from public.bookings where id = rate_customer.booking_id and owner_id = v_uid;
  if b.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if not (b.status = 'started' or (b.status = 'no_deal' and b.close_reason = 'customer_no_show')) then
    raise exception 'booking_not_open' using errcode = '55000';
  end if;
  insert into public.customer_ratings (booking_id, customer_id, owner_id, rating, tags)
  values (b.id, b.customer_id, v_uid, rate_customer.rating, coalesce(rate_customer.tags, '{}'))
  on conflict (booking_id) do update set rating = excluded.rating, tags = excluded.tags;
end $$;

-- ---------------------------------------------------------------------------
-- Reading bookings
-- ---------------------------------------------------------------------------

-- The signed-in user's bookings: as a customer ("My trips") or as an owner
-- ("Requests"). Open ones first, soonest first; then the rest, newest first.
create function public.my_bookings(as_owner boolean default false)
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
      select b.*, public.booking_state(b) as st
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
        then m.st = 'requested' or (m.st = 'accepted' and m.start_date <= v_today)
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
      b.start_date, b.end_date, b.days, b.with_driver, b.note,
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

-- Requests waiting for this owner (for the tab badge).
create function public.my_booking_badge() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.bookings b
  where b.owner_id = (select auth.uid()) and public.booking_state(b) = 'requested'
$$;

-- Days already booked, so customers don't pick them. Public.
create function public.listing_booked_dates(listing_id uuid)
returns table (start_date date, end_date date)
language sql stable security definer set search_path = '' as $$
  select b.start_date, b.end_date
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.listing_id = listing_booked_dates.listing_id
    and b.status in ('accepted', 'started')
    and b.end_date >= public.lk_today()
    and public.is_live(l)
  order by b.start_date
$$;

-- ---------------------------------------------------------------------------
-- Owner dues API
-- ---------------------------------------------------------------------------

create function public.get_app_settings()
returns table (commission_percent numeric, dues_limit integer, dues_days smallint, payment_details text)
language sql stable security definer set search_path = '' as $$
  select commission_percent, dues_limit, dues_days, payment_details from public.app_settings limit 1
$$;

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

create function public.report_dues_payment(amount integer, method text, reference text default '')
returns bigint
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  v_id bigint;
begin
  if exists (select 1 from public.dues_payments where owner_id = v_uid and status = 'pending') then
    raise exception 'payment_pending_exists' using errcode = '23505';
  end if;
  insert into public.dues_payments (owner_id, amount, method, reference)
  values (v_uid, report_dues_payment.amount, report_dues_payment.method,
          left(trim(coalesce(report_dues_payment.reference, '')), 100))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

-- Owners who owe something or reported a payment.
create function public.admin_dues_overview()
returns table (
  owner_id uuid,
  owner_name text,
  owner_phone text,
  balance integer,
  pending integer,
  oldest_unpaid_at timestamptz,
  restricted boolean,
  restricted_reason text,
  pending_payment jsonb
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query
    with owners as (
      select g.owner_id as oid from public.owner_ledger g
      union
      select q.owner_id from public.dues_payments q where q.status = 'pending'
    )
    select
      o.oid, p.full_name, p.phone,
      d.balance, d.pending, d.oldest_unpaid_at, d.restricted, d.restricted_reason,
      (select jsonb_build_object('id', q.id, 'amount', q.amount, 'method', q.method,
                                 'reference', q.reference, 'created_at', q.created_at)
       from public.dues_payments q where q.owner_id = o.oid and q.status = 'pending')
    from owners o
    join public.profiles p on p.id = o.oid
    cross join lateral public.owner_dues(o.oid) d
    where d.balance <> 0 or exists (
      select 1 from public.dues_payments q where q.owner_id = o.oid and q.status = 'pending')
    order by
      exists (select 1 from public.dues_payments q where q.owner_id = o.oid and q.status = 'pending') desc,
      d.restricted desc, d.balance desc;
end $$;

create function public.admin_review_payment(payment_id bigint, approve boolean, note text default '')
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_admin();
  q public.dues_payments;
begin
  select * into q from public.dues_payments
  where id = admin_review_payment.payment_id and status = 'pending' for update;
  if q.id is null then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  update public.dues_payments set
    status = case when admin_review_payment.approve then 'approved' else 'rejected' end,
    admin_note = left(trim(coalesce(admin_review_payment.note, '')), 300),
    reviewed_by = v_uid, reviewed_at = now()
  where id = q.id;
  if admin_review_payment.approve then
    insert into public.owner_ledger (owner_id, kind, amount, payment_id, note, created_by)
    values (q.owner_id, 'payment', -q.amount, q.id,
            'Payment received' || case when q.reference <> '' then ' · ' || q.reference else '' end,
            v_uid);
  end if;
end $$;

-- Manual change to an owner's balance: negative to waive, positive to charge.
create function public.admin_adjust_dues(owner_id uuid, amount integer, note text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_admin();
begin
  if coalesce(admin_adjust_dues.amount, 0) = 0 or coalesce(trim(admin_adjust_dues.note), '') = '' then
    raise exception 'adjustment_invalid' using errcode = '22023';
  end if;
  insert into public.owner_ledger (owner_id, kind, amount, note, created_by)
  values (admin_adjust_dues.owner_id, 'adjustment', admin_adjust_dues.amount,
          left(trim(admin_adjust_dues.note), 300), v_uid);
end $$;

-- Customers who say they rented, with no handover code entered.
create function public.admin_disputes()
returns table (
  booking_id uuid,
  listing_id uuid,
  title text,
  start_date date,
  days smallint,
  estimate integer,
  commission_percent numeric,
  status text,
  close_reason text,
  closed_by text,
  owner_name text,
  owner_phone text,
  customer_name text,
  customer_phone text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query
    select b.id, b.listing_id, l.title, b.start_date, b.days, b.estimate, b.commission_percent,
      b.status::text, b.close_reason, b.closed_by,
      po.full_name, po.phone, pc.full_name, pc.phone, b.created_at
    from public.bookings b
    join public.listings l on l.id = b.listing_id
    left join public.profiles po on po.id = b.owner_id
    left join public.profiles pc on pc.id = b.customer_id
    where b.dispute = 'open'
    order by b.updated_at desc;
end $$;

-- charge: treat it as a rental at the listing price and add the commission.
create function public.admin_resolve_dispute(booking_id uuid, charge boolean)
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
  v_commission := round(coalesce(b.agreed_total, b.estimate) * b.commission_percent / 100)::integer;
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

create function public.admin_update_settings(
  commission_percent numeric,
  dues_limit integer,
  dues_days integer,
  payment_details text
) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  update public.app_settings set
    commission_percent = admin_update_settings.commission_percent,
    dues_limit = admin_update_settings.dues_limit,
    dues_days = admin_update_settings.dues_days,
    payment_details = trim(coalesce(admin_update_settings.payment_details, ''))
  where id;
end $$;

-- ---------------------------------------------------------------------------
-- Changes to existing functions
-- ---------------------------------------------------------------------------

-- Owners see 'dues' as the reason their vehicle is out of search.
create or replace function public.get_vehicle(
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

-- Owners can't delete their account to get out of paying.
create or replace function public.delete_my_account() returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  if (select d.balance from public.owner_dues(v_uid) d) > 0 then
    raise exception 'dues_outstanding' using errcode = '42501';
  end if;
  delete from auth.users where id = v_uid;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.lk_today, public.trip_price, public.booking_state, public.owner_dues,
  public.owner_is_restricted, public.is_live, public.customer_summary,
  public.request_booking, public.cancel_booking, public.confirm_booking_outcome,
  public.respond_booking, public.start_booking, public.mark_no_deal, public.rate_customer,
  public.my_bookings, public.get_booking, public.my_booking_badge, public.listing_booked_dates,
  public.get_app_settings, public.my_dues, public.report_dues_payment,
  public.admin_dues_overview, public.admin_review_payment, public.admin_adjust_dues,
  public.admin_disputes, public.admin_resolve_dispute, public.admin_update_settings,
  public.get_vehicle, public.delete_my_account
  from public, anon, authenticated;

grant execute on function public.get_vehicle, public.listing_booked_dates to anon, authenticated;
grant execute on function
  public.request_booking, public.cancel_booking, public.confirm_booking_outcome,
  public.respond_booking, public.start_booking, public.mark_no_deal, public.rate_customer,
  public.my_bookings, public.get_booking, public.my_booking_badge,
  public.get_app_settings, public.my_dues, public.report_dues_payment,
  public.admin_dues_overview, public.admin_review_payment, public.admin_adjust_dues,
  public.admin_disputes, public.admin_resolve_dispute, public.admin_update_settings,
  public.delete_my_account
  to authenticated;
