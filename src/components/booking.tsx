// Pieces shared by the booking screens (docs/SPEC.md §12).
import { router } from 'expo-router';
import { ChevronRight, CircleAlert, Star, Wallet } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { VehiclePhoto } from '@/components/vehicle';
import {
  CUSTOMER_TAGS,
  dayLabel,
  formatDays,
  formatRange,
  isBookedDay,
  lastDay,
  stateLabel,
  STATE_LABELS,
  type BookingRole,
  type BookingState,
  type DateRange,
  type Tone,
} from '@/lib/booking-rules';
import type { BookingListItem, CustomerSummary, MyDues } from '@/lib/bookings';
import { formatDateShort, formatLKR } from '@/lib/format';
import { colors, font, radius } from '@/theme';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: colors.primary50, fg: colors.primary },
  success: { bg: colors.success50, fg: colors.success700 },
  warning: { bg: colors.offer50, fg: colors.offerText },
  danger: { bg: '#FEF2F2', fg: colors.danger },
  neutral: { bg: colors.background, fg: colors.text2 },
};

export function StatePill({ state, role }: { state: BookingState; role: BookingRole }) {
  const t = TONES[STATE_LABELS[state].tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{stateLabel(state, role)}</Text>
    </View>
  );
}

export function BookingCard({ item, role }: { item: BookingListItem; role: BookingRole }) {
  const total = item.agreed_total ?? item.estimate;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/booking/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <VehiclePhoto path={item.cover_photo} seed={item.listing_id} style={styles.thumb} fit="cover" iconSize={24} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <StatePill state={item.state} role={role} />
          {item.needs_action ? (
            <View style={styles.action}>
              <CircleAlert size={12} color={colors.danger} />
              <Text style={styles.actionText}>Action needed</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {formatRange(item.start_date, item.end_date)} · {formatDays(item.days)} · {formatLKR(total)}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {role === 'owner' ? 'Customer' : 'Owner'}: {item.other_name}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

// Horizontal list of days to pick the start date. Booked days can't be
// picked; the chosen days are highlighted.
export function DayStrip({
  days,
  start,
  length,
  booked,
  firstDay,
  onPick,
}: {
  days: string[];
  start: string | null;
  length: number;
  booked: DateRange[];
  firstDay: string | null; // earliest pickable day (vehicle's back-on date)
  onPick: (day: string) => void;
}) {
  const end = start ? lastDay(start, length) : null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 8, paddingVertical: 2, alignItems: 'flex-start' }}>
      {days.map((day) => {
        const taken = isBookedDay(day, booked) || (firstDay != null && day < firstDay);
        const inRange = start != null && day >= start && end != null && day <= end;
        const isStart = day === start;
        const l = dayLabel(day);
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={`${l.weekday} ${l.day} ${l.month}${taken ? ', not available' : ''}`}
            accessibilityState={{ selected: isStart, disabled: taken }}
            disabled={taken}
            onPress={() => onPick(day)}
            style={[
              styles.day,
              inRange && { backgroundColor: colors.primary50, borderColor: colors.primary100 },
              isStart && { backgroundColor: colors.primary, borderColor: colors.primary },
              taken && { opacity: 0.4 },
            ]}>
            <Text style={[styles.dayWeek, isStart && { color: colors.white }]}>{l.weekday}</Text>
            <Text
              style={[
                styles.dayNum,
                isStart && { color: colors.white },
                taken && { textDecorationLine: 'line-through' },
              ]}>
              {l.day}
            </Text>
            <Text style={[styles.dayWeek, isStart && { color: colors.white }]}>{l.month}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// What an owner sees about a customer before accepting.
export function CustomerCard({ c }: { c: CustomerSummary }) {
  const good = CUSTOMER_TAGS.filter((t) => t.good && c.tags[t.value]);
  const bad = CUSTOMER_TAGS.filter((t) => !t.good && c.tags[t.value]);
  const year = c.member_since ? c.member_since.slice(0, 4) : null;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{c.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{c.name}</Text>
          <Text style={styles.sub}>
            {year ? `On RentAnything since ${year}` : 'New on RentAnything'} ·{' '}
            {c.rentals ? `${c.rentals} rental${c.rentals === 1 ? '' : 's'}` : 'No rentals yet'}
          </Text>
        </View>
        {c.rating_avg != null ? (
          <View style={styles.rating}>
            <Star size={14} color="#F59E0B" fill="#F59E0B" />
            <Text style={styles.ratingText}>{Number(c.rating_avg).toFixed(1)}</Text>
            <Text style={styles.sub}>({c.rating_count})</Text>
          </View>
        ) : null}
      </View>
      {good.length || bad.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {good.map((t) => (
            <View key={t.value} style={[styles.tag, { backgroundColor: colors.success50 }]}>
              <Text style={[styles.tagText, { color: colors.success700 }]}>
                {t.label} · {c.tags[t.value]}
              </Text>
            </View>
          ))}
          {bad.map((t) => (
            <View key={t.value} style={[styles.tag, { backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.tagText, { color: colors.danger }]}>
                {t.label} · {c.tags[t.value]}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {c.no_shows || c.late_cancels ? (
        <Text style={[styles.sub, { color: colors.danger }]}>
          {[
            c.no_shows ? `Didn't turn up ${c.no_shows} time${c.no_shows === 1 ? '' : 's'}` : null,
            c.late_cancels ? `Cancelled ${c.late_cancels} accepted booking${c.late_cancels === 1 ? '' : 's'}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

// "You owe RentAnything ..." strip for owners, linking to the payments page.
export function DuesBanner({ dues }: { dues: MyDues | null }) {
  if (!dues || (dues.balance <= 0 && dues.pending <= 0)) return null;
  const owed = Math.max(0, dues.balance - dues.pending);
  const restricted = dues.restricted;
  const text = restricted
    ? `Your vehicles are hidden until you pay ${formatLKR(owed)}.`
    : owed > 0
      ? `You owe RentAnything ${formatLKR(owed)}${dues.due_by ? `. Pay by ${formatDateShort(dues.due_by)}` : ''}.`
      : `We're checking your payment of ${formatLKR(dues.pending)}.`;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/dues')}
      style={[
        styles.banner,
        restricted
          ? { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }
          : { backgroundColor: colors.offer50, borderColor: '#FDE68A' },
      ]}>
      <Wallet size={20} color={restricted ? colors.danger : colors.offerText} />
      <Text style={[styles.bannerText, { color: restricted ? colors.danger : colors.offerText }]}>{text}</Text>
      <Text style={[styles.bannerLink, { color: restricted ? colors.danger : colors.offerText }]}>
        {owed > 0 ? 'Pay' : 'View'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontSize: 12, fontWeight: font.semibold },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  title: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  actionText: { fontSize: 12, fontWeight: font.semibold, color: colors.danger },
  day: {
    width: 56,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  dayWeek: { fontSize: 11, fontWeight: font.medium, color: colors.text2 },
  dayNum: { fontSize: 18, fontWeight: font.bold, color: colors.ink },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: font.bold, color: colors.primary },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 15, fontWeight: font.bold, color: colors.ink },
  tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  tagText: { fontSize: 12, fontWeight: font.semibold },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: font.medium },
  bannerLink: { fontSize: 14, fontWeight: font.bold, textDecorationLine: 'underline' },
});
