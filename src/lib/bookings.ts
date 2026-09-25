// Bookings and owner dues (see supabase/migrations/*_bookings_and_dues.sql).
import type { BookingRole, BookingState, CustomerTag, DateRange, Pickup } from './booking-rules';
import { supabase } from './supabase';

export type BookingListItem = {
  id: string;
  listing_id: string;
  title: string;
  town: string;
  cover_photo: string | null;
  start_date: string;
  end_date: string;
  days: number;
  with_driver: boolean;
  estimate: number;
  agreed_total: number | null;
  state: BookingState;
  other_name: string;
  needs_action: boolean;
  created_at: string;
};

export type CustomerSummary = {
  name: string;
  member_since: string;
  rentals: number;
  rating_avg: number | null;
  rating_count: number;
  no_shows: number;
  late_cancels: number;
  tags: Partial<Record<CustomerTag, number>>;
};

export type BookingDetail = {
  id: string;
  role: BookingRole;
  state: BookingState;
  listing_id: string;
  title: string;
  town: string;
  cover_photo: string | null;
  start_date: string;
  end_date: string;
  days: number;
  with_driver: boolean;
  pickup: Pickup;
  note: string;
  estimate: number;
  agreed_total: number | null;
  commission_percent: number;
  commission: number | null;
  handover_code: string | null;
  code_locked: boolean;
  close_reason: string | null;
  close_note: string;
  closed_by: 'customer' | 'owner' | 'admin' | null;
  customer_says_rented: boolean | null;
  dispute: 'open' | 'charged' | 'dismissed' | null;
  other_name: string;
  other_phone: string | null;
  other_whatsapp: string | null;
  customer: CustomerSummary | null;
  my_customer_rating: { rating: number; tags: CustomerTag[] } | null;
  reviewed: boolean | null;
  created_at: string;
  responded_at: string | null;
  started_at: string | null;
  closed_at: string | null;
};

const list = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

export async function requestBooking(input: {
  listingId: string;
  startDate: string;
  days: number;
  withDriver: boolean;
  note: string;
  pickup: Pickup;
}): Promise<string> {
  const { data, error } = await supabase.rpc('request_booking', {
    listing_id: input.listingId,
    start_date: input.startDate,
    days: input.days,
    with_driver: input.withDriver,
    note: input.note,
    pickup: input.pickup,
  });
  if (error) throw error;
  return data as string;
}

export async function getMyBookings(asOwner: boolean): Promise<BookingListItem[]> {
  const { data, error } = await supabase.rpc('my_bookings', { as_owner: asOwner });
  if (error) throw error;
  return list<BookingListItem>(data);
}

export async function getBooking(id: string): Promise<BookingDetail | null> {
  const { data, error } = await supabase.rpc('get_booking', { booking_id: id });
  if (error) throw error;
  const row = list<BookingDetail>(data)[0];
  return row ? { ...row, commission_percent: Number(row.commission_percent) } : null;
}

export async function getBookingBadge(): Promise<number> {
  const { data, error } = await supabase.rpc('my_booking_badge');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function getBookedDates(listingId: string): Promise<DateRange[]> {
  const { data, error } = await supabase.rpc('listing_booked_dates', { listing_id: listingId });
  if (error) throw error;
  return list<DateRange>(data);
}

export async function respondBooking(id: string, accept: boolean, reason?: string) {
  const { error } = await supabase.rpc('respond_booking', { booking_id: id, accept, reason: reason ?? null });
  if (error) throw error;
}

export async function cancelBooking(id: string, reason: string, note = '') {
  const { error } = await supabase.rpc('cancel_booking', { booking_id: id, reason, note });
  if (error) throw error;
}

export async function markNoDeal(id: string, reason: string, note = '') {
  const { error } = await supabase.rpc('mark_no_deal', { booking_id: id, reason, note });
  if (error) throw error;
}

export type StartResult = 'ok' | 'wrong_code' | 'locked';

export async function startBooking(id: string, code: string, agreedTotal: number): Promise<StartResult> {
  const { data, error } = await supabase.rpc('start_booking', {
    booking_id: id,
    code: code.trim(),
    agreed_total: agreedTotal,
  });
  if (error) throw error;
  return data as StartResult;
}

export async function confirmOutcome(id: string, rented: boolean) {
  const { error } = await supabase.rpc('confirm_booking_outcome', { booking_id: id, rented });
  if (error) throw error;
}

export async function rateCustomer(id: string, rating: number, tags: CustomerTag[]) {
  const { error } = await supabase.rpc('rate_customer', { booking_id: id, rating, tags });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Owner dues
// ---------------------------------------------------------------------------

export type LedgerEntry = {
  id: number;
  kind: 'commission' | 'payment' | 'adjustment';
  amount: number;
  note: string;
  booking_id: string | null;
  created_at: string;
};

export type PaymentMethod = 'bank' | 'lankaqr' | 'ezcash' | 'other';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'lankaqr', label: 'LankaQR' },
  { value: 'ezcash', label: 'eZ Cash' },
  { value: 'other', label: 'Other' },
];

