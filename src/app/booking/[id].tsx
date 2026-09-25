import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  CalendarX,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Coins,
  KeyRound,
  MessageCircle,
  Phone,
  Share2,
  ShieldCheck,
  Star,
} from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomerCard, DuesBanner, StatePill } from '@/components/booking';
import { useFeedback } from '@/components/feedback';
import { EmptyState, Screen, SignInPrompt } from '@/components/layout';
import { RATING_WORDS, StarInput } from '@/components/reviews';
import { OptionSheet } from '@/components/sheet';
import { Avatar } from '@/components/avatar';
import { Button, Chip, Divider, Field, KeyValue, Notice, RoundIconButton, Section, Skeleton, Wrap } from '@/components/ui';
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth } from '@/lib/auth';
import { HELP } from '@/lib/help';
import {
  CANCEL_REASONS,
  CUSTOMER_TAGS,
  DECLINE_REASONS,
  formatDay,
  formatDays,
  formatRange,
  handover,
  isValidHandoverCode,
  NO_DEAL_REASONS,
  reasonLabel,
  recordNumber,
  rentalRecordText,
  stateHint,
  type CustomerTag,
  type Reason,
  type RentalRecord,
} from '@/lib/booking-rules';
import {
  cancelBooking,
  confirmOutcome,
  feeRules,
  getBooking,
  getMyDues,
  markNoDeal,
  rateCustomer,
  respondBooking,
  startBooking,
  type BookingDetail,
  type MyDues,
} from '@/lib/bookings';
import { openBookingChat } from '@/lib/chat';
import { formatCoins, rentalFee, toCoins } from '@/lib/coins';
import { colomboDate, formatAmountInput, formatDateShort, formatLKR, parseAmount, telUrl, whatsappUrl } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { colors, font, maxContentWidth, radius } from '@/theme';

type SheetKind = 'decline' | 'cancel' | 'no_deal' | null;

