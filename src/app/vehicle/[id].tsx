import { router, useLocalSearchParams } from 'expo-router';
import {
  Check,
  ChevronLeft,
  CircleAlert,
  EyeOff,
  Gauge,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Snowflake,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth } from '@/lib/auth';
import { formatDistance, formatKm, formatLKR, parseAmount, telUrl, whatsappUrl } from '@/lib/format';
import { useUserLocation } from '@/lib/location';
import { estimateTrip } from '@/lib/pricing';
import { friendlyError } from '@/lib/supabase';
import {
  DOCUMENTS,
  FUEL_POLICIES,
  FUEL_TYPES,
  getOwnerContact,
  getVehicle,
  TRANSMISSIONS,
  vehicleTypeLabel,
  type ContactChannel,
  type VehicleDetail,
} from '@/lib/vehicles';
import { colors, font, maxContentWidth, radius } from '@/theme';

const PHOTO_HEIGHT = 290;

export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { place } = useUserLocation();
  const { session } = useAuth();
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

  // Contact: sign-in is required. If the user isn't signed in we remember
  // what they tapped and continue once they come back signed in.
  const pending = useRef<ContactChannel | null>(null);
  const [contacting, setContacting] = useState<ContactChannel | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  const contact = useCallback(async (channel: ContactChannel) => {
    if (!v) return;
    if (!session) {
      pending.current = channel;
      router.push({ pathname: '/sign-in', params: { reason: 'contact' } });
      return;
    }
    setContacting(channel);
    setContactError(null);
    try {
      const c = await getOwnerContact(v.id, channel);
      const number = channel === 'whatsapp' ? c.whatsapp : c.phone;
      if (!number) throw new Error('The owner has not added a phone number yet.');
      setRevealed(number);
      const url =
        channel === 'whatsapp'
          ? whatsappUrl(number, `Hi! I saw your ${v.title} on RentAnything. Is it available?`)
          : telUrl(number);
      await Linking.openURL(url).catch(() => {
        // e.g. no phone app on desktop web; the number is shown instead.
      });
    } catch (e) {
      setContactError(friendlyError(e));
    } finally {
      setContacting(null);
    }
  }, [v, session]);

  useEffect(() => {
    const channel = pending.current;
    if (session && channel) {
      pending.current = null;
      Promise.resolve().then(() => contact(channel));
    }
  }, [session, contact]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <PhotoPager v={v} topInset={insets.top} onBack={goBack} />

        {!v.is_live ? (
          <View style={{ padding: 16, backgroundColor: colors.white }}>
            <Notice
              icon={EyeOff}
              text="Only you can see this. The vehicle is switched off, so it isn't in search results."
            />
          </View>
        ) : null}

        <Section style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Tag label={vehicleTypeLabel(v.vehicle_type)} tone="primary" />
            {v.is_live ? <Tag label="Available now" icon={Check} tone="success" /> : null}
          </View>
          <Text style={styles.title}>{v.title}</Text>
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
        </Section>

        <Section title="Pricing">
          <KeyValue label="Per day" value={formatLKR(v.price_per_day)} />
          {v.weekly_price != null ? (
            <KeyValue
              label="Weekly · 7 days"
              value={formatLKR(v.weekly_price)}
              sub={v.weekly_km ? `${formatKm(v.weekly_km)} included` : 'Unlimited km'}
            />
          ) : null}
          {v.monthly_price != null ? (
            <KeyValue
              label="Monthly · 30 days"
              value={formatLKR(v.monthly_price)}
              sub={v.monthly_km ? `${formatKm(v.monthly_km)} included` : 'Unlimited km'}
            />
          ) : null}
          <Divider />
          <KeyValue label="Free km" value={v.km_per_day ? `${formatKm(v.km_per_day)} / day` : 'Unlimited'} />
          {v.extra_km_rate != null ? (
            <KeyValue label="Extra km" value={`${formatLKR(v.extra_km_rate)} / km`} />
          ) : null}
          <KeyValue label="Minimum hire" value={`${v.min_days} day${v.min_days > 1 ? 's' : ''}`} />
        </Section>

        <Section title="Driver">
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
            value={v.deposit ? formatLKR(v.deposit) : 'Not required'}
          />
          <KeyValue
            label="Documents"
            value={
              v.documents.length
                ? v.documents.map((d) => DOCUMENTS.find((x) => x.value === d)?.label ?? d).join(', ')
                : 'Ask the owner'
            }
          />
          <KeyValue
            label="Fuel"
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

        <Section>
          <View style={[styles.row, { gap: 12 }]}>
            <View style={styles.ownerAvatar}>
              <Text style={styles.ownerInitials}>{initials(v.owner_name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ownerName}>{v.owner_name || 'Vehicle owner'}</Text>
              <Text style={styles.sub}>
                Owner · {v.owner_listing_count} vehicle{v.owner_listing_count === 1 ? '' : 's'} listed
              </Text>
            </View>
          </View>
        </Section>
      </ScrollView>

      <View style={[styles.contactBar, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <View style={styles.contactInner}>
          {contactError ? <Notice icon={CircleAlert} tone="danger" text={contactError} /> : null}
          {revealed ? (
            <View style={[styles.row, { justifyContent: 'center' }]}>
              <Phone size={14} color={colors.text2} />
              <Text style={styles.sub} selectable>
                Owner&apos;s number: {revealed}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button
              label="WhatsApp"
              kind="whatsapp"
              icon={MessageCircle}
              style={{ flex: 1 }}
              loading={contacting === 'whatsapp'}
              disabled={!v.is_live}
              onPress={() => contact('whatsapp')}
            />
            <Button
              label="Call"
              icon={Phone}
              style={{ flex: 1 }}
              loading={contacting === 'call'}
              disabled={!v.is_live}
              onPress={() => contact('call')}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function PhotoPager({ v, topInset, onBack }: { v: VehicleDetail; topInset: number; onBack: () => void }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const photos = v.photos.length ? v.photos : [null];

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={{ height: PHOTO_HEIGHT }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}>
          {photos.map((p, i) => (
            <VehiclePhoto key={p ?? i} path={p} seed={v.id} style={{ width, height: PHOTO_HEIGHT }} iconSize={96} />
          ))}
        </ScrollView>
      ) : null}
      <View style={[styles.photoButton, { top: topInset + 8, left: 16 }]}>
        <RoundIconButton icon={ChevronLeft} label="Back" onPress={onBack} size={40} background={colors.white} />
      </View>
      {v.photos.length > 1 ? (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {index + 1} / {v.photos.length}
          </Text>
        </View>
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
    <Section title="Trip estimate">
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
        <Stepper label="Days" value={days} onChange={setDays} min={1} />
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
        Final price is agreed with the owner.
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
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
  ownerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerInitials: { fontSize: 15, fontWeight: font.bold, color: colors.primary },
  ownerName: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  photoButton: { position: 'absolute' },
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
