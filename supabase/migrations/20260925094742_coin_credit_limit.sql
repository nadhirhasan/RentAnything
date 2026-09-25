-- 1 coin = Rs 1, and owners get 1,000 coins of credit before their vehicles
-- are hidden (docs/SPEC.md §16). Below that the app only reminds them to top up.
alter table public.app_settings
  alter column coin_value set default 1,
  alter column dues_limit set default 1000;
update public.app_settings set coin_value = 1 where coin_value = 10;
update public.app_settings set dues_limit = 1000 where dues_limit = 5000;

-- Settings the caller doesn't send keep their current value (older app
-- versions only send the first four).
drop function public.admin_update_settings(numeric, integer, integer, text, integer, integer, integer);

create function public.admin_update_settings(
  commission_percent numeric,
  dues_limit integer,
  dues_days integer,
  payment_details text,
  free_rentals integer default null,
  fee_cap integer default null,
  coin_value integer default null
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
    free_rentals = coalesce(admin_update_settings.free_rentals, app_settings.free_rentals),
    fee_cap = coalesce(admin_update_settings.fee_cap, app_settings.fee_cap),
    coin_value = coalesce(admin_update_settings.coin_value, app_settings.coin_value)
  where id;
end $$;

revoke execute on function public.admin_update_settings from public, anon, authenticated;
grant execute on function public.admin_update_settings to authenticated;
