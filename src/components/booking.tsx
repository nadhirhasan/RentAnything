// Pieces shared by the booking screens (docs/SPEC.md §12).
import { router } from 'expo-router';
import { ChevronRight, CircleAlert, Star, Wallet, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui';
import { VehiclePhoto } from '@/components/vehicle';
import {
  CUSTOMER_TAGS,
  daysBetween,
  formatDay,
  formatDays,
  formatRange,
  isBookedDay,
  MONTH_NAMES,
  monthWeeks,
  overlapsBooked,
  stateLabel,
  tapDay,
  STATE_LABELS,
  type BookingRole,
  type BookingState,
  type DateRange,
  type RangePick,
  type Tone,
} from '@/lib/booking-rules';
import type { BookingListItem, CustomerSummary, MyDues } from '@/lib/bookings';
import { formatDateShort, formatLKR } from '@/lib/format';
import { colors, font, maxContentWidth, radius } from '@/theme';

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

// Month calendar for picking trip days, like booking.com: tap the first day,
// then the last day. Past, too-far and booked days can't be picked.
export function RangeCalendar({
  today,
  firstSelectable,
  lastSelectable,
  start,
  end,
  booked,
  onTap,
}: {
  today: string;
  firstSelectable: string;
  lastSelectable: string;
  start: string | null;
  end: string | null;
  booked: DateRange[];
  onTap: (day: string) => void;
}) {
  const [shown, setShown] = useState(3);
  const [y, m] = today.split('-').map(Number);
  const lastMonth = lastSelectable.slice(0, 7);
  const months = Array.from({ length: shown }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  }).filter(({ year, month }) => `${year}-${String(month + 1).padStart(2, '0')}` <= lastMonth);
  const canShowMore = months.length === shown;

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.weekRow}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <Text key={d} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      {months.map(({ year, month }) => (
        <View key={`${year}-${month}`} style={{ gap: 4 }}>
          <Text style={styles.monthTitle}>
            {MONTH_NAMES[month]} {year}
          </Text>
          {monthWeeks(year, month).map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((day, di) => {
                if (!day) return <View key={di} style={styles.cell} />;
                const taken = isBookedDay(day, booked);
                const disabled = day < firstSelectable || day > lastSelectable || taken;
                const isStart = day === start;
                const isEnd = day === end;
                const inRange = start != null && end != null && day > start && day < end;
                const edge = isStart || isEnd;
                return (
                  <View key={day} style={styles.cell}>
                    {/* Band behind the range */}
                    {start && end && start !== end && (inRange || edge) ? (
                      <View
                        style={[
                          styles.band,
                          isStart && { left: '50%' },
                          isEnd && { right: '50%' },
                        ]}
                      />
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${formatDay(day)}${taken ? ', booked' : ''}${isStart ? ', first day' : ''}${isEnd ? ', last day' : ''}`}
                      accessibilityState={{ disabled, selected: edge || inRange }}
                      disabled={disabled}
                      onPress={() => onTap(day)}
                      style={[styles.dayCircle, edge && { backgroundColor: colors.primary }]}>
                      <Text
                        style={[
                          styles.dayText,
                          day === today && !edge && { color: colors.primary, fontWeight: font.bold },
                          disabled && { color: colors.switchOff },
                          taken && { textDecorationLine: 'line-through' },
                          edge && { color: colors.white, fontWeight: font.bold },
                        ]}>
                        {Number(day.slice(8))}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ))}
      {canShowMore ? (
        <Pressable accessibilityRole="button" onPress={() => setShown((n) => n + 3)} style={{ alignSelf: 'center', padding: 8 }}>
          <Text style={styles.more}>Show more months</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Full-screen date picker (like booking.com): calendar + the chosen days
// and a Done button at the bottom.
export function DatesSheet({
  today,
  firstSelectable,
  lastSelectable,
  minDays,
  booked,
  initialStart,
  initialEnd,
  onDone,
  onClose,
}: {
  today: string;
  firstSelectable: string;
  lastSelectable: string;
  minDays: number;
  booked: DateRange[];
  initialStart: string | null;
  initialEnd: string | null;
  onDone: (start: string, end: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<RangePick>({ start: initialStart, end: initialEnd, picking: 'start' });
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(
    minDays > 1 ? { text: `This owner rents for at least ${formatDays(minDays)}.` } : null,
  );
  const tap = (day: string) => {
    const r = tapDay(range, day, minDays, booked);
    setRange(r.range);
    setMessage(r.message ? { text: r.message, error: r.error } : null);
  };
  const ready = range.start != null && range.end != null && !overlapsBooked(range.start, daysBetween(range.start, range.end), booked);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheetScreen, { paddingTop: insets.top }]}>
        <View style={styles.sheetHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
            <X size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.sheetTitle}>Select your trip days</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setRange({ start: null, end: null, picking: 'start' });
              setMessage(null);
            }}
            hitSlop={10}>
            <Text style={styles.more}>Clear</Text>
          </Pressable>
        </View>
        <Text style={styles.sheetHint}>
          Tap the first day, then the last day. You collect the vehicle on the evening before your first day and
          return it on the night of your last day.
        </Text>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          <RangeCalendar
            today={today}
            firstSelectable={firstSelectable}
            lastSelectable={lastSelectable}
            start={range.start}
            end={range.end}
            booked={booked}
            onTap={tap}
          />
        </ScrollView>
        <View style={[styles.sheetFooter, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
          {message ? (
            <Text style={[styles.sheetMessage, message.error && { color: colors.danger }]}>{message.text}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              {range.start && range.end ? (
                <>
                  <Text style={styles.title} numberOfLines={1}>
                    {range.start === range.end
                      ? formatDay(range.start)
                      : `${formatDay(range.start)} → ${formatDay(range.end)}`}
                  </Text>
                  <Text style={styles.sub}>{formatDays(daysBetween(range.start, range.end))}</Text>
                </>
              ) : (
                <Text style={styles.sub}>No days selected</Text>
              )}
            </View>
            <Button
              label="Done"
              disabled={!ready}
              onPress={() => range.start && range.end && onDone(range.start, range.end)}
              style={{ paddingHorizontal: 28 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// What an owner sees about a customer before accepting.
export function CustomerCard({ c, avatar }: { c: CustomerSummary; avatar?: string | null }) {
  const good = CUSTOMER_TAGS.filter((t) => t.good && c.tags[t.value]);
  const bad = CUSTOMER_TAGS.filter((t) => !t.good && c.tags[t.value]);
  const year = c.member_since ? c.member_since.slice(0, 4) : null;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={c.name} path={avatar} size={52} />
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
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: font.semibold, color: colors.muted },
  monthTitle: { fontSize: 15, fontWeight: font.bold, color: colors.ink, marginBottom: 4 },
  cell: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', top: 4, bottom: 4, left: 0, right: 0, backgroundColor: colors.primary100 },
  dayCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 15, fontWeight: font.medium, color: colors.ink },
  more: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  sheetScreen: { flex: 1, backgroundColor: colors.white },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: font.bold, color: colors.ink },
  sheetHint: { fontSize: 13, color: colors.text2, paddingHorizontal: 16, paddingBottom: 8 },
  sheetBody: { padding: 16, paddingTop: 4, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  sheetFooter: {
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  sheetMessage: { fontSize: 13, color: colors.text2 },
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
