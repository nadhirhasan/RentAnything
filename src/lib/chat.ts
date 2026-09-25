// In-app chat (see supabase/migrations/*_chat_and_push.sql).
import type { BookingState } from './booking-rules';
import type { ReportReason } from './trust';
import { supabase } from './supabase';

export type ChatMessage = {
  id: number;
  conversation_id: string;
  sender_id: string | null; // null = RentAnything (booking updates)
  kind: 'text' | 'system';
  body: string;
  masked: boolean;
  booking_id: string | null;
  created_at: string;
  pending?: boolean; // sent from this device, not saved yet
};

export type ConversationSummary = {
  id: string;
  listing_id: string;
  title: string;
  cover_photo: string | null;
  role: 'owner' | 'customer';
  other_name: string;
  last_message: string;
  last_message_at: string;
  last_is_mine: boolean;
  unread: number;
  booking_state: BookingState | null;
  blocked: boolean;
};

export type Conversation = {
  id: string;
  role: 'owner' | 'customer';
  listing_id: string;
  title: string;
  town: string;
  cover_photo: string | null;
  price_per_day: number;
  other_name: string;
  unlocked: boolean;
  other_phone: string | null;
  other_whatsapp: string | null;
  other_read_at: string | null;
  blocked: boolean;
  blocked_by_me: boolean;
  booking_id: string | null;
  booking_state: BookingState | null;
};

const list = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

export const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, kind, body, masked, booking_id, created_at';
export const PAGE = 50;

export async function startConversation(listingId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_conversation', { listing_id: listingId });
  if (error) throw error;
  return data as string;
}

export async function openBookingChat(bookingId: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_booking_chat', { booking_id: bookingId });
  if (error) throw error;
  return data as string;
}

export async function sendMessage(conversationId: string, body: string) {
  const { data, error } = await supabase.rpc('send_message', { conversation_id: conversationId, body });
  if (error) throw error;
  return data as { id: number; body: string; masked: boolean };
}

export async function markRead(conversationId: string) {
  await supabase.rpc('mark_conversation_read', { conversation_id: conversationId });
}

export async function getConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) throw error;
  return list<ConversationSummary>(data);
}

export async function getUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('my_unread_count');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const { data, error } = await supabase.rpc('get_conversation', { conversation_id: id });
  if (error) throw error;
  return list<Conversation>(data)[0] ?? null;
}

// Newest first. `before` = load older messages than this id.
export async function getMessages(conversationId: string, before?: number): Promise<ChatMessage[]> {
  let q = supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('id', { ascending: false })
    .limit(PAGE);
  if (before != null) q = q.lt('id', before);
  const { data, error } = await q;
  if (error) throw error;
  return list<ChatMessage>(data);
}

export async function setBlocked(conversationId: string, blocked: boolean) {
  const { error } = await supabase.rpc('set_conversation_blocked', { conversation_id: conversationId, blocked });
  if (error) throw error;
}

export async function reportConversation(conversationId: string, reason: ReportReason, note: string) {
  const { error } = await supabase.rpc('report_conversation', { conversation_id: conversationId, reason, note });
  if (error) throw error;
}

export const CHAT_REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  { value: 'fake_or_scam', label: 'Scam or asking for money', description: 'Advance payments, fake vehicle, etc.' },
  { value: 'rude_or_unsafe', label: 'Rude, threatening or unsafe', description: 'Harassment or a safety concern' },
  { value: 'offensive', label: 'Offensive messages', description: 'Hateful or sexual content' },
  { value: 'other', label: 'Something else', description: 'Tell us in the note' },
];

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type ChatQueueItem = {
  conversation_id: string;
  listing_id: string;
  title: string;
  owner_name: string;
  customer_name: string;
  open_reports: number;
  reports: { reason: ReportReason; note: string; created_at: string; by: 'owner' | 'customer' }[];
  dispute: string | null;
  last_message_at: string | null;
};

export type AdminChatLine = {
  id: number;
  sender: 'owner' | 'customer' | 'system';
  body: string;
  masked: boolean;
  created_at: string;
};

export async function getChatQueue(): Promise<ChatQueueItem[]> {
  const { data, error } = await supabase.rpc('admin_chat_queue');
  if (error) throw error;
  return list<ChatQueueItem>(data).map((c) => ({ ...c, reports: list(c.reports) }));
}

export async function adminReadConversation(id: string): Promise<AdminChatLine[]> {
  const { data, error } = await supabase.rpc('admin_read_conversation', { conversation_id: id });
  if (error) throw error;
  return list<AdminChatLine>(data);
}

export async function resolveChatReports(id: string, action: 'dismiss' | 'block') {
  const { error } = await supabase.rpc('admin_resolve_chat_reports', { conversation_id: id, action });
  if (error) throw error;
}
