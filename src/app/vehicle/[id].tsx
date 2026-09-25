import { createURL } from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Award,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronLeft,
  CircleAlert,
  EyeOff,
  Flag,
  Gauge,
  MapPin,
  MessageCircle,
  Plus,
  Share2,
  ShieldCheck,
  Snowflake,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/layout';
import {
  Button,
  Divider,
  Field,
  KeyValue,
  Notice,
  RoundIconButton,
  Section,
  Segmented,
  Stepper,
  Tag,
} from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { PhotoViewer } from '@/components/photo-viewer';
import { ReportSheet } from '@/components/report-sheet';
import { RatingBadge, ReviewsSection } from '@/components/reviews';
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth } from '@/lib/auth';
import { contactSupport, hasSupport } from '@/lib/support';
import { LISTING_REPORT_REASONS, reportListing } from '@/lib/trust';
import { startConversation } from '@/lib/chat';
import { formatDistance, formatKm, formatLKR, parseAmount } from '@/lib/format';
import { useUserLocation } from '@/lib/location';
import { ownerBadge } from '@/lib/coins';
import { HELP, minHireLabel, minHireSentence } from '@/lib/help';
import { estimateTrip, headlinePrice } from '@/lib/pricing';
import { friendlyError } from '@/lib/supabase';
import {
  DOCUMENTS,
  FUEL_POLICIES,
  FUEL_TYPES,
  getVehicle,
  TRANSMISSIONS,
  vehicleTypeLabel,
  type VehicleDetail,
} from '@/lib/vehicles';
import { colors, font, maxContentWidth, radius } from '@/theme';


