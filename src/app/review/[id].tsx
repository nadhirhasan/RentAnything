import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, ChevronLeft, MessageSquareOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFeedback } from '@/components/feedback';
import { EmptyState, Screen } from '@/components/layout';
import { RATING_WORDS, StarInput } from '@/components/reviews';
import { Button, Chip, Field, Notice, RoundIconButton, Segmented, Skeleton, Tag, Wrap } from '@/components/ui';
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import {
  BAD_TAGS,
  getMyReviewStatus,
  GOOD_TAGS,
  submitContactFeedback,
  submitReview,
  type MyReviewStatus,
  type ReviewTag,
} from '@/lib/trust';
import { getVehicle, type VehicleDetail } from '@/lib/vehicles';
import { colors, font, radius } from '@/theme';

type Step = 'ask' | 'review' | 'feedback';

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { toast } = useFeedback();

  const [loaded, setLoaded] = useState<{ v: VehicleDetail | null; status: MyReviewStatus } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('ask');

  // Review form
  const [rating, setRating] = useState(0);
  const [condition, setCondition] = useState(0);
  const [ownerRating, setOwnerRating] = useState(0);
  const [value, setValue] = useState(0);
  const [tags, setTags] = useState<ReviewTag[]>([]);
  const [comment, setComment] = useState('');
  // Didn't-rent feedback
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [accurate, setAccurate] = useState<boolean | null | 'unsure'>(null);

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.all([getVehicle(id, null), getMyReviewStatus(id)]).then(
      ([v, status]) => {
        if (cancelled) return;
        setLoaded({ v, status });
        const r = status.my_review;
        if (r) {
          setRating(r.rating);
          setCondition(r.condition_rating ?? 0);
          setOwnerRating(r.owner_rating ?? 0);
          setValue(r.value_rating ?? 0);
          setTags(r.tags);
          setComment(r.comment);
        }
        // Skip "did you rent it?" when we already know.
        if (r || status.verified) setStep('review');
      },
      (e) => !cancelled && setError(friendlyError(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [id, session]);

  const close = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/vehicle/[id]', params: { id } }));

  if (!session) {
    return (
      <Screen>
        <EmptyState
          icon={MessageSquareOff}
          title="Sign in to review"
          action={<Button label="Sign in" onPress={() => router.push('/sign-in')} style={{ alignSelf: 'stretch' }} />}
        />
      </Screen>
    );
  }

  if (error || (loaded && (!loaded.v || loaded.status.eligibility !== 'ok') && !loaded.status.my_review)) {
    const reason = loaded?.status.eligibility;
    return (
      <Screen>
        <EmptyState
          icon={MessageSquareOff}
          title="You can't review this vehicle yet"
          text={
            error ??
            (reason === 'too_soon'
              ? 'You can review from a day after contacting the owner.'
              : reason === 'expired'
                ? 'Reviews can be written up to 60 days after contacting the owner.'
                : reason === 'own_listing'
                  ? "You can't review your own vehicle."
                  : 'Only people who contacted the owner through RentAnything can review.')
          }
          action={<Button label="Back" onPress={close} style={{ alignSelf: 'stretch' }} />}
        />
      </Screen>
    );
  }

  const toggleTag = (t: ReviewTag) =>
    setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));

  const sendReview = async () => {
    if (!rating) {
      setFormError('Tap the stars to give an overall rating');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await submitReview(id, {
        rating,
        condition_rating: condition || null,
        owner_rating: ownerRating || null,
        value_rating: value || null,
        tags,
        comment: comment.trim(),
      });
      toast(loaded?.status.my_review ? 'Review updated' : 'Thanks for your review!');
      close();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const sendFeedback = async () => {
    if (answered == null) {
      setFormError('Tell us if the owner answered');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await submitContactFeedback(id, answered, accurate === 'unsure' ? null : accurate);
      toast('Thanks for your feedback!');
      close();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const v = loaded?.v;

  return (
    <Screen background={colors.white} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <RoundIconButton icon={ChevronLeft} label="Back" onPress={close} background="transparent" size={40} />
        <Text style={styles.topTitle}>{step === 'feedback' ? 'Quick feedback' : 'Your review'}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {v ? (
            <View style={styles.vehicle}>
              <VehiclePhoto path={v.photos[0]} seed={v.id} style={styles.thumb} fit="cover" iconSize={24} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.vehicleTitle} numberOfLines={2}>
                  {v.title}
                </Text>
                <Text style={styles.muted}>
                  {v.owner_name} · {v.town}
                </Text>
                {loaded?.status.verified ? <Tag label="Verified hire" icon={BadgeCheck} tone="success" /> : null}
              </View>
            </View>
          ) : (
            <Skeleton style={{ height: 72, borderRadius: radius.md }} />
          )}

          {step === 'ask' ? (
            <View style={{ gap: 12 }}>
              <Text style={styles.heading}>Did you rent this vehicle?</Text>
              <Button label="Yes, I rented it" onPress={() => setStep('review')} />
              <Button label="No, I didn't rent it" kind="ghost" onPress={() => setStep('feedback')} />
            </View>
          ) : null}

          {step === 'review' ? (
            <>
              <View style={{ gap: 8, alignItems: 'center' }}>
                <Text style={styles.heading}>How was it overall?</Text>
                <StarInput value={rating} onChange={setRating} label="Overall rating" size={40} />
                <Text style={styles.ratingWord}>{RATING_WORDS[rating] || ' '}</Text>
              </View>
              <View style={styles.subRatings}>
                <SubRating label="Vehicle condition" value={condition} onChange={setCondition} />
                <SubRating label="Owner (on time, honest)" value={ownerRating} onChange={setOwnerRating} />
                <SubRating label="Value for money" value={value} onChange={setValue} />
              </View>
              <View style={{ gap: 10 }}>
                <Text style={styles.label}>What stood out? (optional)</Text>
                <Wrap>
                  {GOOD_TAGS.map((t) => (
                    <Chip key={t.value} label={t.label} selected={tags.includes(t.value)} onPress={() => toggleTag(t.value)} />
                  ))}
                </Wrap>
                <Wrap>
                  {BAD_TAGS.map((t) => (
                    <Chip key={t.value} label={t.label} selected={tags.includes(t.value)} onPress={() => toggleTag(t.value)} />
                  ))}
                </Wrap>
              </View>
              <Field
                label="Tell others about your trip (optional)"
                value={comment}
                onChangeText={setComment}
                multiline
                maxLength={1000}
                placeholder="e.g. Clean van, driver was on time and very helpful."
                hint="Don't include phone numbers or personal details."
              />
              {formError ? <Notice tone="danger" text={formError} /> : null}
              <Button
                label={loaded?.status.my_review ? 'Update review' : 'Post review'}
                onPress={sendReview}
                loading={busy}
              />
            </>
          ) : null}

          {step === 'feedback' ? (
            <>
              <Text style={styles.muted}>
                Thanks for letting us know. Two quick questions help us keep listings accurate.
              </Text>
              <View style={{ gap: 8 }}>
                <Text style={styles.label}>Did the owner answer your call or message?</Text>
                <Segmented
                  options={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ]}
                  value={answered == null ? '' : answered ? 'yes' : 'no'}
                  onChange={(x) => setAnswered(x === 'yes')}
                />
              </View>
              <View style={{ gap: 8 }}>
                <Text style={styles.label}>Was the listing information correct?</Text>
                <Segmented
                  options={[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                    { value: 'unsure', label: 'Not sure' },
                  ]}
                  value={accurate == null ? '' : accurate === 'unsure' ? 'unsure' : accurate ? 'yes' : 'no'}
                  onChange={(x) => setAccurate(x === 'unsure' ? 'unsure' : x === 'yes')}
                />
              </View>
              {formError ? <Notice tone="danger" text={formError} /> : null}
              <Button label="Send feedback" onPress={sendFeedback} loading={busy} />
              <Button label="Actually, I did rent it" kind="ghost" onPress={() => setStep('review')} />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SubRating({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.subRow}>
      <Text style={styles.subLabel}>{label}</Text>
      <StarInput value={value} onChange={onChange} size={24} label={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  topTitle: { fontSize: 17, fontWeight: font.semibold, color: colors.ink },
  body: { padding: 16, gap: 22, paddingBottom: 32 },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  vehicleTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  muted: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  heading: { fontSize: 20, fontWeight: font.bold, color: colors.ink, textAlign: 'center' },
  ratingWord: { fontSize: 15, fontWeight: font.semibold, color: colors.text2 },
  subRatings: { gap: 14, padding: 14, borderRadius: radius.md, backgroundColor: colors.background },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  subLabel: { fontSize: 14, fontWeight: font.medium, color: colors.ink },
  label: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
});
