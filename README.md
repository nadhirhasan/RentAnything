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

### 1. Supabase project

The live project is **RentAnything** (ref `vqdngaqjrucwbmlwfcso`, region
Mumbai `ap-south-1`) and already has both migrations applied. To set up a
fresh project instead:

1. Create a free project at [supabase.com](https://supabase.com).
2. Apply the database schema. Either:
   - with the CLI:
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push
     ```
   - or paste each file in `supabase/migrations/` (in order) into the
     dashboard's **SQL Editor** and run it.
3. In **Authentication → Providers**, make sure **Email** is enabled. For
   quick testing you can turn off **Confirm email**.

### 2. Configure the app

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → API** (use the publishable key, `sb_publishable_…`).
For the live project the URL is `https://vqdngaqjrucwbmlwfcso.supabase.co`.
Set `EXPO_PUBLIC_SUPPORT_WHATSAPP` to the support WhatsApp number (e.g.
`94771234567`); the Help & support buttons are hidden while it's empty.

### 3. Run it

```bash
npm install
npm run web        # in the browser
npm start          # then scan the QR code with Expo Go on your phone
```

### 4. Push notifications (phone builds)

Chat messages and booking updates are sent as push notifications. Expo Go
can't receive them, so you need a development build of the app. You set this
up once:

1. **Link an Expo project.** Run `npx eas-cli@latest login`, then
   `npx eas-cli@latest init`. This adds `extra.eas.projectId` to `app.json`;
   commit that change.
2. **Android (Firebase).**
   1. In the [Firebase console](https://console.firebase.google.com), create a
      project and add an Android app with package `lk.rentanything.app`.
   2. Download `google-services.json` into the project root, then add
      `"googleServicesFile": "./google-services.json"` under `android` in
      `app.json`.
   3. In Firebase → Project settings → Service accounts, generate a private
      key. Upload it with `npx eas-cli@latest credentials` → Android →
      production → Google Service Account → FCM V1.
3. **Build and install.** Run
   `npx eas-cli@latest build --profile development --platform android` and
   install the APK from the link. Then run `npx expo start --dev-client` and
   open the app. It asks for notification permission after your first
   message, booking request or new listing.
4. **iOS.** This needs an Apple Developer account. `eas build` creates the
   push key for you.

The web app has no push notifications. It shows unread badges instead.

### Local Supabase (optional)

With Docker installed, `npx supabase start` runs the whole backend locally and
loads `supabase/seed.sql`: six demo vehicles around Colombo / Gampaha, owned
by `demo@rentanything.lk` / `password123`.

## Checks

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint (Expo config)
npm test            # unit tests: pricing, formatting, listing form
npm run test:db     # database tests: RLS, search, bookings, chat (needs local Postgres + PostGIS)
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
