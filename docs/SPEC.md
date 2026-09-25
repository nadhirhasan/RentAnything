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

- Online payments (customers pay owners in cash; see §12 for bookings and fees).
- Listing verification / approval (listings go live immediately; an admin can hide one).
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
- Sign up asks for name, email, password and **confirm password**. Passwords need at
  least 8 characters with letters and numbers, and every password field has a
  show / hide button.
- **Forgot password**: the sign-in screen emails a reset link that opens
  `/reset-password` in the app, where the user sets a new password (entered twice).
  Signed-in users can request the same link from Account → Change password.
  The Supabase project must list the app's URLs under Authentication → URL
  Configuration → Redirect URLs (e.g. `http://localhost:8081/**`, `rentanything://**`
  and the production web domain).
- Profile: name, phone, WhatsApp number (defaults to phone). Sri Lankan numbers are
  validated and stored as `077 123 4567`.
- A phone number is required before a vehicle can be published (asked on the last step of
  Add vehicle if missing).

### 6.1 Interaction standards

Benchmarked against Booking.com and Daraz:

- The whole input box is tappable; focus shows on the box's border only.
- Errors appear under the field they belong to and clear as soon as the user edits it.
- Amounts show thousands separators while typing (`12,000`).
- Confirmations use in-app dialogs (delete listing, discard a half-filled form, sign
  out); results use short toast messages ("Your vehicle is live", "Saved").
- Loading shows grey placeholder cards instead of spinners.
- Photos are never cropped: the full photo is shown over a blurred copy of itself, and
  tapping opens a full-screen, swipeable viewer.

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
reviews          id, listing_id, reviewer_id, rating, condition/owner/value ratings,
                 tags[], comment, owner_reply, is_hidden, created_at
hire_confirmations  listing_id, customer_id, confirmed_at
contact_feedback listing_id, user_id, owner_answered, info_accurate
reports          id, reporter_id, listing_id, review_id (null = listing), reason, note, status
bookings         id, listing_id, owner_id, customer_id, start_date, days, end_date,
                 with_driver, note, estimate, agreed_total, commission_percent,
                 commission, status, handover_code, close_reason, closed_by,
                 customer_says_rented, dispute, timestamps
customer_ratings booking_id, customer_id, owner_id, rating, tags[]
owner_ledger     id, owner_id, kind (commission / payment / adjustment), amount,
                 booking_id, payment_id, note