export default function BookingScreen() {
  const { id, sent } = useLocalSearchParams<{ id: string; sent?: string }>();
  const { session, profile } = useAuth();
  const { toast, confirm } = useFeedback();

  const [data, setData] = useState<{ b: BookingDetail | null; dues: MyDues | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const b = await getBooking(id);
      const dues = b?.role === 'owner' ? await getMyDues().catch(() => null) : null;
      setData({ b, dues });
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRefreshing(false);
    }
  }, [id, session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/bookings'));

  if (!session) {
    return (
      <Screen>
        <TopBar onBack={goBack} />
        <SignInPrompt title="Sign in to see this booking" text="Bookings are only shown to the customer and the owner." />
      </Screen>
    );
  }

  const b = data?.b?.id === id ? data.b : null;

  if (!b) {
    return (
      <Screen>
        <TopBar onBack={goBack} />
        {error || data ? (
          <EmptyState
            icon={CalendarX}
            title="Booking not found"
            text={error ?? 'It may have been removed.'}
            action={<Button label="Try again" onPress={load} />}
          />
        ) : (
          <View style={{ padding: 16, gap: 12 }}>
            <Skeleton style={{ height: 120, borderRadius: radius.lg }} />
            <Skeleton style={{ height: 200, borderRadius: radius.lg }} />
          </View>
        )}
      </Screen>
    );
  }

  const owner = b.role === 'owner';
  const today = colomboDate();

  const act = async (key: string, run: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await run();
      toast(message);
      await load();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const openChat = async () => {
    setBusy('chat');
    try {
      const chatId = await openBookingChat(b.id);
      router.push({ pathname: '/chat/[id]', params: { id: chatId } });
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const sheetReasons: Reason[] =
    sheet === 'decline'
      ? DECLINE_REASONS
      : sheet === 'cancel'
        ? CANCEL_REASONS[b.role]
        : sheet === 'no_deal'
          ? NO_DEAL_REASONS[b.role]
          : [];

  const onReason = (reason: string | null) => {
    if (!reason) return;
    if (sheet === 'decline') act('decline', () => respondBooking(b.id, false, reason), 'Request declined');
    if (sheet === 'cancel') act('cancel', () => cancelBooking(b.id, reason), 'Booking cancelled');
    if (sheet === 'no_deal') act('no_deal', () => markNoDeal(b.id, reason), 'Marked as no deal');
  };

  const closeNote = [
    reasonLabel(b.close_reason),
    b.closed_by && b.state !== 'expired' ? `(${b.closed_by === 'owner' ? 'owner' : b.closed_by === 'customer' ? 'customer' : 'RentAnything'})` : null,
  ]
    .filter(Boolean)
    .join(' ');

  // Customer: "Did you rent it?" after the start date, or after the owner ended it.
  const askOutcome =
    !owner &&
    b.customer_says_rented == null &&
    ((b.state === 'accepted' && b.start_date <= today) ||
      ((b.state === 'no_deal' || b.state === 'cancelled') && b.closed_by === 'owner'));

  return (
    <Screen>
      <TopBar onBack={goBack} title={!owner ? 'Your booking' : b.state === 'requested' ? 'Booking request' : 'Booking'} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }>
        {sent && b.state === 'requested' && !owner ? (
          <View style={styles.sent}>
            <CircleCheck size={22} color={colors.success700} />
            <Text style={styles.sentText}>Request sent! We&apos;ll show the owner&apos;s answer here.</Text>
          </View>
        ) : null}

        <Section style={{ gap: 10 }}>
          <StatePill state={b.state} role={b.role} />
          <Text style={styles.hint}>{stateHint(b.state, b.role)}</Text>
          {closeNote && ['declined', 'cancelled', 'no_deal'].includes(b.state) ? (
            <Text style={styles.sub}>
              Reason: {closeNote}
              {b.close_note ? ` — “${b.close_note}”` : ''}
            </Text>
          ) : null}
          {b.dispute === 'open' ? (
            <Notice icon={CircleAlert} text="RentAnything is checking what happened with this booking." />
          ) : null}
        </Section>

        {owner && data?.dues ? (
          <View style={{ paddingHorizontal: 16 }}>
            <DuesBanner dues={data.dues} />
          </View>
        ) : null}

        {/* Customer: handover code */}
        {!owner && b.state === 'accepted' && b.handover_code ? (
          <Section title="Your handover code" help={HELP.handoverCode}>
            <View style={styles.codeBox}>
              <KeyRound size={22} color={colors.primary} />
              <Text style={styles.code} selectable accessibilityLabel={`Code ${b.handover_code.split('').join(' ')}`}>
                {b.handover_code}
              </Text>
            </View>
            <Text style={styles.body}>
              Show this code to the owner <Text style={{ fontWeight: font.bold }}>only after</Text> you&apos;ve checked
              the vehicle and agreed the price. The owner enters it to start the rental. Then pay the owner in cash.
            </Text>
            <Notice
              icon={ShieldCheck}
              text="Protected rental: when the owner enters your code, you both get a rental record, your review shows “Verified hire”, and RentAnything helps if something goes wrong (for example, the deposit is not returned). If the owner says “no need for the code”, ask them to enter it."
            />
          </Section>
        ) : null}

        {/* Owner: why the code is worth entering */}
        {owner && b.state === 'accepted' ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Notice
              icon={ShieldCheck}
              text="Start with the customer’s code and you get: a rental record with the customer’s details, a verified rental (you show higher in search), and RentAnything’s help if the customer causes trouble."
              help={HELP.rewards}
            />
          </View>
        ) : null}

        {/* Rental record: started with the code */}
        {b.started_at && !b.dispute && b.agreed_total != null ? (
          <RentalRecordCard b={b} myName={profile?.full_name || session?.user.email || 'You'} owner={owner} />
        ) : null}

        {askOutcome ? (
          <OutcomeCard
            b={b}
            busy={busy}
            onAnswer={(rented) =>
              act(
                'outcome',
                () => confirmOutcome(b.id, rented),
                rented ? "Thanks, we'll check it with the owner" : 'Thanks for letting us know',
              )
            }
            confirm={confirm}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: b.listing_id } })}
          style={styles.vehicle}>
          <VehiclePhoto path={b.cover_photo} seed={b.listing_id} style={styles.thumb} fit="cover" iconSize={24} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title} numberOfLines={2}>
              {b.title}
            </Text>
            <Text style={styles.sub}>{b.town}</Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </Pressable>

        <Section title="Trip" help={HELP.nightToNight}>
          <KeyValue label="Collect" value={handover(b.start_date, b.days, b.pickup).collect} />
          <KeyValue label="Return" value={handover(b.start_date, b.days, b.pickup).back} />
          <KeyValue
            label="Days"
            value={formatDays(b.days)}
            sub={b.days > 1 ? formatRange(b.start_date, b.end_date) : formatDay(b.start_date)}
          />
          <KeyValue label="Driver" value={b.with_driver ? 'With driver' : 'Self-drive'} />
          <Divider />
          {b.agreed_total != null ? (
            <KeyValue label="Agreed price" help={HELP.agreedPrice} value={formatLKR(b.agreed_total)} sub="Paid to the owner in cash" />
          ) : (
            <KeyValue label="Estimated price" help={HELP.estimate} value={formatLKR(b.estimate)} sub="Final price agreed at pickup" />
          )}
          {owner && b.commission != null ? (
            <KeyValue
              label="RentAnything fee"
              help={HELP.fee}
              value={b.commission === 0 ? 'Free' : formatCoins(toCoins(b.commission, data?.dues?.coin_value || 10))}
              sub={b.commission === 0 ? 'A free rental for you' : `${formatLKR(b.commission)} · from your coins`}
            />
          ) : null}
          {b.note ? (
            <View style={styles.quote}>
              <Text style={styles.quoteLabel}>{owner ? 'Message from the customer' : 'Your message'}</Text>
              <Text style={styles.body}>{b.note}</Text>
            </View>
          ) : null}
        </Section>

        {/* The other person */}
        <Section title={owner ? 'Customer' : 'Owner'}>
          {owner && b.customer ? (
            <CustomerCard c={b.customer} avatar={b.other_avatar} />
          ) : (
            <View style={[styles.row, { alignItems: 'center', gap: 12 }]}>
              <Avatar name={b.other_name} path={b.other_avatar} size={52} />
              <Text style={[styles.title, { flex: 1 }]}>{b.other_name}</Text>
            </View>
          )}
          {b.other_phone ? (
            <>
              <Text style={styles.sub} selectable>
                {owner ? "Customer's" : "Owner's"} number: {b.other_phone}
              </Text>
              <View style={styles.row}>
                <Button
                  label="WhatsApp"
                  kind="whatsapp"
                  size="sm"
                  icon={MessageCircle}
                  style={{ flex: 1 }}
                  onPress={() =>
                    Linking.openURL(
                      whatsappUrl(
                        b.other_whatsapp ?? b.other_phone!,
                        owner
                          ? `Hi, this is the owner of the ${b.title} you booked on RentAnything (${formatRange(b.start_date, b.end_date)}).`
                          : `Hi, I booked your ${b.title} on RentAnything (${formatRange(b.start_date, b.end_date)}).`,
                      ),
                    ).catch(() => {})
                  }
                />
                <Button
                  label="Call"
                  size="sm"
                  icon={Phone}
                  style={{ flex: 1 }}
                  onPress={() => Linking.openURL(telUrl(b.other_phone!)).catch(() => {})}
                />
              </View>
            </>
          ) : b.state === 'requested' ? (
            <Text style={styles.sub}>Phone numbers are shared when the owner accepts.</Text>
          ) : null}
          {/* The action bar already has this button while a request waits. */}
          {!owner && b.state === 'requested' ? null : (
            <Button
              label={owner ? 'Message the customer' : 'Message the owner'}
              kind="soft"
              size="sm"
              icon={MessageCircle}
              loading={busy === 'chat'}
              onPress={openChat}
            />
          )}
        </Section>

        {/* Owner: rate the customer */}
        {owner &&
        (b.state === 'started' || b.state === 'completed' || (b.state === 'no_deal' && b.close_reason === 'customer_no_show')) ? (
          <RateCustomer b={b} onSaved={load} />
        ) : null}

        {/* Customer: review after the rental */}
        {!owner && (b.state === 'started' || b.state === 'completed') && !b.reviewed ? (
          <Section title="How was it?">
            <Text style={styles.sub}>Your review helps other customers. It shows as a verified hire.</Text>
            <Button
              label="Review this vehicle"
              kind="soft"
              icon={Star}
              onPress={() => router.push({ pathname: '/review/[id]', params: { id: b.listing_id } })}
            />
          </Section>
        ) : null}

        <Section title="History">
          <TimelineRow label="Requested" at={b.created_at} />
          {b.responded_at && b.state !== 'declined' && b.close_reason !== 'dates_taken' ? (
            <TimelineRow label="Accepted" at={b.responded_at} />
          ) : null}
          {b.started_at ? <TimelineRow label="Rental started" at={b.started_at} /> : null}
          {b.closed_at ? (
            <TimelineRow
              label={b.state === 'declined' ? 'Declined' : b.state === 'cancelled' ? 'Cancelled' : 'Closed'}
              at={b.closed_at}
            />
          ) : null}
        </Section>

        {/* Secondary actions */}
        <View style={styles.links}>
          {b.state === 'accepted' ? (
            <>
              <LinkButton label="No deal: it's not going ahead" onPress={() => setSheet('no_deal')} />
              <LinkButton label="Cancel booking" onPress={() => setSheet('cancel')} />
            </>
          ) : null}
          {!owner && b.state === 'requested' ? (
            <LinkButton label="Cancel request" onPress={() => setSheet('cancel')} />
          ) : null}
        </View>
      </ScrollView>

      {/* Main action bar */}
      <ActionBar>
        {owner && b.state === 'requested' ? (
          <View style={styles.row}>
            <Button
              label="Decline"
              kind="ghost"
              style={{ flex: 1 }}
              loading={busy === 'decline'}
              onPress={() => setSheet('decline')}
            />
            <Button
              label="Accept"
              style={{ flex: 2 }}
              loading={busy === 'accept'}
              onPress={() => act('accept', () => respondBooking(b.id, true), 'Accepted. Call the customer to arrange pickup.')}
            />
          </View>
        ) : owner && b.state === 'accepted' ? (
          <Button label="Start rental: enter code" icon={KeyRound} onPress={() => setStarting(true)} />
        ) : !owner && b.state === 'requested' ? (
          <Button label="Message the owner" kind="soft" icon={MessageCircle} loading={busy === 'chat'} onPress={openChat} />
        ) : !owner && (b.state === 'declined' || b.state === 'expired' || b.state === 'cancelled' || b.state === 'no_deal') ? (
          <Button label="Find another vehicle" kind="soft" onPress={() => router.replace('/')} />
        ) : owner && (b.state === 'started' || b.state === 'completed') ? (
          <Button label="My coins" kind="soft" icon={Coins} onPress={() => router.push('/dues')} />
        ) : null}
      </ActionBar>

      <OptionSheet<string | null>
        visible={sheet != null}
        title={
          sheet === 'decline'
            ? 'Why are you declining?'
            : sheet === 'cancel'
              ? 'Why are you cancelling?'
              : "What happened?"
        }
        options={sheetReasons.map((r) => ({ value: r.value, label: r.label }))}
        value={null}
        onSelect={onReason}
        onClose={() => setSheet(null)}
      />

      {owner && b.state === 'accepted' ? (
        <StartSheet
          visible={starting}
          b={b}
          dues={data?.dues ?? null}
          onClose={() => setStarting(false)}
          onStarted={() => {
            setStarting(false);
            toast('Rental started');
            load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function TopBar({ onBack, title = 'Booking' }: { onBack: () => void; title?: string }) {
  return (
    <View style={styles.top}>
      <RoundIconButton icon={ChevronLeft} label="Back" onPress={onBack} background="transparent" size={40} />
      <Text style={styles.topTitle}>{title}</Text>
    </View>
  );
}

function ActionBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  if (!children) return null;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
      <View style={styles.barInner}>{children}</View>
    </View>
  );
}

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ paddingVertical: 10 }}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

