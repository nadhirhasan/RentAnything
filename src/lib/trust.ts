// Reports, moderation and reviews (see supabase/migrations/*_trust_and_safety.sql).
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ReportReason =
  | 'not_available'
  | 'wrong_details'
  | 'fake_or_scam'
  | 'wrong_photos'
  | 'rude_or_unsafe'
  | 'offensive'
  | 'other';

export const LISTING_REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  { value: 'not_available', label: 'Not available', description: "Owner doesn't answer or it's already rented" },
  { value: 'wrong_details', label: 'Wrong price or details', description: 'Price, seats, km or other details are wrong' },
  { value: 'fake_or_scam', label: 'Fake listing or scam', description: 'Asked for advance money, fake vehicle, etc.' },
  { value: 'wrong_photos', label: 'Wrong photos', description: "Photos aren't of this vehicle" },
  { value: 'rude_or_unsafe', label: 'Rude or unsafe owner', description: 'Bad behaviour or safety concern' },
  { value: 'other', label: 'Something else', description: 'Tell us in the note' },
];

export const REVIEW_REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  { value: 'fake_or_scam', label: 'Fake review', description: "The person didn't rent this vehicle" },
  { value: 'offensive', label: 'Offensive', description: 'Rude, hateful or personal information' },
  { value: 'other', label: 'Something else', description: 'Tell us in the note' },
];

export const reasonLabel = (r: ReportReason) =>
  [...LISTING_REPORT_REASONS, ...REVIEW_REPORT_REASONS].find((x) => x.value === r)?.label ?? r;

export async function reportListing(listingId: string, reason: ReportReason, note: string) {
  const { error } = await supabase.rpc('report_listing', { listing_id: listingId, reason, note });
  if (error) throw error;
}

export async function reportReview(reviewId: number, reason: ReportReason, note: string) {
  const { error } = await supabase.rpc('report_review', { review_id: reviewId, reason, note });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type QueueReport = {
  id: number;
  reason: ReportReason;
  note: string;
  created_at: string;
  review_id: number | null;
  review_comment: string | null;
  review_rating: number | null;
  review_hidden: boolean | null;
};

export type QueueItem = {
  listing_id: string;
  title: string;
  town: string;
  cover_photo: string | null;
  owner_name: string;
  owner_phone: string | null;
  is_hidden: boolean;
  hidden_reason: 'reports' | 'admin' | null;
  open_count: number;
  latest_at: string;
  reports: QueueReport[];
};

export type HiddenListing = {
  listing_id: string;
  title: string;
  town: string;
  cover_photo: string | null;
  owner_name: string;
  owner_phone: string | null;
  hidden_reason: 'reports' | 'admin' | null;
  hidden_at: string | null;
};

export async function getReportQueue(): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc('admin_report_queue');
  if (error) throw error;
  return Array.isArray(data) ? (data as QueueItem[]) : [];
}

export async function getHiddenListings(): Promise<HiddenListing[]> {
  const { data, error } = await supabase.rpc('admin_hidden_listings');
  if (error) throw error;
  return Array.isArray(data) ? (data as HiddenListing[]) : [];
}

export async function moderateListing(listingId: string, action: 'hide' | 'unhide' | 'dismiss') {
  const { error } = await supabase.rpc('admin_moderate_listing', { listing_id: listingId, action });
  if (error) throw error;
}

