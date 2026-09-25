import { router } from 'expo-router';
import { BadgeCheck, Flag, MessageSquareReply, Star } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFeedback } from '@/components/feedback';
import { ReportSheet } from '@/components/report-sheet';
import { Button, Field, Notice, Section, Skeleton, Tag } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import {
  getMyReviewStatus,
  listReviews,
  replyToReview,
  reportReview,
  REVIEW_REPORT_REASONS,
  tagLabel,
  type MyReviewStatus,
  type Review,
} from '@/lib/trust';
import type { VehicleDetail } from '@/lib/vehicles';
import { colors, font, maxContentWidth, radius } from '@/theme';

const STAR = '#F59E0B';

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} color={STAR} fill={i <= Math.round(value) ? STAR : 'transparent'} />
      ))}
    </View>
  );
}

// Tappable 1–5 stars.
export function StarInput({
  value,
  onChange,
  size = 36,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
  label: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="adjustable" accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${i} star${i > 1 ? 's' : ''}`}
          accessibilityState={{ selected: i === value }}
          hitSlop={4}
          onPress={() => onChange(i)}>
          <Star size={size} color={i <= value ? STAR : colors.switchOff} fill={i <= value ? STAR : 'transparent'} />
        </Pressable>
      ))}
    </View>
  );
}

export const RATING_WORDS = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];

// "★ 4.6 (12)" — only when a rating is shown (3+ reviews).
export function RatingBadge({ avg, count, light }: { avg: number | null; count: number; light?: boolean }) {
  if (avg == null) return null;
  return (
    <View style={styles.badge}>
      <Star size={14} color={STAR} fill={STAR} />
      <Text style={[styles.badgeText, light && { color: colors.white }]}>
        {Number(avg).toFixed(1)}
        <Text style={[styles.badgeCount, light && { color: colors.white }]}> ({count})</Text>
      </Text>
    </View>
  );
}

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  return `${Math.floor(months / 12)} year${months >= 24 ? 's' : ''} ago`;
}

function ReviewCard({
  review,
  ownerName,
  canReply,
  canReport,
  onReply,
  onReport,
}: {
  review: Review;
  ownerName: string;
  canReply: boolean;
  canReport: boolean;
  onReply: () => void;
  onReport: () => void;
}) {
  const sub = [
    review.condition_rating ? ['Condition', review.condition_rating] : null,
    review.owner_rating ? ['Owner', review.owner_rating] : null,
    review.value_rating ? ['Value', review.value_rating] : null,
  ].filter(Boolean) as [string, number][];
  return (
    <View style={styles.review}>
      <View style={styles.reviewHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{review.reviewer_name[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.reviewer}>
            {review.reviewer_name}
            {review.is_mine ? ' (you)' : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Stars value={review.rating} />
            <Text style={styles.muted}>{timeAgo(review.created_at)}</Text>
          </View>
        </View>
        {canReport ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Report review" hitSlop={10} onPress={onReport}>
            <Flag size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {review.verified ? (
        <Tag label="Verified hire" icon={BadgeCheck} tone="success" />
      ) : (
        <Tag label="Contacted owner" />
      )}
      {sub.length ? (
        <Text style={styles.muted}>{sub.map(([k, v]) => `${k} ${v}/5`).join(' · ')}</Text>
      ) : null}
      {review.tags.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {review.tags.map((t) => (
            <Tag key={t} label={tagLabel(t)} tone="primary" />
          ))}
        </View>
      ) : null}
      {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
      {review.owner_reply ? (
        <View style={styles.reply}>
          <Text style={styles.replyTitle}>Reply from {ownerName.split(' ')[0] || 'the owner'}</Text>
          <Text style={styles.comment}>{review.owner_reply}</Text>
        </View>
      ) : null}
      {canReply ? (
        <Pressable accessibilityRole="button" onPress={onReply} style={styles.replyButton} hitSlop={6}>
          <MessageSquareReply size={16} color={colors.primary} />
          <Text style={styles.link}>{review.owner_reply ? 'Edit reply' : 'Reply publicly'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const PAGE = 5;

// Ratings summary, the signed-in user's review action and the review list.
export function ReviewsSection({ v }: { v: VehicleDetail }) {
  const { session } = useAuth();
  const { toast } = useFeedback();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [status, setStatus] = useState<MyReviewStatus | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [reporting, setReporting] = useState<number | null>(null);
  const [replying, setReplying] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listReviews(v.id, 0, PAGE).then(
      (r) => {
        setReviews(r);
        setHasMore(r.length === PAGE);
      },
      (e) => setError(friendlyError(e)),
    );
    getMyReviewStatus(v.id).then(setStatus, () => {});
  }, [v.id]);

  useEffect(() => {
    load();
  }, [load, session?.user.id]);

  const more = async () => {
    const next = await listReviews(v.id, Math.ceil((reviews?.length ?? 0) / PAGE), PAGE);
    setReviews((r) => [...(r ?? []), ...next]);
    setHasMore(next.length === PAGE);
  };

  const cta = (() => {
    if (!status || v.is_mine) return null;
    if (status.my_review) {
      return (
        <Button
          label="Edit your review"
          kind="ghost"
          onPress={() => router.push({ pathname: '/review/[id]', params: { id: v.id } })}
        />
      );
    }
    if (status.eligibility === 'ok') {
      return (
        <View style={styles.invite}>
          <Text style={styles.inviteTitle}>
            {status.verified ? 'How was your trip?' : 'Did you rent this vehicle?'}
          </Text>
          <Text style={styles.muted}>Your review helps other people choose a good vehicle.</Text>
          <Button
            label={status.verified ? 'Rate this vehicle' : 'Share your experience'}
            onPress={() => router.push({ pathname: '/review/[id]', params: { id: v.id } })}
          />
        </View>
      );
    }
    if (status.eligibility === 'too_soon') {
      return <Notice text="You can review this vehicle from tomorrow, after your trip has started." />;
    }
    return null;
  })();

  return (
    <Section title="Reviews">
      <View style={styles.summary}>
        {v.rating_avg != null ? (
          <>
            <Text style={styles.big}>{Number(v.rating_avg).toFixed(1)}</Text>
            <View style={{ gap: 4 }}>
              <Stars value={Number(v.rating_avg)} size={16} />
              <Text style={styles.muted}>
                {v.rating_count} review{v.rating_count === 1 ? '' : 's'}
                {v.verified_count ? ` · ${v.verified_count} verified hire${v.verified_count === 1 ? '' : 's'}` : ''}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.muted}>
            {v.rating_count
              ? `${v.rating_count} review${v.rating_count === 1 ? '' : 's'} so far. The rating shows after 3 reviews.`
              : 'No reviews yet.'}
          </Text>
        )}
      </View>
      {cta}
      {error ? <Notice tone="danger" text={error} /> : null}
      {reviews == null ? (
        <Skeleton style={{ height: 90, borderRadius: radius.md }} />
      ) : (
        reviews.map((r) => (
          <ReviewCard
            key={r.id}
            review={r}
            ownerName={v.owner_name}
            canReply={v.is_mine}
            canReport={!r.is_mine}
            onReply={() => setReplying(r)}
            onReport={() =>
              session ? setReporting(r.id) : router.push({ pathname: '/sign-in', params: { reason: 'contact' } })
            }
          />
        ))
      )}
      {hasMore ? <Button label="Show more reviews" kind="ghost" onPress={more} /> : null}
      <Text style={styles.small}>
        Reviews come only from people who contacted the owner through RentAnything. &ldquo;Verified hire&rdquo;
        means the owner confirmed the rental.
      </Text>

      <ReportSheet
        visible={reporting != null}
        title="Report this review"
        subtitle="We'll check it and remove it if it breaks our rules."
        reasons={REVIEW_REPORT_REASONS}
        onClose={() => setReporting(null)}
        onSubmit={async (reason, note) => {
          await reportReview(reporting!, reason, note);
          toast("Thanks, we'll review it");
        }}
      />
      <ReplySheet
        review={replying}
        onClose={() => setReplying(null)}
        onSaved={() => {
          setReplying(null);
          toast('Reply posted');
          load();
        }}
      />
    </Section>
  );
}

function ReplySheet({
  review,
  onClose,
  onSaved,
}: {
  review: Review | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: string | null) => {
    if (!review) return;
    setBusy(true);
    setError(null);
    try {
      await replyToReview(review.id, value);
      setText('');
      onSaved();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={review != null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => setText(review?.owner_reply ?? '')}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}} style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
          <Text style={styles.sheetTitle}>Reply to {review?.reviewer_name}</Text>
          <Text style={styles.muted}>Your reply is public. Keep it polite. Thank them or explain what happened.</Text>
          <Field value={text} onChangeText={setText} multiline maxLength={1000} placeholder="Thank you for renting with us…" />
          {error ? <Notice tone="danger" text={error} /> : null}
          <Button label="Post reply" onPress={() => save(text)} loading={busy} disabled={!text.trim()} />
          {review?.owner_reply ? (
            <Button label="Remove reply" kind="danger" onPress={() => save(null)} disabled={busy} />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 13, fontWeight: font.bold, color: colors.ink },
  badgeCount: { fontSize: 12, fontWeight: font.regular, color: colors.text2 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  big: { fontSize: 36, fontWeight: font.bold, color: colors.ink },
  muted: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  small: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  invite: { gap: 8, padding: 14, borderRadius: radius.md, backgroundColor: colors.primary50 },
  inviteTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  review: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: font.bold, color: colors.primary },
  reviewer: { fontSize: 14, fontWeight: font.semibold, color: colors.ink },
  comment: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  reply: { gap: 4, padding: 10, borderRadius: radius.md, backgroundColor: colors.background },
  replyTitle: { fontSize: 12, fontWeight: font.semibold, color: colors.text2 },
  replyButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  link: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    gap: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: font.bold, color: colors.ink },
});
