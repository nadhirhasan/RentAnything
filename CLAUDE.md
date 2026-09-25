@AGENTS.md

# RentAnything

Vehicle rental marketplace for Sri Lanka (booking.com-style, but for vehicles).
The full product spec and all decisions made with the founder are in
`docs/SPEC.md`. Read it before changing behaviour, and update it when a
decision changes.

- Design: Figma file `YZJ5usF3xphGzmvqKj8pYv` ("RentAnything — App Design v1").
  The founder's Figma is on the Starter plan (~20 MCP calls / month), so batch
  Figma work into few calls.
- Backend: Supabase project `vqdngaqjrucwbmlwfcso` (RentAnything, ap-south-1).
  Apply schema changes as a new file in `supabase/migrations/` and name the
  file with the version Supabase records, so local and remote history match.
  Schema, RLS and SQL functions live in `supabase/migrations/`. Public reads go through `search_vehicles()` /
  `get_vehicle()` (security definer; never expose exact location or phone).
  Owner phone numbers only come from `get_listing_contact()` and `get_conversation()`,
  and only after the owner accepts a booking (chat hides numbers before that).
- Future categories (house rentals etc.) get their own `*_details` table next
  to `vehicle_details`; `listings` stays generic.

## Commands

- `npm run typecheck`, `npm run lint`, `npm test` — run all three before committing.
- `npm run test:db` — database tests on local Postgres + PostGIS
  (`service postgresql start`; run as the `postgres` user).
- Web build check: `npx expo export --platform web --clear`.

## Conventions

- Pure logic (pricing, formatting, form validation) lives in `src/lib/*.ts`
  with type-only imports so `node --test` can run it; add tests next to it.
- UI primitives are in `src/components/ui.tsx`; colours and spacing in
  `src/theme.ts` (tokens from the Figma style sheet).
- The React Compiler lint rules forbid synchronous `setState` in effects:
  tag async results with the request key and derive loading state instead
  (see `src/app/(tabs)/index.tsx`).
