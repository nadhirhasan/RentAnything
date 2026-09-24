-- Demo data for local development (`npx supabase start` / `npx supabase db reset`).
-- Creates one demo owner (demo@rentanything.lk / password123) with vehicles
-- around Colombo and Gampaha. Don't run this on production.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-0000000000d1',
  'authenticated', 'authenticated', 'demo@rentanything.lk',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Sunil Perera"}', now(), now()
);

update public.profiles set phone = '077 123 4567'
where id = '00000000-0000-0000-0000-0000000000d1';

with l as (
  insert into public.listings (owner_id, title, description, lat, lng, town, is_available, available_again_on)
  values
    ('00000000-0000-0000-0000-0000000000d1', 'Toyota KDH High Roof · 14 seats · AC',
     'Clean, well maintained high roof van. Great for family trips and weddings.',
     6.978, 79.929, 'Kiribathgoda', true, null),
    ('00000000-0000-0000-0000-0000000000d1', 'Suzuki Every Buddy Van · Double seat · AC',
     'Modified with a second seat row. Ideal for small families.',
     7.001, 79.953, 'Kadawatha', true, null),
    ('00000000-0000-0000-0000-0000000000d1', 'Toyota Axio · AC',
     'Hybrid, very fuel efficient.', 6.9553, 79.922, 'Kelaniya', true, null),
    ('00000000-0000-0000-0000-0000000000d1', 'Nissan Caravan · 10 seats · AC',
     'Airport pickups and tours.', 7.2083, 79.8358, 'Negombo', true, null),
    ('00000000-0000-0000-0000-0000000000d1', 'Toyota Coaster Rosa Bus · 29 seats',
     'For trips, pilgrimages and staff transport.', 6.8649, 79.8997, 'Nugegoda', true, null),
    ('00000000-0000-0000-0000-0000000000d1', 'Suzuki Every Buddy Van · AC',
     'Currently out on a hire.', 7.0873, 79.999, 'Gampaha', false,
     ((now() at time zone 'Asia/Colombo')::date + 3))
  returning id, title
)
insert into public.vehicle_details (
  listing_id, vehicle_type, make, model, year, seats, double_seat, has_ac, transmission, fuel_type,
  price_per_day, km_per_day, extra_km_rate, min_days, weekly_price, weekly_km, monthly_price, monthly_km,
  self_drive, driver_available, driver_price_per_day, deposit, documents, fuel_policy
)
select l.id, d.vehicle_type, d.make, d.model, d.year, d.seats, d.double_seat, d.has_ac, d.transmission,
  d.fuel_type, d.price_per_day, d.km_per_day, d.extra_km_rate, d.min_days, d.weekly_price, d.weekly_km,
  d.monthly_price, d.monthly_km, d.self_drive, d.driver_available, d.driver_price_per_day, d.deposit,
  d.documents, d.fuel_policy
from l
join (values
  ('Toyota KDH High Roof · 14 seats · AC', 'van'::public.vehicle_type, 'Toyota', 'KDH', 2014::smallint, 14::smallint, false, true,
   'auto'::public.transmission, 'diesel'::public.fuel_type, 12000, 100, 60, 1::smallint, 77000, 700, 240000, 3000,
   false, true, 3500, null::integer, array['nic'], 'pay_used'::public.fuel_policy),
  ('Suzuki Every Buddy Van · Double seat · AC', 'buddy_van', 'Suzuki', 'Every', 2016, 5, true, true,
   'auto', 'petrol', 6000, 100, 45, 1, 38000, 700, null, null,
   true, false, null, 25000, array['nic', 'driving_licence'], 'same_level'),
  ('Toyota Axio · AC', 'car', 'Toyota', 'Axio', 2015, 5, false, true,
   'auto', 'hybrid', 8500, 150, 40, 2, null, null, 180000, 3000,
   true, true, 3000, 50000, array['nic', 'driving_licence', 'proof_of_address'], 'same_level'),
  ('Nissan Caravan · 10 seats · AC', 'van', 'Nissan', 'Caravan', 2012, 10, false, true,
   'manual', 'diesel', 10000, null, null, 1, null, null, null, null,
   false, true, 0, null, array['nic'], 'pay_used'),
  ('Toyota Coaster Rosa Bus · 29 seats', 'bus', 'Toyota', 'Coaster', 2010, 29, false, false,
   'manual', 'diesel', 25000, 150, 90, 1, null, null, null, null,
   false, true, 0, null, array[]::text[], 'pay_used'),
  ('Suzuki Every Buddy Van · AC', 'buddy_van', 'Suzuki', 'Every', 2018, 4, false, true,
   'auto', 'petrol', 5500, 100, 40, 1, null, null, 120000, 3000,
   true, false, null, 20000, array['nic'], 'same_level')
) as d(title, vehicle_type, make, model, year, seats, double_seat, has_ac, transmission, fuel_type,
       price_per_day, km_per_day, extra_km_rate, min_days, weekly_price, weekly_km, monthly_price, monthly_km,
       self_drive, driver_available, driver_price_per_day, deposit, documents, fuel_policy)
  on d.title = l.title;