function TimelineRow({ label, at }: { label: string; at: string }) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <Text style={styles.sub}>{label}</Text>
      <Text style={styles.sub}>{formatDateShort(at.slice(0, 10))}</Text>
    </View>
  );
}

function OutcomeCard({
  b,
  busy,
  onAnswer,
  confirm,
}: {
  b: BookingDetail;
  busy: string | null;
  onAnswer: (rented: boolean) => void;
  confirm: ReturnType<typeof useFeedback>['confirm'];
}) {
  const [haveIt, setHaveIt] = useState(false);
  const endedByOwner = b.state !== 'accepted';

  const reportRented = async () => {
    const ok = await confirm({
      title: 'Tell RentAnything you rented it?',
      message: "We'll check with the owner. Only do this if you really picked up the vehicle.",
      confirmLabel: 'Yes, I rented it',
    });
    if (ok) onAnswer(true);
  };

  return (
    <Section title={endedByOwner ? 'Did you end up renting it?' : 'Did you get the vehicle?'}>
      {haveIt && !endedByOwner ? (
        <>
          <Notice
            icon={KeyRound}
            text={`Great! Ask the owner to enter your code ${b.handover_code ?? ''} in the app to start the rental.`}
          />
          <LinkButton label="The owner won't enter the code" onPress={reportRented} />
        </>
      ) : (
        <>
          <Text style={styles.sub}>
            {endedByOwner
              ? 'The owner closed this booking. If you rented the vehicle anyway, let us know.'
              : 'Your pickup day has come. Let us know how it went.'}
          </Text>
          <View style={styles.row}>
            <Button
              label={endedByOwner ? 'Yes, I rented it' : 'Yes, I have it'}
              kind="soft"
              size="sm"
              style={{ flex: 1 }}
              onPress={() => (endedByOwner ? reportRented() : setHaveIt(true))}
            />
            <Button
              label="No"
              kind="ghost"
              size="sm"
              style={{ flex: 1 }}
              loading={busy === 'outcome'}
              onPress={() => onAnswer(false)}
            />
          </View>
        </>
      )}
    </Section>
  );
}

