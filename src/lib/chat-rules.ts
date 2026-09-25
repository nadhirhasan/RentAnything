// Chat helpers (docs/SPEC.md §13). Pure: no runtime imports, so
// `node --test` can run it.

// Mirrors public.mask_contacts() in the database, to warn before sending.
const CONTACT_PATTERNS = [
  /(https?:\/\/|www\.)\S+|\b(wa|t)\.me\/\S*/i,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\+?\d([\s.-]?\d){8,}/,
];

export function looksLikeContact(text: string): boolean {
  return CONTACT_PATTERNS.some((p) => p.test(text));
}

// "14:05" today, "Yesterday", "Mon", or "12 Oct" (Sri Lanka time).
export function formatChatTime(iso: string, now: Date = new Date()): string {
  const offset = 5.5 * 3600e3;
  const t = new Date(new Date(iso).getTime() + offset);
  const n = new Date(now.getTime() + offset);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const diffDays = Math.round((Date.parse(day(n)) - Date.parse(day(t))) / 86_400_000);
  if (diffDays <= 0) return t.toISOString().slice(11, 16);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getUTCDay()];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${t.getUTCDate()} ${months[t.getUTCMonth()]}`;
}

// Day separator label in a conversation: "Today", "Yesterday", "Mon 12 Oct".
export function formatChatDay(iso: string, now: Date = new Date()): string {
  const label = formatChatTime(iso, now);
  if (/^\d\d:\d\d$/.test(label)) return 'Today';
  if (label === 'Yesterday') return label;
  const offset = 5.5 * 3600e3;
  const t = new Date(new Date(iso).getTime() + offset);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getUTCDay()];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${weekday} ${t.getUTCDate()} ${months[t.getUTCMonth()]}`;
}

export function sameChatDay(a: string, b: string): boolean {
  const offset = 5.5 * 3600e3;
  const d = (iso: string) => new Date(new Date(iso).getTime() + offset).toISOString().slice(0, 10);
  return d(a) === d(b);
}

// Adds messages to a list sorted newest first, without duplicates.
export function mergeMessages<T extends { id: number }>(current: T[], incoming: T[]): T[] {
  const byId = new Map<number, T>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}
