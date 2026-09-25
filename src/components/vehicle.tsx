import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Armchair, CalendarClock, Car, Gauge, MapPin, Snowflake, Tag as TagIcon, User, Users } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { RatingBadge } from '@/components/reviews';
import { Skeleton, Tag } from '@/components/ui';
import { formatDistance, formatKm, formatLKR } from '@/lib/format';
import { minHireLabel } from '@/lib/help';
import { photoUrl } from '@/lib/supabase';
import type { VehicleSummary } from '@/lib/vehicles';
import { colors, font, radius } from '@/theme';

const PLACEHOLDER_COLORS = ['#1E3A8A', '#0F766E', '#9A3412', '#334155'];

function placeholderColor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PLACEHOLDER_COLORS[Math.abs(h) % PLACEHOLDER_COLORS.length];
}

// A listing photo from Storage (by path) or a local picked photo (by uri),
// with a coloured car placeholder when there is none.
// fit="contain" (default) shows the whole photo over a blurred copy of itself,
// so portrait or square phone photos aren't cut at the top and bottom.
// fit="cover" fills the box (for small square thumbnails).
export function VehiclePhoto({
  path,
  uri,
  seed,
  style,
  iconSize = 56,
  fit = 'contain',
}: {
  path?: string | null;
  uri?: string;
  seed: string;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
  fit?: 'contain' | 'cover';
}) {
  const src = uri ?? (path ? photoUrl(path) : null);
  return (
    <View style={[{ backgroundColor: placeholderColor(seed), overflow: 'hidden' }, style]}>
      {src && fit === 'contain' ? (
        <>
          <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15, 23, 42, 0.2)' }]} />
          <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />
        </>
      ) : src ? (
        <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Car size={iconSize} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
        </View>
      )}
    </View>
  );
}

export function offerLabel(v: {
  weekly_price: number | null;
  weekly_km: number | null;
  monthly_price: number | null;
  monthly_km: number | null;
}): string | null {
  if (v.monthly_price != null)
    return `Monthly ${formatLKR(v.monthly_price)}${v.monthly_km ? ` · ${formatKm(v.monthly_km)}` : ' · unlimited km'}`;
  if (v.weekly_price != null)
    return `Weekly ${formatLKR(v.weekly_price)}${v.weekly_km ? ` · ${formatKm(v.weekly_km)}` : ' · unlimited km'}`;
  return null;
}

export function hireModeLabel(v: { self_drive: boolean; driver_available: boolean }) {
  if (v.self_drive && v.driver_available) return 'Self-drive or driver';
  return v.driver_available ? 'With driver' : 'Self-drive';
}

export function VehicleCard({ v }: { v: VehicleSummary }) {
  const offer = offerLabel(v);
  const minHire = minHireLabel(v.min_days);
  const distance = formatDistance(v.distance_km);
  return (
    <Link href={{ pathname: '/vehicle/[id]', params: { id: v.id } }} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${v.title}, ${formatLKR(v.price_per_day)} per day, ${distance ?? ''}`}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
        <View>
          <VehiclePhoto path={v.cover_photo} seed={v.id} style={styles.photo} />
          {distance ? (
            <View style={[styles.pill, { left: 12, backgroundColor: colors.white }]}>
              <MapPin size={13} color={colors.primary} />
              <Text style={styles.pillText}>{distance}</Text>
            </View>
          ) : null}
          <View style={[styles.pill, { right: 12, backgroundColor: 'rgba(15, 23, 42, 0.8)' }]}>
            <Text style={[styles.pillText, { color: colors.white }]}>{hireModeLabel(v)}</Text>
          </View>
        </View>
        <View style={styles.info}>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title} numberOfLines={2}>
                {v.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {[v.year, v.town].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={styles.price}>{formatLKR(v.price_per_day)}</Text>
              <Text style={styles.per}>per day</Text>
              <RatingBadge avg={v.rating_avg} count={v.rating_count} />
            </View>
          </View>
          <View style={styles.tags}>
            <Tag icon={Users} label={`${v.seats} seats`} />
            {v.double_seat ? <Tag icon={Armchair} label="Double seat" /> : null}
            {v.has_ac ? <Tag icon={Snowflake} label="AC" /> : null}
            <Tag icon={Gauge} label={v.km_per_day ? `${v.km_per_day} km/day` : 'Unlimited km'} />
            {v.driver_available && v.driver_price_per_day != null ? (
              <Tag
                icon={User}
                label={
                  v.driver_price_per_day > 0
                    ? `Driver +${formatLKR(v.driver_price_per_day)}`
                    : 'Driver included'
                }
              />
            ) : null}
          </View>
          {minHire || offer ? (
            <View style={styles.tags}>
              {minHire ? <Tag icon={CalendarClock} label={minHire} tone="primary" /> : null}
              {offer ? <Tag icon={TagIcon} label={offer} tone="offer" /> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

// Placeholder shown while search results load.
export function VehicleCardSkeleton() {
  return (
    <View style={styles.card} accessibilityLabel="Loading">
      <Skeleton style={[styles.photo, { borderRadius: 0 }]} />
      <View style={styles.info}>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton style={{ height: 16, width: '70%' }} />
            <Skeleton style={{ height: 12, width: '40%' }} />
          </View>
          <Skeleton style={{ height: 20, width: 80 }} />
        </View>
        <View style={styles.tags}>
          <Skeleton style={{ height: 24, width: 72 }} />
          <Skeleton style={{ height: 24, width: 48 }} />
          <Skeleton style={{ height: 24, width: 90 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photo: { width: '100%', aspectRatio: 16 / 10 },
  pill: {
    position: 'absolute',
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 12, fontWeight: font.semibold, color: colors.ink },
  info: { padding: 14, gap: 10 },
  row: { flexDirection: 'row', gap: 12 },
  title: { fontSize: 16, fontWeight: font.semibold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2 },
  price: { fontSize: 17, fontWeight: font.bold, color: colors.ink },
  per: { fontSize: 12, color: colors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