function RateCustomer({ b, onSaved }: { b: BookingDetail; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [rating, setRating] = useState(b.my_customer_rating?.rating ?? 0);
  const [tags, setTags] = useState<CustomerTag[]>(b.my_customer_rating?.tags ?? []);
  const [editing, setEditing] = useState(!b.my_customer_rating);
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <Section title="Your rating of the customer">
        <View style={styles.row}>
          <StarInput value={rating} onChange={() => {}} size={20} label="Your rating" />
          <Text style={styles.sub}>{RATING_WORDS[rating]}</Text>
        </View>
        <LinkButton label="Change" onPress={() => setEditing(true)} />
      </Section>
    );
  }

  const save = async () => {
    setBusy(true);
    try {
      await rateCustomer(b.id, rating, tags);
      toast('Thanks! This helps other owners.');
      setEditing(false);
      onSaved();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Rate the customer">
      <Text style={styles.sub}>Only other owners see this, when this customer asks to book.</Text>
      <View style={styles.row}>
        <StarInput value={rating} onChange={setRating} size={32} label="Customer rating" />
        {rating ? <Text style={styles.sub}>{RATING_WORDS[rating]}</Text> : null}
      </View>
      <Wrap>
        {CUSTOMER_TAGS.map((t) => (
          <Chip
            key={t.value}
            label={t.label}
            selected={tags.includes(t.value)}
            onPress={() => setTags((prev) => (prev.includes(t.value) ? prev.filter((x) => x !== t.value) : [...prev, t.value]))}
          />
        ))}
      </Wrap>
      <Button label="Save rating" onPress={save} loading={busy} disabled={!rating} />
    </Section>
  );
}

