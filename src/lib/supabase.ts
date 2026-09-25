import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

// Falls back to a placeholder so the app still renders a "not configured"
// message instead of crashing when .env is missing.
export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Only refresh the session while the app is in the foreground (native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const PHOTO_BUCKET = 'listing-photos';

export function photoUrl(path: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Turns Postgres / Supabase errors raised by our SQL functions into text
// people can act on.
export function friendlyError(error: unknown): string {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  if (message.includes('sign_in_required')) return 'Please sign in first.';
  if (message.includes('contact_after_booking'))
    return "The owner's number is shared when they accept your booking. Send a message or a booking request.";
  if (message.includes('conversation_own_listing')) return "You can't message yourself about your own vehicle.";
  if (message.includes('conversation_not_found')) return 'Chat not found.';
  if (message.includes('conversation_blocked')) return 'This chat is blocked.';
  if (message.includes('message_invalid')) return 'Write a message first.';
  if (message.includes('message_limit')) return "You're sending messages very fast. Please wait a few minutes.";
  if (message.includes('chat_access_denied'))
    return 'Chats can only be opened when they are reported or part of a dispute.';
  if (message.includes('push_token_invalid')) return "Couldn't turn on notifications on this device.";
  if (message.includes('booking_needs_phone'))
    return 'Add your phone number so the owner can call you.';
  if (message.includes('booking_own_listing')) return "You can't book your own vehicle.";
  if (message.includes('booking_bad_dates')) return 'Please pick a start date within the next 6 months.';
  if (message.includes('booking_min_days')) return 'This owner has a minimum number of days. Please book longer.';
  if (message.includes('booking_dates_taken')) return 'Those days are already booked. Please pick other dates.';
  if (message.includes('booking_exists')) return 'You already have a request for this vehicle.';
  if (message.includes('booking_limit'))
    return 'You have too many open requests. Wait for an answer or cancel one first.';
  if (message.includes('booking_not_found')) return 'Booking not found.';
  if (message.includes('booking_not_open')) return 'This booking has already changed. Pull down to refresh.';
  if (message.includes('booking_bad_amount')) return 'Please enter the price you agreed.';
  if (message.includes('dues_overdue'))
    return 'Pay your RentAnything balance to accept new bookings.';
  if (message.includes('dues_outstanding'))
    return 'Please pay your RentAnything balance before deleting your account.';
  if (message.includes('payment_pending_exists'))
    return "We're still checking your last payment. You can report another once it's approved.";
  if (message.includes('payment_not_found')) return 'This payment was already handled.';
  if (message.includes('adjustment_invalid')) return 'Enter an amount and a note.';
  if (message.includes('phone_required'))
    return 'Add your phone number in Account before listing a vehicle.';
  if (message.includes('listing_not_available'))
    return 'This vehicle is no longer available.';
  if (message.includes('listing_not_found')) return 'Listing not found.';
  if (message.includes('contact_limit'))
    return "You've contacted a lot of owners today. Please try again tomorrow.";
  if (message.includes('report_limit')) return "You've sent a lot of reports today. Please try again tomorrow.";
  if (message.includes('cannot_report_own')) return "You can't report your own listing.";
  if (message.includes('admin_only')) return 'Only admins can do this.';
  if (message.includes('review_too_soon')) return 'You can review a day after contacting the owner.';
  if (message.includes('review_expired')) return 'The time to review this vehicle has passed.';
  if (message.includes('review_not_contacted')) return 'Only people who contacted the owner can review.';
  if (message.includes('review_own_listing')) return "You can't review your own vehicle.";
  if (message.includes('customer_not_contacted')) return "This person hasn't contacted you recently.";
  if (message.includes('Invalid login credentials')) return 'Wrong email or password.';
  if (message.includes('Email not confirmed'))
    return 'Please confirm your email first. Check your inbox for the link.';
  if (message.includes('User already registered'))
    return 'An account with this email already exists. Sign in instead.';
  if (/rate limit|too many requests|security purposes/i.test(message))
    return 'Too many attempts. Please wait a minute and try again.';
  if (/expired|invalid.*(token|grant|flow)/i.test(message))
    return 'This link has expired or was already used.';
  if (message.includes('Network request failed') || message.includes('Failed to fetch'))
    return 'No internet connection. Please try again.';
  return message;
}
