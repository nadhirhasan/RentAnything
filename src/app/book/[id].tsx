import { router, useLocalSearchParams } from 'expo-router';
import { Banknote, CalendarDays, ChevronLeft, CircleAlert, EyeOff } from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatesSheet } from '@/components/booking';
import { useFeedback } from '@/components/feedback';
import { EmptyState, Screen, SignInPrompt } from '@/components/layout';
import {
  Button,
  Divider,
  Field,
  InfoTip,
  KeyValue,
  Notice,
  RoundIconButton,
  Section,
  Segmented,
  Skeleton,
  type Help,
} from '@/components/ui';
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth } from '@/lib/auth';
import {
  addDays,
  daysBetween,
  formatDay,
  formatDays,
  formatRange,
  handover,
  lastDay,
  overlapsBooked,
  type DateRange,
  type Pickup,
} from '@/lib/booking-rules';
import { getBookedDates, requestBooking } from '@/lib/bookings';
import { askForNotifications } from '@/lib/push';
import { colomboDate, formatLKPhone, formatLKR, isValidLKPhone } from '@/lib/format';
import { HELP, minHireSentence } from '@/lib/help';
import { useUserLocation } from '@/lib/location';
import { estimateTrip, headlinePrice } from '@/lib/pricing';
import { friendlyError, supabase } from '@/lib/supabase';
import { getVehicle, type VehicleDetail } from '@/lib/vehicles';
import { colors, font, maxContentWidth, radius } from '@/theme';

// How far ahead customers can pick trip days (the database allows 180).
const DAYS_AHEAD = 180;