// Owner enters the customer's code and the agreed price.
function StartSheet({
  visible,
  b,
  dues,
  onClose,
  onStarted,
}: {
  visible: boolean;
  dues: MyDues | null;
  b: BookingDetail;
  onClose: () => void;
  onStarted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState(formatAmountInput(String(b.estimate)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = parseAmount(amount);
  // Same maths as the database: free first rentals, the cap, whole coins.
  const rules = dues ? feeRules(dues, b.commission_percent) : null;
  const fee = total != null && rules ? rentalFee(total, rules) : null;
  const coinValue = dues?.coin_value || 10;

  const submit = async () => {
    if (!isValidHandoverCode(code)) {
      setError('Enter the 4-digit code from the customer.');
      return;
    }
    if (total == null || total <= 0) {
      setError('Enter the price you agreed with the customer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await startBooking(b.id, code, total);
      if (r === 'ok') {
        setCode('');
        onStarted();
      } else if (r === 'wrong_code') {
        setError("That code isn't right. Check it with the customer.");
      } else {
        setError('Too many wrong codes. Please try again in 15 minutes.');
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
          <Pressable onPress={() => {}} style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Start the rental</Text>
            <Text style={styles.sub}>
              When you&apos;ve both agreed, ask the customer for their 4-digit code. Take the cash payment as usual.
            </Text>
            <Field
              label="Customer's code"
              help={HELP.handoverCode}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              placeholder="0000"
              maxLength={4}
              autoFocus
              style={{ alignSelf: 'stretch' }}
            />
            <Field
              label="Agreed price"
              help={HELP.agreedPrice}
              prefix="Rs"
              value={amount}
              onChangeText={(t) => setAmount(formatAmountInput(t))}
              keyboardType="number-pad"
              hint={
                fee == null
                  ? undefined
                  : rules && rules.freeLeft > 0
                    ? `Free rental: no fee (${rules.freeLeft} free left). It still counts as a verified rental.`
                    : `RentAnything fee: ${formatCoins(toCoins(fee, coinValue))} (${formatLKR(fee)}). It also counts as a verified rental.`
              }
            />
            {error ? <Notice icon={CircleAlert} tone="danger" text={error} /> : null}
            <Button label="Start rental" onPress={submit} loading={busy} />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RentalRecordCard({ b, myName, owner }: { b: BookingDetail; myName: string; owner: boolean }) {
  const times = handover(b.start_date, b.days, b.pickup);
  const startedAt = new Date(b.started_at!).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const record: RentalRecord = {
    bookingId: b.id,
    vehicle: b.title,
    owner: owner ? myName : b.other_name,
    customer: owner ? b.other_name : myName,
    customerPhone: owner ? b.other_phone : null,
    collect: times.collect,
    back: times.back,
    days: b.days,
    agreedTotal: b.agreed_total ?? b.estimate,
    startedAt,
  };
  return (
    <Section title="Rental record" help={HELP.rentalRecord}>
      <View style={styles.record}>
        <View style={styles.row}>
          <ShieldCheck size={20} color={colors.success700} />
          <Text style={styles.recordNo}>{recordNumber(b.id)}</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.recordTag}>Started with the code</Text>
        </View>
        <KeyValue label="Vehicle" value={record.vehicle} />
        <KeyValue label="Owner" value={record.owner} />
        <KeyValue label="Customer" value={record.customer} sub={record.customerPhone ?? undefined} />
        <KeyValue label="Agreed price" value={formatLKR(record.agreedTotal)} />
        <KeyValue label="Started" value={startedAt} />
      </View>
      <Button
        label="Share record"
        kind="ghost"
        size="sm"
        icon={Share2}
        onPress={() => Share.share({ message: rentalRecordText(record, formatLKR) }).catch(() => {})}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  record: { gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  recordNo: { fontSize: 16, fontWeight: font.bold, color: colors.ink, letterSpacing: 0.5 },
  recordTag: { fontSize: 12, fontWeight: font.semibold, color: colors.success700 },
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
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: colors.success50,
  },
  sentText: { flex: 1, fontSize: 14, fontWeight: font.semibold, color: colors.success700 },
  hint: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: colors.white },
  thumb: { width: 56, height: 56, borderRadius: radius.md },
  title: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quote: { gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: colors.background },
  quoteLabel: { fontSize: 12, fontWeight: font.semibold, color: colors.muted },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.primary50,
    borderWidth: 1,
    borderColor: colors.primary100,
  },
  code: { fontSize: 36, fontWeight: font.bold, color: colors.primary, letterSpacing: 10 },
  links: { alignItems: 'center', paddingVertical: 4 },
  link: { fontSize: 14, color: colors.text2, textDecorationLine: 'underline' },
  bar: {
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  barInner: { gap: 10, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    gap: 14,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  sheetTitle: { fontSize: 18, fontWeight: font.bold, color: colors.ink },
});