export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { place } = useUserLocation();
  const { session } = useAuth();
  const { toast } = useFeedback();
  const insets = useSafeAreaInsets();

  // Tagged with the listing id it belongs to; loading = no result for this id yet.
  const [loaded, setLoaded] = useState<{ id: string; v: VehicleDetail | null; error: string | null } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    getVehicle(id, place).then(
      (d) => !cancelled && setLoaded({ id, v: d, error: null }),
      (e) => !cancelled && setLoaded({ id, v: null, error: friendlyError(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [id, place]);
  const loading = loaded?.id !== id;
  const v = loading ? null : loaded.v;
  const error = loading ? null : loaded.error;

  // Message / Book need an account. If the user isn't signed in we remember
  // what they tapped and continue once they come back signed in.
  const pending = useRef<'chat' | 'book' | null>(null);
  const [opening, setOpening] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const message = useCallback(async () => {
    if (!v) return;
    if (!session) {
      pending.current = 'chat';
      router.push({ pathname: '/sign-in', params: { reason: 'chat' } });
      return;
    }
    setOpening(true);
    setContactError(null);
    try {
      const chatId = await startConversation(v.id);
      router.push({ pathname: '/chat/[id]', params: { id: chatId } });
    } catch (e) {
      setContactError(friendlyError(e));
    } finally {
      setOpening(false);
    }
  }, [v, session]);

  const book = useCallback(() => {
    if (!v) return;
    if (!session) {
      pending.current = 'book';
      router.push({ pathname: '/sign-in', params: { reason: 'book' } });
      return;
    }
    router.push({ pathname: '/book/[id]', params: { id: v.id } });
  }, [v, session]);

  useEffect(() => {
    const action = pending.current;
    if (session && action) {
      pending.current = null;
      Promise.resolve().then(() => (action === 'book' ? book() : message()));
    }
  }, [session, message, book]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [reporting, setReporting] = useState(false);

  const share = async () => {
    if (!v) return;
    const url =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.href
        : createURL(`/vehicle/${v.id}`);
    const message = `${v.title} for rent in ${v.town}: ${formatLKR(v.price_per_day)}/day on RentAnything`;
    try {
      await Share.share({ title: v.title, message: `${message}\n${url}`, url });
    } catch {
      // Browsers without the share sheet: copy the link instead.
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!v) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <RoundIconButton icon={ChevronLeft} label="Back" onPress={goBack} size={40} background="transparent" />
        <EmptyState
          icon={EyeOff}
          title={error ? "Couldn't load this vehicle" : 'Not available'}
          text={error ?? 'This vehicle was switched off by the owner or removed.'}
          action={<Button label="Browse other vehicles" onPress={() => router.replace('/')} />}
        />
      </SafeAreaView>
    );
  }

  const hp = headlinePrice(v);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <PhotoPager
          v={v}
          topInset={insets.top}
          onBack={goBack}
          onOpen={setViewerIndex}
          onShare={share}
        />

        {!v.is_live ? (
          <View style={{ padding: 16, gap: 10, backgroundColor: colors.white }}>
            <Notice
              icon={EyeOff}
              tone={v.hidden_reason ? 'danger' : 'primary'}
              text={
                v.hidden_reason === 'reports'
                  ? 'Hidden while we review reports from customers. Only you can see it.'
                  : v.hidden_reason === 'admin'
                    ? 'Hidden by RentAnything. Only you can see it.'
                    : "Only you can see this. The vehicle is switched off, so it isn't in search results."
              }
            />
            {v.hidden_reason && hasSupport ? (
              <Button
                label="Contact support on WhatsApp"
                kind="whatsapp"
                size="sm"
                icon={MessageCircle}
                onPress={() => contactSupport(`Hi RentAnything, my listing "${v.title}" was hidden. Can you help?`)}
              />
            ) : null}
          </View>
        ) : null}

        <Section style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Tag label={vehicleTypeLabel(v.vehicle_type)} tone="primary" />
            {v.is_live ? <Tag label="Available now" icon={Check} tone="success" /> : null}
            {minHireLabel(v.min_days) ? (
              <Tag label={minHireLabel(v.min_days)!} icon={CalendarClock} tone="offer" />
            ) : null}
          </View>
          <Text style={styles.title}>{v.title}</Text>
          {v.rating_avg != null ? (
            <RatingBadge avg={v.rating_avg} count={v.rating_count} />
          ) : null}
          <Text style={styles.sub}>
            {[
              v.year,
              TRANSMISSIONS.find((t) => t.value === v.transmission)?.label,
              FUEL_TYPES.find((t) => t.value === v.fuel_type)?.label,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={styles.row}>
            <MapPin size={16} color={colors.primary} />
            <Text style={styles.loc}>
              {[v.town, formatDistance(v.distance_km)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={[styles.row, { gap: 8, paddingTop: 6 }]}>
            <SpecTile icon={Users} value={String(v.seats)} label="Seats" />
            <SpecTile icon={Snowflake} value={v.has_ac ? 'Yes' : 'No'} label="AC" />
            <SpecTile
              icon={Gauge}
              value={v.km_per_day ? formatKm(v.km_per_day) : 'Unlimited'}
              label="Free / day"
            />
            <SpecTile
              icon={Plus}
              value={v.extra_km_rate != null ? formatLKR(v.extra_km_rate) : '—'}
              label="Extra / km"
            />
          </View>
          {v.double_seat ? (
            <Text style={styles.sub}>Double seat: two seat rows behind the driver.</Text>
          ) : null}
          {minHireSentence(v.min_days) ? (
            <Notice icon={CalendarClock} text={minHireSentence(v.min_days)!} help={HELP.minDays} />
          ) : null}
        </Section>

        <Section title="Pricing">
          {hp.unit === 'day' ? <KeyValue label="Per day" value={formatLKR(v.price_per_day)} /> : null}
          {hp.unit !== 'day' ? (
            <KeyValue
              label={hp.unit === 'month' ? 'Per month · 30 days' : 'Per week · 7 days'}
              help={HELP.minDays}
              value={formatLKR(hp.amount)}
              sub={`${formatLKR(hp.perDay ?? 0)} a day`}
            />
          ) : null}
          {v.weekly_price != null && hp.unit === 'day' ? (
            <KeyValue
              label="Weekly · 7 days"
              help={HELP.offers}
              value={formatLKR(v.weekly_price)}
              sub={v.weekly_km ? `${formatKm(v.weekly_km)} included` : 'Unlimited km'}
            />
          ) : null}
          {v.monthly_price != null && hp.unit !== 'month' ? (
            <KeyValue
              label="Monthly · 30 days"
              help={v.weekly_price != null && hp.unit === 'day' ? undefined : HELP.offers}
              value={formatLKR(v.monthly_price)}
              sub={v.monthly_km ? `${formatKm(v.monthly_km)} included` : 'Unlimited km'}
            />
          ) : null}
          <Divider />
          <KeyValue label="Free km" help={HELP.freeKm} value={v.km_per_day ? `${formatKm(v.km_per_day)} / day` : 'Unlimited'} />
          {v.extra_km_rate != null ? (
            <KeyValue label="Extra km" help={HELP.extraKm} value={`${formatLKR(v.extra_km_rate)} / km`} />
          ) : null}
          <KeyValue
            label="Minimum hire"
            help={HELP.minDays}
            value={`${v.min_days} day${v.min_days > 1 ? 's' : ''}`}
            sub={minHireLabel(v.min_days) && v.min_days >= 7 ? minHireLabel(v.min_days)! : undefined}
          />
        </Section>

        <Section title="Driver" help={v.driver_available ? HELP.driver : HELP.selfDrive}>
          {v.driver_available ? (
            <IconRow
              icon={User}
              title="Driver available"
              text={
                v.driver_price_per_day
                  ? `${formatLKR(v.driver_price_per_day)} / day · all-inclusive`
                  : 'Included in the price'
              }
            />
          ) : null}
          {v.self_drive ? (
            <IconRow icon={Check} title="Self-drive allowed" text="You can drive it yourself" />
          ) : (
            <IconRow
              icon={X}
              muted
              title="Self-drive not allowed"
              text="Rented with a driver only"
            />
          )}
        </Section>

        <Section title="Terms">
          <KeyValue
            label="Refundable deposit"
            help={HELP.deposit}
            value={v.deposit ? formatLKR(v.deposit) : 'Not required'}
          />
          <KeyValue
            label="Documents"
            help={HELP.documents}
            value={
              v.documents.length
                ? v.documents.map((d) => DOCUMENTS.find((x) => x.value === d)?.label ?? d).join(', ')
                : 'Ask the owner'
            }
          />
          <KeyValue
            label="Fuel"
            help={HELP.fuelPolicy}
            value={FUEL_POLICIES.find((f) => f.value === v.fuel_policy)?.label ?? 'Ask the owner'}
          />
          {v.terms_notes ? <Text style={styles.body}>{v.terms_notes}</Text> : null}
        </Section>

        <TripEstimate v={v} />

        {v.description ? (
          <Section title="About this vehicle">
            <Text style={styles.body}>{v.description}</Text>
          </Section>
        ) : null}

        <ReviewsSection v={v} />

        <Section>
          <View style={[styles.row, { gap: 12 }]}>
            <Avatar name={v.owner_name || 'Owner'} path={v.owner_avatar} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.ownerName}>{v.owner_name || 'Vehicle owner'}</Text>
              {ownerBadge(v.owner_verified) ? (
                <View style={{ flexDirection: 'row', paddingVertical: 2 }}>
                  <Tag
                    icon={ownerBadge(v.owner_verified)!.top ? Award : ShieldCheck}
                    label={ownerBadge(v.owner_verified)!.label}
                    tone="success"
                  />
                </View>
              ) : null}
              <Text style={styles.sub}>
                Owner · {v.owner_listing_count} vehicle{v.owner_listing_count === 1 ? '' : 's'} listed
              </Text>
              {v.owner_rating_avg != null ? (
                <Text style={styles.sub}>
                  ★ {Number(v.owner_rating_avg).toFixed(1)} across all their vehicles ({v.owner_rating_count})
                </Text>
              ) : null}
            </View>
          </View>
        </Section>

        {!v.is_mine ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              session ? setReporting(true) : router.push({ pathname: '/sign-in', params: { reason: 'contact' } })
            }
            style={styles.reportLink}>
            <Flag size={14} color={colors.muted} />
            <Text style={styles.reportText}>Report this listing</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <ReportSheet
        visible={reporting}
        title="Report this listing"
        subtitle="Help us keep RentAnything safe. What's wrong?"
        reasons={LISTING_REPORT_REASONS}
        onClose={() => setReporting(false)}
        onSubmit={async (reason, note) => {
          await reportListing(v.id, reason, note);
          toast("Thanks, we'll review this listing");
        }}
      />

      <View style={[styles.contactBar, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <View style={styles.contactInner}>
          {contactError ? <Notice icon={CircleAlert} tone="danger" text={contactError} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flexShrink: 1, minWidth: 84 }}>
              <Text style={styles.barPrice} numberOfLines={1}>
                {formatLKR(hp.amount)}
              </Text>
              <Text style={styles.barPer}>per {hp.unit}</Text>
            </View>
            <Button
              label="Message"
              kind="soft"
              icon={MessageCircle}
              style={styles.barButton}
              loading={opening}
              disabled={!v.is_live || v.is_mine}
              onPress={message}
            />
            <Button
              label="Book"
              icon={CalendarCheck}
              style={styles.barButton}
              disabled={!v.is_live || v.is_mine}
              onPress={book}
            />
          </View>
        </View>
      </View>

      {v.photos.length ? (
        <PhotoViewer
          photos={v.photos}
          start={viewerIndex ?? 0}
          visible={viewerIndex != null}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </View>
  );
}

function PhotoPager({
  v,
  topInset,
  onBack,
  onOpen,
  onShare,
}: {
  v: VehicleDetail;
  topInset: number;
  onBack: () => void;
  onOpen: (index: number) => void;
  onShare: () => void;
}) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const photos = v.photos.length ? v.photos : [null];

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.pager} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}>
          {photos.map((p, i) => (
            <Pressable
              key={p ?? i}
              disabled={!p}
              onPress={() => onOpen(i)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Photo ${i + 1} of ${photos.length}. Open full screen`}
              style={{ width, height: '100%' }}>
              <VehiclePhoto path={p} seed={v.id} style={{ width, height: '100%' }} iconSize={96} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={[styles.photoButton, { top: topInset + 8, left: 16 }]}>
        <RoundIconButton icon={ChevronLeft} label="Back" onPress={onBack} size={40} background={colors.white} />
      </View>
      <View style={[styles.photoButton, { top: topInset + 8, right: 16 }]}>
        <RoundIconButton icon={Share2} label="Share" onPress={onShare} size={40} background={colors.white} />
      </View>
      {v.photos.length > 1 ? (
        <>
          <View style={styles.dots}>
            {v.photos.map((p, i) => (
              <View key={p} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {index + 1} / {v.photos.length}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function TripEstimate({ v }: { v: VehicleDetail }) {
  const [days, setDays] = useState(Math.max(3, v.min_days));
  const [kmText, setKmText] = useState('');
  const [withDriver, setWithDriver] = useState(!v.self_drive);
  const km = parseAmount(kmText) ?? 0;
  const e = useMemo(() => estimateTrip(v, days, km, withDriver), [v, days, km, withDriver]);

  const baseLabel =
    e.plan === 'monthly'
      ? `Monthly rate · ${e.days} days`
      : e.plan === 'weekly'
        ? `Weekly rate · ${e.days} days`
        : `${e.days} day${e.days > 1 ? 's' : ''} × ${formatLKR(v.price_per_day)}`;

  return (
    <Section title="Trip estimate" help={HELP.estimate}>
      {v.self_drive && v.driver_available ? (
        <Segmented
          options={[
            { value: false, label: 'Self-drive' },
            { value: true, label: 'With driver' },
          ]}
          value={withDriver}
          onChange={setWithDriver}
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stepper
          label="Days"
          help={HELP.nightToNight}
          value={days}
          onChange={setDays}
          min={Math.max(1, v.min_days)}
        />
        <Field
          label="Total km (approx.)"
          value={kmText}
          onChangeText={setKmText}
          keyboardType="number-pad"
          placeholder="0"
          suffix="km"
          style={{ flex: 1 }}
        />
      </View>
      <View style={styles.breakdown}>
        <KeyValue label={baseLabel} value={formatLKR(e.base)} />
        {e.driverCost > 0 ? (
          <KeyValue
            label={`Driver · ${e.days} × ${formatLKR(v.driver_price_per_day ?? 0)}`}
            value={formatLKR(e.driverCost)}
          />
        ) : null}
        {e.extraKm > 0 ? (
          <KeyValue
            label={`Extra km · ${e.extraKm} × ${formatLKR(v.extra_km_rate ?? 0)}`}
            value={formatLKR(e.extraKmCost)}
          />
        ) : null}
        <Divider />
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={{ fontSize: 15, fontWeight: font.semibold, color: colors.ink }}>Estimated total</Text>
          <Text style={{ fontSize: 20, fontWeight: font.bold, color: colors.primary }}>{formatLKR(e.total)}</Text>
        </View>
      </View>
      <Text style={styles.note}>
        {e.freeKm == null ? 'Unlimited km. ' : `${formatKm(e.freeKm)} free for ${e.days} days. `}
        {e.minDaysApplied ? `Minimum hire is ${v.min_days} days. ` : ''}
        You take the vehicle in the evening, the day before your first day, and bring it back at night on your last
        day. You agree the final price with the owner.
      </Text>
    </Section>
  );
}

function SpecTile({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Icon size={20} color={colors.primary} />
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function IconRow({
  icon: Icon,
  title,
  text,
  muted,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  muted?: boolean;
}) {
  return (
    <View style={[styles.row, { gap: 12 }]}>
      <View style={[styles.iconCircle, { backgroundColor: muted ? colors.background : colors.primary50 }]}>
        <Icon size={20} color={muted ? colors.text2 : colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, fontWeight: font.semibold, color: colors.ink }}>{title}</Text>
        <Text style={styles.sub}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { gap: 8, paddingBottom: 24, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: font.bold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2 },
  loc: { fontSize: 14, fontWeight: font.medium, color: colors.text2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  tileValue: { fontSize: 14, fontWeight: font.bold, color: colors.ink },
  tileLabel: { fontSize: 11, fontWeight: font.medium, color: colors.muted },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  breakdown: { padding: 14, gap: 10, borderRadius: radius.md, backgroundColor: colors.primary50 },
  note: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  ownerName: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  pager: { width: '100%', aspectRatio: 4 / 3, maxHeight: 440 },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  reportText: { fontSize: 13, color: colors.muted, textDecorationLine: 'underline' },
  photoButton: { position: 'absolute' },
  dots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  dotActive: { width: 18, backgroundColor: colors.white },
  barPrice: { fontSize: 17, fontWeight: font.bold, color: colors.ink },
  barPer: { fontSize: 12, color: colors.muted },
  barButton: { flex: 1, paddingHorizontal: 10 },
  counter: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  },
  counterText: { color: colors.white, fontSize: 12, fontWeight: font.semibold },
  contactBar: {
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  contactInner: { gap: 10, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
});