type Loaded = { id: string; v: VehicleDetail | null; booked: DateRange[]; error: string | null };

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile, refreshProfile } = useAuth();
  const { place } = useUserLocation();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getVehicle(id, place), getBookedDates(id)]).then(
      ([v, booked]) => !cancelled && setLoaded({ id, v, booked, error: null }),
      (e) => !cancelled && setLoaded({ id, v: null, booked: [], error: friendlyError(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [id, place]);

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/vehicle/[id]', params: { id } });

  if (!session) {
    return (
      <Screen>
        <TopBar onBack={goBack} />
        <SignInPrompt title="Sign in to book" text="Sign in so the owner knows who is asking and can call you back." />
      </Screen>
    );
  }

  if (loaded?.id !== id) {
    return (
      <Screen>
        <TopBar onBack={goBack} />
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton style={{ height: 88, borderRadius: radius.lg }} />
          <Skeleton style={{ height: 160, borderRadius: radius.lg }} />
        </View>
      </Screen>
    );
  }

  if (!loaded.v || loaded.v.is_mine) {
    return (
      <Screen>
        <TopBar onBack={goBack} />
        <EmptyState
          icon={EyeOff}
          title={loaded.v?.is_mine ? "This is your vehicle" : loaded.error ? "Couldn't load this vehicle" : 'Not available'}
          text={
            loaded.v?.is_mine
              ? 'Customers use this page to send you booking requests.'
              : (loaded.error ?? 'This vehicle was switched off by the owner or removed.')
          }
          action={<Button label="Browse other vehicles" onPress={() => router.replace('/')} />}
        />
      </Screen>
    );
  }

  return (
    <BookingForm
      key={loaded.v.id}
      v={loaded.v}
      booked={loaded.booked}
      needsPhone={!profile?.phone}
      profileId={profile?.id ?? null}
      refreshProfile={refreshProfile}
      onBack={goBack}
    />
  );
}

function BookingForm({
  v,
  booked,
  needsPhone,
  profileId,
  refreshProfile,
  onBack,
}: {
  v: VehicleDetail;
  booked: DateRange[];
  needsPhone: boolean;
  profileId: string | null;
  refreshProfile: () => Promise<void>;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { toast } = useFeedback();
  const today = colomboDate();
  const lastSelectable = addDays(today, DAYS_AHEAD);
  const minDays = Math.max(1, v.min_days);

  // Starts with the first free day from tomorrow, for the owner's minimum.
  const [range, setRange] = useState<{ start: string | null; end: string | null }>(() => {
    for (let i = 1; i <= DAYS_AHEAD; i++) {
      const d = addDays(today, i);
      if (!overlapsBooked(d, minDays, booked)) return { start: d, end: lastDay(d, minDays) };
    }
    return { start: null, end: null };
  });
  const [pickingDates, setPickingDates] = useState(false);
  const { start, end } = range;
  const days = start && end ? daysBetween(start, end) : minDays;
  const [withDriver, setWithDriver] = useState(!v.self_drive);
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimate = useMemo(() => estimateTrip(v, days, 0, withDriver), [v, days, withDriver]);
  const clash = start != null && overlapsBooked(start, days, booked);
  // Rentals run night to night: collect the evening before the first day,
  // return on the night of the last day. (Morning pickup isn't offered.)
  const pickup: Pickup = 'night_before';
  const times = start ? handover(start, days, pickup) : null;

  const submit = async () => {
    setError(null);
    if (!start) {
      setError('Pick the day you want to start.');
      return;
    }
    if (clash) {
      setError('Some of those days are already booked. Pick other dates.');
      return;
    }
    if (needsPhone) {
      if (!isValidLKPhone(phone)) {
        setPhoneError('Enter a valid number, e.g. 077 123 4567');
        return;
      }
      setPhoneError(null);
    }
    setBusy(true);
    try {
      if (needsPhone && profileId) {
        const { error: e } = await supabase.from('profiles').update({ phone: formatLKPhone(phone) }).eq('id', profileId);
        if (e) throw e;
        await refreshProfile();
      }
      const bookingId = await requestBooking({ listingId: v.id, startDate: start, days, withDriver, note, pickup });
      askForNotifications();
      toast('Request sent to the owner');
      router.replace({ pathname: '/booking/[id]', params: { id: bookingId, sent: '1' } });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Screen background={colors.background}>
      <TopBar onBack={onBack} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.vehicle}>
            <VehiclePhoto path={v.photos[0]} seed={v.id} style={styles.thumb} fit="cover" iconSize={24} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title} numberOfLines={2}>
                {v.title}
              </Text>
              <Text style={styles.sub}>
                {v.town} · {formatLKR(headlinePrice(v).amount)} / {headlinePrice(v).unit}
              </Text>
            </View>
          </View>

          <Section title="When do you need it?">
            {minDays > 1 ? (
              <Notice
                icon={CalendarDays}
                text={minHireSentence(minDays) ?? `This owner rents for at least ${formatDays(minDays)}.`}
                help={HELP.minDays}
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change trip days"
              onPress={() => setPickingDates(true)}
              style={({ pressed }) => [styles.dates, pressed && { opacity: 0.85 }]}>
              <View style={styles.dateBox}>
                <Text style={styles.dateLabel}>First day</Text>
                <Text style={styles.dateValue}>{start ? formatDay(start) : 'Select'}</Text>
              </View>
              <View style={styles.dateDivider} />
              <View style={styles.dateBox}>
                <Text style={styles.dateLabel}>Last day</Text>
                <Text style={styles.dateValue}>{end ? formatDay(end) : 'Select'}</Text>
              </View>
            </Pressable>
            <View style={styles.datesFooter}>
              <Text style={styles.summary}>{start && end ? formatDays(days) : 'Pick your trip days'}</Text>
              <Pressable accessibilityRole="button" onPress={() => setPickingDates(true)} hitSlop={8}>
                <Text style={styles.change}>{start ? 'Change dates' : 'Pick dates'}</Text>
              </Pressable>
            </View>
            {clash ? <Notice icon={CircleAlert} tone="danger" text="Some of those days are already booked." /> : null}
            {booked.length ? (
              <Text style={styles.note}>
                Already booked: {booked.map((b) => formatRange(b.start_date, b.end_date)).join(', ')}
              </Text>
            ) : null}
          </Section>

          {start && times ? (
            <Section title="Collect and return" help={HELP.nightToNight}>
              <View style={styles.handover}>
                <KeyValue label="Collect" value={times.collect} />
                <KeyValue label="Return" value={times.back} />
              </View>
              <Text style={styles.note}>
                You take the vehicle in the evening, the day before your first day. You bring it back at night on your
                last day. That is {formatDays(days)}. Agree the exact time with the owner in chat.
              </Text>
            </Section>
          ) : null}

          {v.self_drive && v.driver_available ? (
            <Section title="Driver" help={HELP.driver}>
              <Segmented
                options={[
                  { value: false, label: 'Self-drive' },
                  { value: true, label: 'With driver' },
                ]}
                value={withDriver}
                onChange={setWithDriver}
              />
            </Section>
          ) : null}

          <Section title="Message to the owner">
            <Field
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
              placeholder="e.g. Family trip to Ella, 6 people, pick up in Maharagama."
            />
          </Section>

          {needsPhone ? (
            <Section title="Your phone number">
              <Field
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  setPhoneError(null);
                }}
                keyboardType="phone-pad"
                placeholder="077 123 4567"
                error={phoneError}
                hint="The owner sees it only after accepting your request."
              />
            </Section>
          ) : null}

          <Section title="Price">
            <KeyValue
              label={
                estimate.plan === 'daily'
                  ? `${formatDays(estimate.days)} × ${formatLKR(v.price_per_day)}`
                  : `${estimate.plan === 'weekly' ? 'Weekly' : 'Monthly'} rate · ${formatDays(estimate.days)}`
              }
              value={formatLKR(estimate.base)}
            />
            {estimate.driverCost > 0 ? (
              <KeyValue
                label={`Driver · ${estimate.days} × ${formatLKR(v.driver_price_per_day ?? 0)}`}
                value={formatLKR(estimate.driverCost)}
              />
            ) : null}
            <Divider />
            <KeyValue label="Estimated total" help={HELP.estimate} value={formatLKR(estimate.total)} />
            <Text style={styles.note}>
              {v.km_per_day
                ? `Includes ${v.km_per_day} km a day; extra km ${formatLKR(v.extra_km_rate ?? 0)} each. `
                : 'Unlimited km. '}
              {v.deposit ? `Refundable deposit ${formatLKR(v.deposit)}. ` : ''}
              The final price is agreed with the owner.
            </Text>
          </Section>

          <Section title="How it works">
            <Step n={1} text="The owner accepts your request. You'll both see each other's phone number." />
            <Step n={2} text="Meet the owner and check the vehicle and documents." />
            <Step
              n={3}
              help={HELP.handoverCode}
              text="Happy with it? Show the owner your 4-digit code and pay them in cash. Not happy? Tap No deal."
            />
            <Notice icon={Banknote} text="You don't pay anything in the app. Never send money before seeing the vehicle." />
          </Section>
        </ScrollView>

        <View style={[styles.bar, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
          <View style={styles.barInner}>
            {error ? <Notice icon={CircleAlert} tone="danger" text={error} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.barPrice}>{formatLKR(estimate.total)}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {times ? `Collect ${times.collect}` : 'Pay the owner in cash'}
                </Text>
              </View>
              <Button label="Send request" onPress={submit} loading={busy} style={{ paddingHorizontal: 20 }} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      {pickingDates ? (
        <DatesSheet
          today={today}
          firstSelectable={addDays(today, 1)}
          lastSelectable={lastSelectable}
          minDays={minDays}
          booked={booked}
          initialStart={start}
          initialEnd={end}
          onClose={() => setPickingDates(false)}
          onDone={(s, e) => {
            setRange({ start: s, end: e });
            setPickingDates(false);
          }}
        />
      ) : null}
    </Screen>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <RoundIconButton icon={ChevronLeft} label="Back" onPress={onBack} background="transparent" size={40} />
      <Text style={styles.topTitle}>Request to book</Text>
    </View>
  );
}

function Step({ n, text, help }: { n: number; text: ReactNode; help?: Help }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={[styles.body, { flex: 1 }]}>{text}</Text>
      {help ? <InfoTip help={help} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.white,
  },
  topTitle: { fontSize: 17, fontWeight: font.semibold, color: colors.ink },
  scroll: { gap: 8, paddingBottom: 24, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: colors.white },
  thumb: { width: 64, height: 64, borderRadius: radius.md },
  title: { fontSize: 16, fontWeight: font.semibold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2 },
  summary: { fontSize: 14, fontWeight: font.semibold, color: colors.ink },
  handover: { gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.primary50 },
  dates: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  dateBox: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  dateDivider: { width: 1, backgroundColor: colors.border },
  dateLabel: { fontSize: 12, fontWeight: font.medium, color: colors.text2 },
  dateValue: { fontSize: 16, fontWeight: font.bold, color: colors.ink },
  datesFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  change: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  note: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
  bar: {
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  barInner: { gap: 10, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  barPrice: { fontSize: 18, fontWeight: font.bold, color: colors.ink },
});
