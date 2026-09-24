# RentAnything — Product Spec

> Version 1: **vehicle rentals in Sri Lanka**. The platform is built so other rental
> categories (houses, equipment, …) can be added later without a rewrite.

## 1. Why

Finding a rental vehicle in Sri Lanka today means scrolling ikman / Facebook ads and
calling owner after owner ("is it free on Saturday? how many seats? AC? how much per
km?"). The founder called ~50 people to find one van for a family trip to Colombo.

RentAnything lets owners publish each vehicle **once, with every detail customers ask
about**, and keep a simple **available / not available** switch up to date. Customers
open the app, it finds their location, and it shows the **closest vehicles that are
available right now**, filtered to what they need.

## 2. Scope of v1

In scope:

- Owners list vehicles with full details, photos, pricing, km terms and driver option.
- Per-vehicle **availability switch** (off = hidden from the feed, no unwanted calls).
- Customers browse without an account, filter, and see results **sorted by distance**
  from their GPS location.
- **Call** / **WhatsApp** the owner. Signing in is required before the phone number is
  revealed.

Out of scope for v1 (possible later):

- In-app booking requests, calendars, payments.
- Listing verification / approval (listings go live immediately; an admin can hide one).
- Reviews and ratings.
- Sinhala / Tamil (English only for now).
- Non-vehicle categories (house rentals, etc.).
- Phone-number (SMS OTP) login.

## 3. Users

One account type. Anyone can browse; any signed-in user can also list vehicles
(becoming an "owner"). No separate owner app.

| Who | Can do |
| --- | --- |
| Visitor (not signed in) | Browse feed, filter, open listings, see price estimate |
| Signed-in user | Everything above + reveal owner phone, call, WhatsApp |
| Owner (signed-in user with listings) | Add / edit / delete vehicles, flip availability, set driver option |
| Admin | Hide any listing |

## 4. Vehicle listing

### 4.1 Vehicle details

| Field | Notes |
| --- | --- |
| Vehicle type | Car, SUV / Jeep, Van, **Buddy van**, Mini bus, Bus, Double cab / Pickup, Lorry / Truck, Three-wheeler, Motorbike / Scooter, Other |
| Make, model, year | e.g. Toyota KDH (2012), Suzuki Every (2016) |
| Seats | Passenger seats including the driver |
| Double seat | **Buddy van only.** A buddy van normally has one seat row behind the driver; "double seat" means it's modified to two rows |
| AC | Simple yes / no tick |
| Transmission | Auto / Manual |
| Fuel type | Petrol / Diesel / Hybrid / Electric |
| Title | Auto-suggested, e.g. "Toyota KDH High Roof — 14 seats" |
| Description | Free text |
| Photos | Up to 8, first one is the cover |
| Location | Where the vehicle is parked: GPS "use my current location" or pick a town; stored as a point + town name |

### 4.2 Pricing (LKR)

Based on how Sri Lankan owners already advertise (daily rate + km allowance + extra km
charge, with weekly / monthly packages for long hires):

| Field | Notes |
| --- | --- |
| Price per day | Required |
| Free km per day | Empty = unlimited km |
| Extra km charge | Rs per km over the allowance |
| Minimum rental days | Default 1 |
| Weekly offer | Optional: total price for 7 days + km included |
| Monthly offer | Optional: total price for 30 days + km included (e.g. Rs 240,000 incl. 3,000 km) |

### 4.3 Driver and self-drive

| Field | Notes |
| --- | --- |
| Self-drive allowed | Yes / No |
| Driver available | Yes / No |
| Driver price per day | Required when a driver is available. **All-inclusive** (no separate batta / food / night charges) |

At least one of self-drive or driver must be on. If self-drive is off the listing shows
"With driver only".

### 4.4 Terms (all optional)

| Field | Notes |
| --- | --- |
| Refundable deposit | Rs amount (typical for self-drive, e.g. Rs 50,000) |
| Documents needed | Any of: NIC, Driving licence, Proof of address (utility bill), Guarantor |
| Fuel policy | Return with the same fuel level / Customer pays for fuel used / Fuel included in the price |
| Notes | Free text |

### 4.5 Availability switch

- **Available for rent (on / off)** — per vehicle. When off, the vehicle disappears from
  search, so the owner doesn't get calls while it's out on a hire.
- **Back on (optional date)** — when switching off, the owner can pick a date the vehicle
  becomes available again (quick picks: tomorrow, 3 days, a week, 2 weeks, a month). From
  that date (Sri Lanka time) it reappears automatically, so listings don't stay hidden
  because the owner forgot to switch back.

## 5. Customer search

- On opening the app, ask for **GPS location**. If denied, search around Colombo and let
  the customer choose a town.
- Search box matches title, make, model and town.
- Results show **only available vehicles**, **nearest first**.
- Filters:
  - Vehicle type (chips)
  - Minimum seats
  - AC
  - Need a driver / Self-drive
  - Double seat (shown when Buddy van is selected)
  - Max price per day (chips: Any, up to Rs 5,000 / 8,000 / 12,000 / 20,000 / 30,000)
  - Unlimited km only
  - Distance radius (10 / 25 / 50 / 100 km / anywhere)
- Sort: Nearest (default), Lowest price.
- Result card: cover photo, title, type, seats, AC, distance ("4.2 km away"), town,
  Rs / day, free km / day, driver badge.

### 5.1 Listing page

Photos, key specs, full pricing table, long-term offers, driver / self-drive, terms,
town + distance, and a **trip estimate**: pick number of days and expected km → total
(days × rate or the cheaper weekly / monthly offer, + driver, + extra km).

Sticky **Call** and **WhatsApp** buttons. If not signed in, tapping either opens the
sign-in sheet; after signing in the app returns to the listing and continues the call /
WhatsApp automatically. The number is also shown on screen (useful on desktop).
WhatsApp opens with a pre-filled message: "Hi! I saw your <vehicle> on RentAnything.
Is it available?".

## 6. Accounts

- Customers browse without signing in.
- Sign-in required to reveal an owner's phone number (Call / WhatsApp) and to list a
  vehicle.
- v1: **email + password**. Google sign-in next (needs Google Cloud OAuth credentials),
  phone OTP later.
- Profile: name, phone, WhatsApp number (defaults to phone).
- A phone number is required before a vehicle can be published (asked on the last step of
  Add vehicle if missing).

## 7. Tech stack

Final goal is a mobile app, so we use one codebase for web + Android + iOS:

- **Expo (React Native) + Expo Router + TypeScript** — runs on web now, ships to the
  Play Store / App Store later from the same code.
- **Supabase** — Postgres + **PostGIS** (distance search), Auth, Storage (photos),
  Row Level Security.
- **expo-location** for GPS (works in the browser too).
- Design in **Figma**; marketing / landing site can be built in **Framer** later.

## 8. Data model

Generic `listings` table + a category-specific details table, so a future
`property_details` (house rentals) slots in beside `vehicle_details`.

```
profiles         id (= auth user), full_name, phone, whatsapp, is_admin
listings         id, owner_id, category ('vehicle'), title, description,
                 location (geography point), town,
                 is_available, available_again_on, is_hidden (admin),
                 created_at, updated_at
vehicle_details  listing_id, vehicle_type, make, model, year, seats, double_seat,
                 has_ac, transmission, fuel_type,
                 price_per_day, km_per_day, extra_km_rate, min_days,
                 weekly_price, weekly_km, monthly_price, monthly_km,
                 self_drive, driver_available, driver_price_per_day,
                 deposit, documents[], fuel_policy, terms_notes
listing_photos   id, listing_id, path, position
contact_events   id, listing_id, user_id, channel (call / whatsapp), created_at
```

- `search_vehicles(lat, lng, filters…)` — Postgres function, returns live listings
  ordered by distance.
- `get_listing_contact(listing_id)` — returns the owner's phone / WhatsApp **only to
  signed-in users** and logs a `contact_events` row (lets us show owners "12 people
  contacted you this week" later).
- A listing is **live** when: not hidden AND (`is_available` OR
  `available_again_on <= today`).

## 9. Screens

Customer:

1. **Explore** — location bar, type chips, filter button, results list.
2. **Filters** — bottom sheet.
3. **Listing** — details, trip estimate, Call / WhatsApp.
4. **Sign in / Sign up** — sheet shown on Call / WhatsApp or List a vehicle.

Owner:

5. **My vehicles** — each vehicle with a big availability switch and "back on" date.
6. **Add / Edit vehicle** — steps: Vehicle → Pricing → Driver & terms → Photos &
   location.
7. **Account** — name, phone, WhatsApp, sign out.

## 10. Status

Built in v1 (September 2026):

- Figma design: 10 screens + style sheet.
- Database migration with RLS, distance search, contact gate, photo storage, and tests.
- Expo app: every screen in section 9, working on web; Android / iOS run via Expo Go.

Differences from the Figma design:

- "Continue with Google" isn't in the app yet (needs Google OAuth credentials).
- Max price is chips instead of a slider (no native slider dependency).
- No favourites (heart) button yet.

## 11. Later

Verification badges, reviews, booking requests with calendar, featured listings for
owners, Sinhala / Tamil, phone OTP login, push notifications, house rentals and other
categories.
