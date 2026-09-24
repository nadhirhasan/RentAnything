// Formatting and small parsing helpers. No imports, so they're testable with `node --test`.

export function formatLKR(amount: number): string {
  return `Rs ${Math.round(amount).toLocaleString('en-US')}`;
}

export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

export function formatDistance(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)} m away`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}

// Parses a user-typed amount like "12,000" or "Rs 12000". Empty -> null.
export function parseAmount(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

// Local Sri Lankan numbers (077 123 4567) to international digits for
// wa.me / tel: links (94771234567).
export function toInternationalLK(phone: string): string {
  let digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `94${digits.slice(1)}`;
  if (digits.length === 9) digits = `94${digits}`;
  return digits;
}

export function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${toInternationalLK(phone)}?text=${encodeURIComponent(message)}`;
}

export function telUrl(phone: string): string {
  return `tel:+${toInternationalLK(phone)}`;
}

// YYYY-MM-DD for a date `daysFromToday` days after today in Sri Lanka time.
export function colomboDate(daysFromToday = 0, now: Date = new Date()): string {
  const colomboOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const d = new Date(now.getTime() + colomboOffsetMs + daysFromToday * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function formatDateShort(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

// Standard base64 -> bytes (for uploading picked photos to Storage).
export function base64ToBytes(b64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let i = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[i++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, i);
}

// Formats an amount as the user types: "12000" -> "12,000". Keeps only digits.
export function formatAmountInput(text: string): string {
  const digits = text.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
  return digits ? Number(digits).toLocaleString('en-US') : '';
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export const MIN_PASSWORD_LENGTH = 8;

// Returns a problem with the password, or null if it's acceptable.
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use both letters and numbers';
  return null;
}

// Sri Lankan phone numbers: 10 digits starting with 0 (077 123 4567), or
// +94 followed by 9 digits.
export function isValidLKPhone(phone: string): boolean {
  const digits = phone.replace(/[\s-]/g, '');
  return /^0\d{9}$/.test(digits) || /^\+?94\d{9}$/.test(digits);
}

// "0771234567" -> "077 123 4567" (leaves other formats alone).
export function formatLKPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  const local = digits.startsWith('94') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  if (/^0\d{9}$/.test(local)) return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  return phone.trim();
}