dues_payments    id, owner_id, amount, method, reference, status (pending / approved / rejected)
app_settings     commission_percent, dues_limit, dues_days, payment_details (one row)
```

Listings also have `hidden_reason` ('reports' / 'admin') and `hidden_at`.

- `search_vehicles(lat, lng, filters…)` — Postgres function, returns live listings
  ordered by distance.
- `get_listing_contact(listing_id)` — returns the owner's phone / WhatsApp **only to
  signed-in users** and logs a `contact_events` row (lets us show owners "12 people
  contacted you this week" later).
- A listing is **live** when: not hidden AND (`is_available` OR
  `available_again_on <= today`) AND its owner isn't restricted for unpaid fees (§12.3).

## 9. Screens

Customer:

1. **Explore** — location bar, type chips, filter button, results list.
2. **Filters** — bottom sheet.
3. **Listing** — details, trip estimate, Call / WhatsApp, Book.
4. **Sign in / Sign up** — sheet shown on Call / WhatsApp, Book or List a vehicle.
5. **Request to book** and **Bookings** tab (My trips / Requests) — see §12.

Owner:

6. **My vehicles** — each vehicle with a big availability switch and "back on" date.
7. **Add / Edit vehicle** — steps: Vehicle → Pricing → Driver & terms → Photos &
   location.
8. **Account** — name, phone, WhatsApp, sign out.
9. **Booking** (accept / decline, handover code) and **Payments to RentAnything**
   (balance, how to pay, "I've paid") — see §12.

## 10. Status

Built in v1 (September 2026):

- Figma design: 10 screens + style sheet.
- Database migration with RLS, distance search, contact gate, photo storage, and tests.
- Expo app: every screen in section 9, working on web; Android / iOS run via Expo Go.
- Trust & safety (section 11): reports and moderation, ratings, legal pages,
  account deletion, contact limit, photo compression, app icon.
- Bookings and owner fees (section 12): booking requests, handover code, owner
  balance and payments, restrictions, disputes, admin settings.

Differences from the Figma design:

- "Continue with Google" isn't in the app yet (needs Google OAuth credentials).
- Max price is chips instead of a slider (no native slider dependency).
- No favourites (heart) button yet.
- Sort is a bottom-sheet menu; switching a vehicle off asks for the back-on date in a
  bottom sheet; the vehicle page has a share button and shows the price on the contact
  bar.

## 11. Trust & safety

Decided with the founder on 25 September 2026.

### 11.1 Reporting and moderation

- Any signed-in user can report a listing (reason + optional note) or a review.
  Max 10 reports per user per day; owners can't report their own listing.
- A listing reported by **3 different people** (open reports) is hidden
  automatically (`hidden_reason = 'reports'`) until an admin checks it.
- Admin (`profiles.is_admin`, the founder: nadhirupwork@gmail.com) has a
  **Moderation** screen (Account → Moderation): report queue and hidden listings,
  with hide / unhide / dismiss for listings and hide / keep for reviews.
- The owner sees "Hidden by RentAnything" on the vehicle and a button to contact
  support on WhatsApp (`EXPO_PUBLIC_SUPPORT_WHATSAPP`).

### 11.2 Ratings

Spam protection: we can't know if a hire happened, so reviews are tied to contacts.

- Only a user who tapped Call / WhatsApp on the listing can review it, from **1 day
  to 60 days** after the contact. One review per user per listing.
- When the owner switches a vehicle off they're asked **"Who rented it?"** (people
  who contacted them in the last 14 days). A confirmed hire (within 30 days) gives
  the review a **Verified hire** badge.
- Customers who didn't rent answer quick feedback instead (did the owner answer,
  was the info accurate). This isn't public.
- Review: overall 1–5 stars, optional condition / owner / value stars, tags, comment.
  The owner can reply once, publicly. Reviews can be reported.
- The rating is shown only at **3+ reviews**, as a Bayesian average
  `(3 × 4.0 + sum) / (3 + n)`. Explore can sort by "Top rated".
- Reviewers are shown as first name + last initial.

### 11.3 Other launch items

- Anti-scraping: `get_listing_contact` allows 30 different listings per user per day.
- Photos are resized to max 1600 px, JPEG 72 %, EXIF (GPS) stripped before upload.
- Privacy policy (`/privacy`), Terms of use (`/terms`), account deletion
  (`/delete-account`, and Account → Delete account) — needed for Play Store.
- App id `lk.rentanything.app` (Android package and iOS bundle id). New icon and
  splash in `assets/brand/`.

## 12. Bookings and payments

Decided with the founder on 25 September 2026. Card payments are rare in Sri Lanka,
so money works like PickMe's cash rides: **the customer pays the owner in cash, and
the owner owes RentAnything a fee**. Unlike a hotel booking, both sides must meet and
agree first, so the fee is only charged when a rental actually starts. We can't
control honesty; we make the honest path the easiest one.

### 12.1 Booking flow

1. **Request** — the customer picks a start day and number of days (at least the
   vehicle's minimum), self-drive / with driver, and an optional message. The app
   shows the estimated price (same maths as the trip estimate). A phone number is
   required. Call / WhatsApp still work for questions.
   Limits: 3 open requests at a time, 10 a day, one open booking per vehicle.
2. **Accept / decline** — the owner sees the customer's summary (member since,
   rentals, rating from owners, no-shows, cancellations) and accepts or declines
   with a reason. Requests expire after 48 hours or on the start day. Accepting
   declines other requests for the same days; two accepted bookings can't overlap.
   After accepting, both see each other's phone number.
3. **Meet** — the customer checks the vehicle, the owner checks the customer.
4. **Handover** — if they agree, the customer shows a **4-digit code**; the owner
   enters it with the agreed price. The rental starts: the fee is added to the
   owner's balance, the customer's review gets "Verified hire", and the vehicle
   switches off until the day after the last day. 5 wrong codes lock it for 15 min.
   **No deal** — either side taps No deal with a reason; nobody is charged.
5. **After** — the customer can review the vehicle; the owner rates the customer
   (1–5 + tags: on time, careful driver, damage, didn't turn up…). Owners' ratings
   of customers are only shown to other owners.

Either side can cancel an accepted booking (with a reason); the customer can cancel
a request.

### 12.2 Fee and owner balance

- Fee: **5%** of the agreed price by default (admin setting, 0–30%; a request keeps
  the rate from when it was made).
- Owners see their balance, history and how to pay under Account → Payments to
  RentAnything. They pay by bank transfer, LankaQR or eZ Cash (details set by the
  admin) and report the payment in the app; an admin marks it received or not.
- Admins can also adjust a balance (waive or add a charge) with a note.

### 12.3 Restrictions (like PickMe)

An owner is **restricted** when their balance reaches the limit (default
**Rs 5,000**) or a fee stays unpaid for **30 days** (both admin settings; payments
count oldest-first). Restricted owners' vehicles leave search and can't be contacted
or booked, and they can't accept requests; bookings already accepted can still start.
A payment reported in the last 3 days counts as paid until an admin checks it, so
paying brings the vehicles back straight away. Owners can't delete their account
while they owe money.

### 12.4 Disputes

If no code was entered, the customer is asked "Did you get the vehicle?" after the
start day (or after the owner ended the booking). "Yes" opens a dispute; an admin
calls both and either charges the fee on the listed price or dismisses it.

### 12.5 Not yet

No push notifications: the Bookings tab shows a badge (checked every minute), and
customers can remind the owner on WhatsApp with a link to the request. Online
payments (PayHere) and deposits can be added later on top of this flow.

## 13. Later

Verification badges, push notifications for bookings, online payments (PayHere),
featured listings for owners, Sinhala / Tamil, phone OTP login, house rentals and
other categories.
