import { Linking } from 'react-native';

import { whatsappUrl } from './format';

// RentAnything's support WhatsApp number, e.g. "077 123 4567" (set in .env).
export const SUPPORT_WHATSAPP = (process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '').trim();

export const hasSupport = SUPPORT_WHATSAPP !== '';

export function contactSupport(message: string) {
  if (!hasSupport) return Promise.resolve();
  return Linking.openURL(whatsappUrl(SUPPORT_WHATSAPP, message)).catch(() => {});
}
