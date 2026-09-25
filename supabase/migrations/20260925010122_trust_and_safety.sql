-- Trust & safety (docs/SPEC.md §11):
--   * reports on listings and reviews, auto-hide after 3 reporters, admin moderation
--   * ratings & reviews, limited to people who contacted the owner, with a
--     "verified hire" when the owner confirms who rented the vehicle
--   * a daily limit on revealing owner phone numbers (anti-scraping)
--   * self-service account deletion
--
-- All new tables are private: the app only reaches them through the
-- functions below, which check who is calling.

-- ---------------------------------------------------------------------------
-- Why a listing is hidden
-- ---------------------------------------------------------------------------

alter table public.listings
  add column hidden_reason text check (hidden_reason in ('reports', 'admin')),
  add column hidden_at timestamptz;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------

create table public.reviews (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  condition_rating smallint check (condition_rating between 1 and 5),
  owner_rating smallint check (owner_rating between 1 and 5),
  value_rating smallint check (value_rating between 1 and 5),
  tags text[] not null default '{}' check (tags <@ array[
    'clean', 'on_time', 'as_described', 'good_driver', 'good_value',
    'price_changed', 'late', 'not_as_described', 'poor_condition'
  ]),
  comment text not null default '' check (char_length(comment) <= 1000),
  owner_reply text check (char_length(owner_reply) between 1 and 1000),
  owner_replied_at timestamptz,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, reviewer_id)
);

create index reviews_reviewer_idx on public.reviews (reviewer_id);

create trigger reviews_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

