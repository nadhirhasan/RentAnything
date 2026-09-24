# RentAnything

Find a rental vehicle near you in Sri Lanka without calling 50 people.

Owners list each vehicle once with every detail customers ask about (seats,
AC, double seat, price per day, free km, extra km charge, weekly / monthly
offers, driver option) and keep an **available / not available** switch up to
date. Customers open the app, it finds their location, and it shows the
**closest vehicles that are available right now**. Then they call or
WhatsApp the owner.

- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Design (Figma): [RentAnything — App Design v1](https://www.figma.com/design/YZJ5usF3xphGzmvqKj8pYv)

## Stack

- **Expo (React Native) + Expo Router + TypeScript**: one codebase for web,
  Android and iOS
- **Supabase**: Postgres + PostGIS (distance search), Auth, Storage (photos),
  Row Level Security

## Getting started

### 1. Create the Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. Apply the database schema. Either:
   - with the CLI:
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push
     ```
   - or paste `supabase/migrations/20260924000000_vehicle_listings.sql` into
     the dashboard's **SQL Editor** and run it.
3. In **Authentication → Providers**, make sure **Email** is enabled. For
   quick testing you can turn off **Confirm email**.

### 2. Configure the app

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → API**.

### 3. Run it

```bash
npm install
npm run web        # in the browser
npm start          # then scan the QR code with Expo Go on your phone
```

### Local Supabase (optional)

With Docker installed, `npx supabase start` runs the whole backend locally and
loads `supabase/seed.sql`: six demo vehicles around Colombo / Gampaha, owned
by `demo@rentanything.lk` / `password123`.

## Checks

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint (Expo config)
npm test            # unit tests: pricing, formatting, listing form
npm run test:db     # database tests: RLS, search, contact gate (needs local Postgres + PostGIS)
```

## Project layout

```
src/app/                 screens (Expo Router: every file is a route)
  (tabs)/index.tsx       Explore: nearest available vehicles + filters
  (tabs)/my-vehicles.tsx Owner: vehicles with availability switch
  (tabs)/account.tsx     Profile + contact number
  vehicle/[id].tsx       Vehicle page, trip estimate, Call / WhatsApp
  filters.tsx            Filter sheet
  sign-in.tsx            Sign in / sign up
  listing/new.tsx        Add vehicle (4 steps)
  listing/[id]/edit.tsx  Edit vehicle
src/components/          UI kit (matches the Figma design) and shared pieces
src/lib/                 Supabase client, data access, pricing, form logic
supabase/migrations/     Database schema, RLS policies and SQL functions
supabase/seed.sql        Demo data for local development
scripts/db-test/         Database tests on plain Postgres + PostGIS
```
