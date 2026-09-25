// Booking states, reasons and date helpers (docs/SPEC.md §12).
// Pure: no runtime imports, so `node --test` can run it.

export type BookingState =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'no_deal'
  | 'started'
  | 'completed'
  | 'expired';

export type BookingRole = 'customer' | 'owner';
export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export const OPEN_STATES: BookingState[] = ['requested', 'accepted', 'started'];

export const STATE_LABELS: Record<BookingState, { label: string; tone: Tone }> = {
  requested: { label: 'Waiting for owner', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'primary' },
  started: { label: 'On hire', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  declined: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  no_deal: { label: 'No deal', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
};

// The owner sees "New request" rather than "Waiting for owner".
export function stateLabel(state: BookingState, role: BookingRole): string {
  if (state === 'requested' && role === 'owner') return 'New request';
  return STATE_LABELS[state].label;
}

// One line under the status, telling each side what happens next.
export function stateHint(state: BookingState, role: BookingRole): string {
  const owner = role === 'owner';
  switch (state) {
    case 'requested':
      return owner
        ? 'Accept to share phone numbers. Requests expire after 48 hours.'
        : "The owner has 48 hours to answer. You don't pay anything in the app.";
    case 'accepted':
      return owner
        ? "Meet the customer and let them check the vehicle. If you agree, enter the customer's code to start the rental."
        : 'Meet the owner and check the vehicle. If you agree, show the owner your code and pay them in cash.';
    case 'started':
      return owner
        ? "The rental has started. RentAnything's fee was added to your balance."
        : 'Enjoy your trip! Pay the owner as agreed and return the vehicle on time.';
    case 'completed':
      return owner ? 'This rental is finished.' : 'This rental is finished. How was it?';
    case 'declined':
      return owner ? 'You declined this request.' : 'The owner declined. Try another vehicle nearby.';
    case 'cancelled':
      return 'This booking was cancelled.';
    case 'no_deal':
      return 'You met but the rental didn’t go ahead.';
    case 'expired':
      return owner ? "You didn't answer this request in time." : "The owner didn't answer in time.";
  }
}

export type Reason = { value: string; label: string };

export const DECLINE_REASONS: Reason[] = [
  { value: 'not_available', label: "It isn't available then" },
  { value: 'customer_profile', label: "I'm not comfortable with this customer" },
  { value: 'other', label: 'Something else' },
];

export const CANCEL_REASONS: Record<BookingRole, Reason[]> = {
  customer: [
    { value: 'changed_plans', label: 'My plans changed' },
    { value: 'found_another', label: 'I found another vehicle' },
    { value: 'other', label: 'Something else' },
  ],
  owner: [
    { value: 'vehicle_unavailable', label: 'The vehicle is no longer available' },
    { value: 'customer_unreachable', label: "I can't reach the customer" },
    { value: 'other', label: 'Something else' },
  ],
};

export const NO_DEAL_REASONS: Record<BookingRole, Reason[]> = {
  customer: [
    { value: 'not_as_described', label: "The vehicle wasn't as described" },
    { value: 'owner_no_show', label: "The owner didn't turn up" },
    { value: 'price', label: 'We didn’t agree on the price' },
    { value: 'changed_mind', label: 'I changed my mind' },
    { value: 'other', label: 'Something else' },
  ],
  owner: [
    { value: 'customer_no_show', label: "The customer didn't turn up" },
    { value: 'customer_profile', label: "I wasn't comfortable renting to them" },
    { value: 'documents', label: "They didn't have the documents" },
    { value: 'price', label: 'We didn’t agree on the price' },
    { value: 'other', label: 'Something else' },
  ],
};

const ALL_REASONS: Reason[] = [
  ...DECLINE_REASONS,
  ...CANCEL_REASONS.customer,
  ...CANCEL_REASONS.owner,
  ...NO_DEAL_REASONS.customer,
  ...NO_DEAL_REASONS.owner,
  { value: 'dates_taken', label: 'Those days were booked by someone else' },
  { value: 'did_not_happen', label: "The customer said it didn't happen" },
];

export function reasonLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return ALL_REASONS.find((r) => r.value === value)?.label ?? null;
}

export type CustomerTag =
  | 'on_time'
  | 'careful'
  | 'returned_clean'
  | 'friendly'
  | 'late'
  | 'damaged'
  | 'rude'
  | 'no_show';

export const CUSTOMER_TAGS: { value: CustomerTag; label: string; good: boolean }[] = [
  { value: 'on_time', label: 'On time', good: true },
  { value: 'careful', label: 'Careful driver', good: true },
  { value: 'returned_clean', label: 'Returned clean', good: true },
  { value: 'friendly', label: 'Friendly', good: true },
  { value: 'late', label: 'Late', good: false },
  { value: 'damaged', label: 'Damage', good: false },
  { value: 'rude', label: 'Rude', good: false },
  { value: 'no_show', label: "Didn't turn up", good: false },
];

// ---------------------------------------------------------------------------
// Dates (YYYY-MM-DD strings, no time zones involved)
// ---------------------------------------------------------------------------

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Last day of a booking (inclusive), like bookings.end_date in the database.
export function lastDay(start: string, days: number): string {
  return addDays(start, Math.max(1, days) - 1);
}

export type DateRange = { start_date: string; end_date: string };

// Does [start, start + days - 1] touch any booked range?
export function overlapsBooked(start: string, days: number, booked: DateRange[]): boolean {
  const end = lastDay(start, days);
  return booked.some((b) => start <= b.end_date && b.start_date <= end);
}

export function isBookedDay(day: string, booked: DateRange[]): boolean {
  return booked.some((b) => b.start_date <= day && day <= b.end_date);
}

// "Mon 12 Oct" (English, fixed format so it's the same on every device).
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayLabel(isoDate: string): { weekday: string; day: number; month: string } {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return { weekday: WEEKDAYS[date.getUTCDay()], day: d, month: MONTHS[m - 1] };
}

export function formatDay(isoDate: string): string {
  const { weekday, day, month } = dayLabel(isoDate);
  return `${weekday} ${day} ${month}`;
}

// "12 – 16 Oct", "30 Oct – 2 Nov", or a single day.
export function formatRange(start: string, end: string): string {
  const a = dayLabel(start);
  const b = dayLabel(end);
  if (start === end) return `${a.day} ${a.month}`;
  if (a.month === b.month && start.slice(0, 4) === end.slice(0, 4)) return `${a.day} – ${b.day} ${b.month}`;
  return `${a.day} ${a.month} – ${b.day} ${b.month}`;
}

export function formatDays(days: number): string {
  return `${days} day${days === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Pickup: in Sri Lanka a rental day usually runs night to night. For a trip on
// the 27th you collect the vehicle on the evening of the 26th and bring it
// back on the night of the 27th: 1 day. Either way it comes back on the night
// of the last day.
// ---------------------------------------------------------------------------

export type Pickup = 'night_before' | 'morning';

export function pickupDay(start: string, pickup: Pickup): string {
  return pickup === 'night_before' ? addDays(start, -1) : start;
}

// Collecting the evening before a trip that starts today is already past.
export function nightBeforePossible(start: string, today: string): boolean {
  return addDays(start, -1) >= today;
}

// { collect: "Sat 26 Sep, evening", back: "Sun 27 Sep, night" }
export function handover(start: string, days: number, pickup: Pickup): { collect: string; back: string } {
  return {
    collect: `${formatDay(pickupDay(start, pickup))}, ${pickup === 'night_before' ? 'evening' : 'morning'}`,
    back: `${formatDay(lastDay(start, days))}, night`,
  };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

// Same rounding as the database (round half up for positive amounts).
export function commissionFor(total: number, percent: number): number {
  return Math.round((total * percent) / 100);
}

export function isValidHandoverCode(code: string): boolean {
  return /^\d{4}$/.test(code.trim());
}