-- Owner says "this customer rented it" (turns their review into a verified hire).
create table public.hire_confirmations (
  listing_id uuid not null references public.listings (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (listing_id, customer_id)
);

create index hire_confirmations_customer_idx on public.hire_confirmations (customer_id);

-- People who contacted but didn't rent answer two quick questions instead of stars.
create table public.contact_feedback (
  listing_id uuid not null references public.listings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  owner_answered boolean not null,
  info_accurate boolean,
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);

create index contact_feedback_user_idx on public.contact_feedback (user_id);
create index contact_events_user_created_idx on public.contact_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create type public.report_reason as enum (
  'not_available', 'wrong_details', 'fake_or_scam', 'wrong_photos',
  'rude_or_unsafe', 'offensive', 'other'
);
create type public.report_status as enum ('open', 'dismissed', 'actioned');

create table public.reports (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  review_id bigint references public.reviews (id) on delete cascade, -- null = the listing itself
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason public.report_reason not null,
  note text not null default '' check (char_length(note) <= 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One report per person per listing / review (reporting again updates it).
create unique index reports_one_per_listing on public.reports (listing_id, reporter_id)
  where review_id is null;
create unique index reports_one_per_review on public.reports (review_id, reporter_id)
  where review_id is not null;
create index reports_open_idx on public.reports (status, listing_id);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);

create trigger reports_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;
alter table public.hire_confirmations enable row level security;
alter table public.contact_feedback enable row level security;
alter table public.reports enable row level security;
revoke all on public.reviews, public.hire_confirmations, public.contact_feedback, public.reports
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'sign_in_required' using errcode = '28000';
  end if;
  return v_uid;
end $$;

create function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  if not coalesce((select is_admin from public.profiles where id = v_uid), false) then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return v_uid;
end $$;

-- "Kasun Perera" -> "Kasun P."
create function public.short_name(full_name text) returns text
language sql immutable set search_path = '' as $$
  select case
    when coalesce(trim(full_name), '') = '' then 'RentAnything user'
    when position(' ' in trim(full_name)) = 0 then trim(full_name)
    else split_part(trim(full_name), ' ', 1) || ' '
         || upper(left(split_part(trim(full_name), ' ', 2), 1)) || '.'
  end
$$;

-- Can this user review this listing?
--   ok | own_listing | not_contacted | too_soon | expired
-- Anyone who contacted the owner can review from 1 day after their first
-- contact until 60 days after their last; a confirmed hire can review for 60
-- days after the confirmation.
create function public.review_eligibility(p_listing_id uuid, p_user_id uuid)
returns text
language sql stable security definer set search_path = '' as $$
  with c as (
    select min(created_at) as first_at, max(created_at) as last_at
    from public.contact_events
    where listing_id = p_listing_id and user_id = p_user_id
  ), h as (
    select confirmed_at from public.hire_confirmations
    where listing_id = p_listing_id and customer_id = p_user_id
  )
  select case
    when exists (select 1 from public.listings where id = p_listing_id and owner_id = p_user_id)
      then 'own_listing'
    when exists (select 1 from h where confirmed_at > now() - interval '60 days')
      then 'ok'
    when (select first_at from c) is null
      then case when exists (select 1 from h) then 'expired' else 'not_contacted' end
    when (select last_at from c) < now() - interval '60 days'
      then 'expired'
    when (select first_at from c) > now() - interval '1 day'
      then 'too_soon'
    else 'ok'
  end
$$;

-- Rating shown for a listing: a weighted ("Bayesian") average that starts
-- from 4.0 as if there were 3 extra average reviews, so one or two extreme
-- reviews can't swing it. Only shown once there are 3 or more reviews.
create function public.rating_summary(p_listing_ids uuid[])
returns table (rating_avg numeric, rating_count integer, verified_count integer)
language sql stable security definer set search_path = '' as $$
  select
    case when count(*) >= 3
      then round((3 * 4.0 + sum(r.rating)) / (3 + count(*)), 1)
    end,
    count(*)::integer,
    count(h.customer_id)::integer
  from public.reviews r
  left join public.hire_confirmations h
    on h.listing_id = r.listing_id and h.customer_id = r.reviewer_id
  where r.listing_id = any (p_listing_ids) and not r.is_hidden
$$;

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

create function public.report_listing(
  listing_id uuid,
  reason public.report_reason,
  note text default ''
) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  v_owner uuid;
begin
  select l.owner_id into v_owner from public.listings l where l.id = report_listing.listing_id;
  if v_owner is null then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;
  if v_owner = v_uid then
    raise exception 'cannot_report_own' using errcode = '42501';
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id = v_uid and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'report_limit' using errcode = '54000';
  end if;

  insert into public.reports (listing_id, reporter_id, reason, note)
  values (report_listing.listing_id, v_uid, report_listing.reason, left(coalesce(report_listing.note, ''), 500))
  on conflict (listing_id, reporter_id) where review_id is null
  do update set reason = excluded.reason, note = excluded.note, status = 'open';

  -- Safety net: 3 different people -> hidden until an admin reviews it.
  if (select count(distinct r.reporter_id) from public.reports r
      where r.listing_id = report_listing.listing_id
        and r.review_id is null and r.status = 'open') >= 3 then
    update public.listings
    set is_hidden = true, hidden_reason = 'reports', hidden_at = now()
    where id = report_listing.listing_id and not is_hidden;
  end if;
end $$;

create function public.report_review(
  review_id bigint,
  reason public.report_reason,
  note text default ''
) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  v_listing uuid;
begin
  select r.listing_id into v_listing from public.reviews r where r.id = report_review.review_id;
  if v_listing is null then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id = v_uid and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'report_limit' using errcode = '54000';
  end if;

  insert into public.reports (listing_id, review_id, reporter_id, reason, note)
  values (v_listing, report_review.review_id, v_uid, report_review.reason,
          left(coalesce(report_review.note, ''), 500))
  on conflict (review_id, reporter_id) where review_id is not null
  do update set reason = excluded.reason, note = excluded.note, status = 'open';

  if (select count(distinct r.reporter_id) from public.reports r
      where r.review_id = report_review.review_id and r.status = 'open') >= 3 then
    update public.reviews set is_hidden = true where id = report_review.review_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Admin moderation
-- ---------------------------------------------------------------------------

-- Listings (and reviews) with open reports, most-reported first.
create function public.admin_report_queue()
returns table (
  listing_id uuid,
  title text,
  town text,
  cover_photo text,
  owner_name text,
  owner_phone text,
  is_hidden boolean,
  hidden_reason text,
  open_count integer,
  latest_at timestamptz,
  reports jsonb
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query
    select
      l.id, l.title, l.town,
      (select p.path from public.listing_photos p where p.listing_id = l.id
        order by p.position, p.created_at limit 1),
      pr.full_name, pr.phone, l.is_hidden, l.hidden_reason,
      count(*)::integer,
      max(r.created_at),
      jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reason', r.reason,
        'note', r.note,
        'created_at', r.created_at,
        'review_id', r.review_id,
        'review_comment', rv.comment,
        'review_rating', rv.rating,
        'review_hidden', rv.is_hidden
      ) order by r.created_at desc)
    from public.reports r
    join public.listings l on l.id = r.listing_id
    join public.profiles pr on pr.id = l.owner_id
    left join public.reviews rv on rv.id = r.review_id
    where r.status = 'open'
    group by l.id, pr.full_name, pr.phone
    order by count(*) desc, max(r.created_at) desc;
end $$;

create function public.admin_hidden_listings()
returns table (
  listing_id uuid,
  title text,
  town text,
  cover_photo text,
  owner_name text,
  owner_phone text,
  hidden_reason text,
  hidden_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  return query
    select l.id, l.title, l.town,
      (select p.path from public.listing_photos p where p.listing_id = l.id
        order by p.position, p.created_at limit 1),
      pr.full_name, pr.phone, l.hidden_reason, l.hidden_at
    from public.listings l
    join public.profiles pr on pr.id = l.owner_id
    where l.is_hidden
    order by l.hidden_at desc nulls last;
end $$;

-- action: hide | unhide | dismiss (reports were wrong; undoes an auto-hide)
create function public.admin_moderate_listing(listing_id uuid, action text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  if action = 'hide' then
    update public.listings
    set is_hidden = true, hidden_reason = 'admin', hidden_at = now()
    where id = admin_moderate_listing.listing_id;
    update public.reports set status = 'actioned'
    where reports.listing_id = admin_moderate_listing.listing_id
      and review_id is null and status = 'open';
  elsif action = 'unhide' then
    update public.listings
    set is_hidden = false, hidden_reason = null, hidden_at = null
    where id = admin_moderate_listing.listing_id;
    update public.reports set status = 'dismissed'
    where reports.listing_id = admin_moderate_listing.listing_id
      and review_id is null and status = 'open';
  elsif action = 'dismiss' then
    update public.reports set status = 'dismissed'
    where reports.listing_id = admin_moderate_listing.listing_id
      and review_id is null and status = 'open';
    update public.listings
    set is_hidden = false, hidden_reason = null, hidden_at = null
    where id = admin_moderate_listing.listing_id and hidden_reason = 'reports';
  else
    raise exception 'unknown_action' using errcode = '22023';
  end if;
end $$;

-- action: hide | unhide | dismiss
create function public.admin_moderate_review(review_id bigint, action text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public.require_admin();
  if action not in ('hide', 'unhide', 'dismiss') then
    raise exception 'unknown_action' using errcode = '22023';
  end if;
  update public.reviews
  set is_hidden = (action = 'hide')
  where id = admin_moderate_review.review_id
    and (action <> 'dismiss' or is_hidden);
  update public.reports
  set status = case when action = 'hide' then 'actioned' else 'dismissed' end::public.report_status
  where reports.review_id = admin_moderate_review.review_id and status = 'open';
end $$;

-- ---------------------------------------------------------------------------
-- Reviews API
-- ---------------------------------------------------------------------------

-- What the signed-in user can do on a listing's reviews.
create function public.my_review_status(listing_id uuid)
returns table (
  eligibility text,       -- see review_eligibility(); 'sign_in' when signed out
  verified boolean,       -- the owner confirmed this user rented it
  contacted boolean,
  my_review jsonb,
  my_feedback jsonb
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return query select 'sign_in'::text, false, false, null::jsonb, null::jsonb;
    return;
  end if;
  return query select
    public.review_eligibility(my_review_status.listing_id, v_uid),
    exists (select 1 from public.hire_confirmations h
            where h.listing_id = my_review_status.listing_id and h.customer_id = v_uid),
    exists (select 1 from public.contact_events e
            where e.listing_id = my_review_status.listing_id and e.user_id = v_uid),
    (select to_jsonb(r) - 'reviewer_id' from public.reviews r
     where r.listing_id = my_review_status.listing_id and r.reviewer_id = v_uid),
    (select to_jsonb(f) - 'user_id' from public.contact_feedback f
     where f.listing_id = my_review_status.listing_id and f.user_id = v_uid);
end $$;

create function public.submit_review(
  listing_id uuid,
  rating smallint,
  condition_rating smallint default null,
  owner_rating smallint default null,
  value_rating smallint default null,
  tags text[] default '{}',
  comment text default ''
) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
  v_ok text := public.review_eligibility(submit_review.listing_id, v_uid);
  v_id bigint;
begin
  if v_ok <> 'ok' then
    raise exception 'review_%', v_ok using errcode = '42501';
  end if;
  insert into public.reviews as r (
    listing_id, reviewer_id, rating, condition_rating, owner_rating, value_rating, tags, comment
  ) values (
    submit_review.listing_id, v_uid, submit_review.rating, submit_review.condition_rating,
    submit_review.owner_rating, submit_review.value_rating,
    coalesce(submit_review.tags, '{}'), trim(coalesce(submit_review.comment, ''))
  )
  on conflict on constraint reviews_listing_id_reviewer_id_key do update set
    rating = excluded.rating,
    condition_rating = excluded.condition_rating,
    owner_rating = excluded.owner_rating,
    value_rating = excluded.value_rating,
    tags = excluded.tags,
    comment = excluded.comment
  returning r.id into v_id;
  return v_id;
end $$;

-- Quick feedback from people who contacted but didn't rent.
create function public.submit_contact_feedback(
  listing_id uuid,
  owner_answered boolean,
  info_accurate boolean default null
) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  if not exists (
    select 1 from public.contact_events e
    where e.listing_id = submit_contact_feedback.listing_id and e.user_id = v_uid
      and e.created_at > now() - interval '60 days'
  ) then
    raise exception 'review_not_contacted' using errcode = '42501';
  end if;
  insert into public.contact_feedback (listing_id, user_id, owner_answered, info_accurate)
  values (submit_contact_feedback.listing_id, v_uid, submit_contact_feedback.owner_answered,
          submit_contact_feedback.info_accurate)
  on conflict (listing_id, user_id) do update set
    owner_answered = excluded.owner_answered,
    info_accurate = excluded.info_accurate,
    created_at = now();
end $$;

-- Public list of a listing's reviews: verified hires first, then newest.
create function public.list_reviews(
  listing_id uuid,
  page_size integer default 10,
  page_offset integer default 0
) returns table (
  id bigint,
  reviewer_name text,
  verified boolean,
  rating smallint,
  condition_rating smallint,
  owner_rating smallint,
  value_rating smallint,
  tags text[],
  comment text,
  owner_reply text,
  owner_replied_at timestamptz,
  created_at timestamptz,
  is_mine boolean
)
language sql stable security definer set search_path = '' as $$
  select
    r.id,
    public.short_name(p.full_name),
    h.customer_id is not null,
    r.rating, r.condition_rating, r.owner_rating, r.value_rating,
    r.tags, r.comment, r.owner_reply, r.owner_replied_at, r.created_at,
    r.reviewer_id = (select auth.uid())
  from public.reviews r
  join public.listings l on l.id = r.listing_id
  left join public.profiles p on p.id = r.reviewer_id
  left join public.hire_confirmations h
    on h.listing_id = r.listing_id and h.customer_id = r.reviewer_id
  where r.listing_id = list_reviews.listing_id
    and not r.is_hidden
    and (public.is_live(l) or l.owner_id = (select auth.uid()))
  order by (h.customer_id is not null) desc, r.created_at desc
  limit greatest(1, least(page_size, 50))
  offset greatest(0, page_offset)
$$;

-- The owner's public reply (pass null to remove it).
create function public.reply_to_review(review_id bigint, reply text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  update public.reviews r
  set owner_reply = nullif(trim(reply_to_review.reply), ''),
      owner_replied_at = case when nullif(trim(reply_to_review.reply), '') is null then null else now() end
  from public.listings l
  where r.id = reply_to_review.review_id and l.id = r.listing_id and l.owner_id = v_uid;
  if not found then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;
end $$;

-- People who contacted the owner about this listing in the last 14 days, for
-- "Who rented it?". Owner only.
create function public.recent_contacts(listing_id uuid)
returns table (user_id uuid, name text, last_contacted_at timestamptz, confirmed boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  if not exists (select 1 from public.listings l
                 where l.id = recent_contacts.listing_id and l.owner_id = v_uid) then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;
  return query
    select e.user_id, public.short_name(p.full_name), max(e.created_at),
      exists (select 1 from public.hire_confirmations h
              where h.listing_id = recent_contacts.listing_id and h.customer_id = e.user_id)
    from public.contact_events e
    left join public.profiles p on p.id = e.user_id
    where e.listing_id = recent_contacts.listing_id
      and e.created_at > now() - interval '14 days'
      and e.user_id <> v_uid
    group by e.user_id, p.full_name
    order by max(e.created_at) desc
    limit 20;
end $$;

-- Owner confirms who rented the vehicle. The customer must have contacted
-- them about this listing in the last 30 days.
create function public.confirm_hire(listing_id uuid, customer_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  if not exists (select 1 from public.listings l
                 where l.id = confirm_hire.listing_id and l.owner_id = v_uid) then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.contact_events e
                 where e.listing_id = confirm_hire.listing_id
                   and e.user_id = confirm_hire.customer_id
                   and e.created_at > now() - interval '30 days') then
    raise exception 'customer_not_contacted' using errcode = '42501';
  end if;
  insert into public.hire_confirmations (listing_id, customer_id)
  values (confirm_hire.listing_id, confirm_hire.customer_id)
  on conflict (listing_id, customer_id) do update set confirmed_at = now();
end $$;

-- Vehicles the signed-in user can review now and hasn't yet.
create function public.my_review_invites()
returns table (
  listing_id uuid,
  title text,
  town text,
  cover_photo text,
  verified boolean,
  contacted_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  return query
    with mine as (
      select e.listing_id as lid, max(e.created_at) as at
      from public.contact_events e where e.user_id = v_uid group by e.listing_id
      union
      select h.listing_id, h.confirmed_at from public.hire_confirmations h where h.customer_id = v_uid
    ), latest as (
      select lid, max(at) as at from mine group by lid
    )
    select l.id, l.title, l.town,
      (select p.path from public.listing_photos p where p.listing_id = l.id
        order by p.position, p.created_at limit 1),
      exists (select 1 from public.hire_confirmations h
              where h.listing_id = l.id and h.customer_id = v_uid),
      latest.at
    from latest
    join public.listings l on l.id = latest.lid
    where public.review_eligibility(l.id, v_uid) = 'ok'
      and not exists (select 1 from public.reviews r where r.listing_id = l.id and r.reviewer_id = v_uid)
      and not exists (select 1 from public.contact_feedback f where f.listing_id = l.id and f.user_id = v_uid)
    order by latest.at desc
    limit 10;
end $$;

-- ---------------------------------------------------------------------------
-- Anti-scraping: at most 30 different owners' numbers per user per day
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

  select l.owner_id into v_owner
  from public.listings l
  where l.id = get_listing_contact.listing_id and public.is_live(l);

  if v_owner is null then
    raise exception 'listing_not_available' using errcode = 'P0002';
  end if;

  if (select count(distinct e.listing_id) from public.contact_events e
      where e.user_id = v_uid
        and e.created_at > now() - interval '1 day'
        and e.listing_id <> get_listing_contact.listing_id) >= 30 then
    raise exception 'contact_limit' using errcode = '54000';
  end if;

  insert into public.contact_events (listing_id, user_id, channel)
  values (get_listing_contact.listing_id, v_uid, get_listing_contact.channel);

  return query
    select p.phone, coalesce(p.whatsapp, p.phone)
    from public.profiles p where p.id = v_owner;
end $$;

-- ---------------------------------------------------------------------------
-- Public read API, now with ratings (return types change, so drop + create)
-- ---------------------------------------------------------------------------

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
    v.self_drive, v.driver_available, v.driver_price_per_day,
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
    case when l.owner_id = (select auth.uid()) then l.hidden_reason end,
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

-- ---------------------------------------------------------------------------
-- Account deletion (Play Store requirement). The app deletes the user's
-- photos from Storage first; everything else cascades from auth.users.
-- ---------------------------------------------------------------------------

create function public.delete_my_account() returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := public.require_user();
begin
  delete from auth.users where id = v_uid;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.require_user, public.require_admin, public.short_name, public.review_eligibility,
  public.rating_summary, public.report_listing, public.report_review,
  public.admin_report_queue, public.admin_hidden_listings, public.admin_moderate_listing,
  public.admin_moderate_review, public.my_review_status, public.submit_review,
  public.submit_contact_feedback, public.list_reviews, public.reply_to_review,
  public.recent_contacts, public.confirm_hire, public.my_review_invites,
  public.search_vehicles, public.get_vehicle, public.delete_my_account
  from public, anon, authenticated;

grant execute on function public.search_vehicles, public.get_vehicle, public.list_reviews,
  public.my_review_status
  to anon, authenticated;
grant execute on function
  public.report_listing, public.report_review,
  public.admin_report_queue, public.admin_hidden_listings,
  public.admin_moderate_listing, public.admin_moderate_review,
  public.submit_review, public.submit_contact_feedback, public.reply_to_review,
  public.recent_contacts, public.confirm_hire, public.my_review_invites,
  public.delete_my_account
  to authenticated;
