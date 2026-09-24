-- Fixes from the Supabase database advisors.

-- Pin search_path on the remaining functions (lint 0011).
alter function public.set_updated_at() set search_path = '';
alter function public.is_live(public.listings) set search_path = '';

-- Covering index for the contact_events.user_id foreign key (lint 0001).
create index contact_events_user_idx on public.contact_events (user_id);

-- Note: the "security definer function executable" warnings for
-- search_vehicles, get_vehicle and get_listing_contact are intentional:
-- they are the public API and only return safe columns (see the first
-- migration). is_admin() and owns_listing() only answer about the caller.