export async function moderateReview(reviewId: number, action: 'hide' | 'unhide' | 'dismiss') {
  const { error } = await supabase.rpc('admin_moderate_review', { review_id: reviewId, action });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export type ReviewTag =
  | 'clean'
  | 'on_time'
  | 'as_described'
  | 'good_driver'
  | 'good_value'
  | 'price_changed'
  | 'late'
  | 'not_as_described'
  | 'poor_condition';

export const GOOD_TAGS: { value: ReviewTag; label: string }[] = [
  { value: 'clean', label: 'Clean' },
  { value: 'on_time', label: 'On time' },
  { value: 'as_described', label: 'As described' },
  { value: 'good_driver', label: 'Good driver' },
  { value: 'good_value', label: 'Good value' },
];

export const BAD_TAGS: { value: ReviewTag; label: string }[] = [
  { value: 'price_changed', label: 'Price changed' },
  { value: 'late', label: 'Late' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'poor_condition', label: 'Poor condition' },
];

export const tagLabel = (t: ReviewTag) => [...GOOD_TAGS, ...BAD_TAGS].find((x) => x.value === t)?.label ?? t;

export type Review = {
  id: number;
  reviewer_name: string;
  verified: boolean;
  rating: number;
  condition_rating: number | null;
  owner_rating: number | null;
  value_rating: number | null;
  tags: ReviewTag[];
  comment: string;
  owner_reply: string | null;
  owner_replied_at: string | null;
  created_at: string;
  is_mine: boolean;
};

export type Eligibility = 'ok' | 'sign_in' | 'own_listing' | 'not_contacted' | 'too_soon' | 'expired';

export type MyReviewStatus = {
  eligibility: Eligibility;
  verified: boolean;
  contacted: boolean;
  my_review: {
    id: number;
    rating: number;
    condition_rating: number | null;
    owner_rating: number | null;
    value_rating: number | null;
    tags: ReviewTag[];
    comment: string;
  } | null;
  my_feedback: { owner_answered: boolean; info_accurate: boolean | null } | null;
};

export async function listReviews(listingId: string, page = 0, pageSize = 10): Promise<Review[]> {
  const { data, error } = await supabase.rpc('list_reviews', {
    listing_id: listingId,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
  if (error) throw error;
  // Never let a bad response take down the vehicle page.
  return Array.isArray(data) ? (data as Review[]) : [];
}

export async function getMyReviewStatus(listingId: string): Promise<MyReviewStatus> {
  const { data, error } = await supabase.rpc('my_review_status', { listing_id: listingId }).single();
  if (error) throw error;
  return data as MyReviewStatus;
}

export type ReviewInput = {
  rating: number;
  condition_rating: number | null;
  owner_rating: number | null;
  value_rating: number | null;
  tags: ReviewTag[];
  comment: string;
};

export async function submitReview(listingId: string, r: ReviewInput) {
  const { error } = await supabase.rpc('submit_review', { listing_id: listingId, ...r });
  if (error) throw error;
}

export async function submitContactFeedback(
  listingId: string,
  ownerAnswered: boolean,
  infoAccurate: boolean | null,
) {
  const { error } = await supabase.rpc('submit_contact_feedback', {
    listing_id: listingId,
    owner_answered: ownerAnswered,
    info_accurate: infoAccurate,
  });
  if (error) throw error;
}

export async function replyToReview(reviewId: number, reply: string | null) {
  const { error } = await supabase.rpc('reply_to_review', { review_id: reviewId, reply });
  if (error) throw error;
}

export type RecentContact = { user_id: string; name: string; last_contacted_at: string; confirmed: boolean };

export async function getRecentContacts(listingId: string): Promise<RecentContact[]> {
  const { data, error } = await supabase.rpc('recent_contacts', { listing_id: listingId });
  if (error) throw error;
  return Array.isArray(data) ? (data as RecentContact[]) : [];
}

export async function confirmHire(listingId: string, customerId: string) {
  const { error } = await supabase.rpc('confirm_hire', { listing_id: listingId, customer_id: customerId });
  if (error) throw error;
}

export type ReviewInvite = {
  listing_id: string;
  title: string;
  town: string;
  cover_photo: string | null;
  verified: boolean;
  contacted_at: string;
};

export async function getReviewInvites(): Promise<ReviewInvite[]> {
  const { data, error } = await supabase.rpc('my_review_invites');
  if (error) throw error;
  return Array.isArray(data) ? (data as ReviewInvite[]) : [];
}

export async function deleteMyAccount() {
  // Photos live in Storage, which the database can't delete; remove them first.
  const { data: photos } = await supabase.from('listing_photos').select('path');
  if (photos?.length) {
    await supabase.storage.from('listing-photos').remove(photos.map((p) => p.path as string));
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}
