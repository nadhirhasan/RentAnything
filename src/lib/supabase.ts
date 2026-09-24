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
  if (message.includes('phone_required'))
    return 'Add your phone number in Account before listing a vehicle.';
  if (message.includes('listing_not_available'))
    return 'This vehicle is no longer available.';
  if (message.includes('listing_not_found')) return 'Listing not found.';
  if (message.includes('Invalid login credentials')) return 'Wrong email or password.';
  if (message.includes('Network request failed') || message.includes('Failed to fetch'))
    return 'No internet connection. Please try again.';
  return message;
}