export type DuesPayment = {
  id: number;
  amount: number;
  method: PaymentMethod;
  reference: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string;
  created_at: string;
};

export type MyDues = {
  balance: number;
  pending: number;
  restricted: boolean;
  restricted_reason: 'limit' | 'overdue' | null;
  due_by: string | null;
  dues_limit: number;
  dues_days: number;
  commission_percent: number;
  payment_details: string;
  entries: LedgerEntry[];
  payments: DuesPayment[];
};

export async function getMyDues(): Promise<MyDues | null> {
  const { data, error } = await supabase.rpc('my_dues');
  if (error) throw error;
  const row = list<MyDues>(data)[0];
  if (!row) return null;
  return {
    ...row,
    commission_percent: Number(row.commission_percent),
    entries: list<LedgerEntry>(row.entries),
    payments: list<DuesPayment>(row.payments),
  };
}

export async function reportDuesPayment(amount: number, method: PaymentMethod, reference: string) {
  const { error } = await supabase.rpc('report_dues_payment', { amount, method, reference });
  if (error) throw error;
}

export type AppSettings = {
  commission_percent: number;
  dues_limit: number;
  dues_days: number;
  payment_details: string;
};

export async function getAppSettings(): Promise<AppSettings | null> {
  const { data, error } = await supabase.rpc('get_app_settings');
  if (error) throw error;
  const row = list<AppSettings>(data)[0];
  return row ? { ...row, commission_percent: Number(row.commission_percent) } : null;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type OwnerDuesRow = {
  owner_id: string;
  owner_name: string;
  owner_phone: string | null;
  balance: number;
  pending: number;
  oldest_unpaid_at: string | null;
  restricted: boolean;
  restricted_reason: 'limit' | 'overdue' | null;
  pending_payment: {
    id: number;
    amount: number;
    method: PaymentMethod;
    reference: string;
    created_at: string;
  } | null;
};

export type DisputeRow = {
  booking_id: string;
  listing_id: string;
  title: string;
  start_date: string;
  days: number;
  estimate: number;
  commission_percent: number;
  status: string;
  close_reason: string | null;
  closed_by: string | null;
  owner_name: string;
  owner_phone: string | null;
  customer_name: string;
  customer_phone: string | null;
  created_at: string;
};

export async function getDuesOverview(): Promise<OwnerDuesRow[]> {
  const { data, error } = await supabase.rpc('admin_dues_overview');
  if (error) throw error;
  return list<OwnerDuesRow>(data);
}

export async function reviewPayment(paymentId: number, approve: boolean, note = '') {
  const { error } = await supabase.rpc('admin_review_payment', { payment_id: paymentId, approve, note });
  if (error) throw error;
}

export async function adjustDues(ownerId: string, amount: number, note: string) {
  const { error } = await supabase.rpc('admin_adjust_dues', { owner_id: ownerId, amount, note });
  if (error) throw error;
}

export async function getDisputes(): Promise<DisputeRow[]> {
  const { data, error } = await supabase.rpc('admin_disputes');
  if (error) throw error;
  return list<DisputeRow>(data).map((d) => ({ ...d, commission_percent: Number(d.commission_percent) }));
}

export async function resolveDispute(bookingId: string, charge: boolean) {
  const { error } = await supabase.rpc('admin_resolve_dispute', { booking_id: bookingId, charge });
  if (error) throw error;
}

export async function updateSettings(s: AppSettings) {
  const { error } = await supabase.rpc('admin_update_settings', {
    commission_percent: s.commission_percent,
    dues_limit: s.dues_limit,
    dues_days: s.dues_days,
    payment_details: s.payment_details,
  });
  if (error) throw error;
}
