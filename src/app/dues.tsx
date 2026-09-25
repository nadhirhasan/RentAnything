import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, CircleAlert, CircleCheck, Clock, Coins, Gift, MessageCircle, ShieldCheck, Wallet } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFeedback } from '@/components/feedback';
import { EmptyState, Screen, SignInPrompt } from '@/components/layout';
import {
  Button,
  Chip,
  Divider,
  Field,
  InfoTip,
  Notice,
  RoundIconButton,
  Section,
  Skeleton,
  Wrap,
} from '@/components/ui';
import { HELP } from '@/lib/help';
import { useAuth } from '@/lib/auth';
import { feeRules, getMyDues, PAYMENT_METHODS, reportDuesPayment, type MyDues, type PaymentMethod } from '@/lib/bookings';
import { formatCoins, freeRentalsLeft, ownerBadge, rentalFee, toCoins, topUpPacks, walletCoins } from '@/lib/coins';
import { formatDateShort, formatLKR } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { contactSupport, hasSupport } from '@/lib/support';
import { colors, font, maxContentWidth, radius } from '@/theme';

// Owner's coin wallet: fees from rentals, coins bought, rewards, and how to
// buy coins (docs/SPEC.md §12, §16).
export default function DuesScreen() {
  const { session } = useAuth();
  const [dues, setDues] = useState<MyDues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setDues(await getMyDues());
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  if (!session) {
    return (
      <Screen>
        <TopBar onBack={goBack} />
        <SignInPrompt title="RentAnything coins" text="Sign in to see your coins." />
      </Screen>
    );
  }

  if (!dues) {
    return (
      <Screen>
        <TopBar onBack={goBack} />
        {error ? (
          <EmptyState icon={Wallet} title="Couldn't load" text={error} action={<Button label="Try again" onPress={load} />} />
        ) : (
          <View style={{ padding: 16, gap: 12 }}>
            <Skeleton style={{ height: 140, borderRadius: radius.lg }} />
            <Skeleton style={{ height: 200, borderRadius: radius.lg }} />
          </View>
        )}
      </Screen>
    );
  }

  const coinValue = dues.coin_value || 10;
  const owed = Math.max(0, dues.balance - dues.pending);
  const wallet = walletCoins(dues.balance, coinValue);
  const pendingPayment = dues.payments.find((p) => p.status === 'pending');
  const freeLeft = freeRentalsLeft(dues.free_rentals, dues.verified_rentals);
  const badge = ownerBadge(dues.verified_rentals);
  const coins = (rupees: number) => formatCoins(toCoins(rupees, coinValue));

  return (
    <Screen>
      <TopBar onBack={goBack} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }>
          <View style={[styles.wallet, dues.restricted && { backgroundColor: colors.danger }]}>
            <View style={styles.row}>
              <Coins size={20} color={colors.white} />
              <Text style={styles.walletLabel}>Your coins</Text>
              <View style={{ flex: 1 }} />
              <InfoTip help={HELP.balance} size={18} />
            </View>
            <Text style={styles.walletAmount} accessibilityLabel={`Your coins: ${formatCoins(wallet)}`}>
              {formatCoins(wallet)}
            </Text>
            <Text style={styles.walletSub}>
              {wallet < 0
                ? `You owe ${formatLKR(Math.max(0, dues.balance))}`
                : wallet > 0
                  ? 'Paid in advance. Fees come out of these coins.'
                  : 'All paid up. Thank you!'}
              {'  ·  '}1 coin = {formatLKR(coinValue)}
            </Text>
          </View>

          <Section style={{ gap: 10 }}>
            {dues.restricted ? (
              <Notice
                icon={CircleAlert}
                tone="danger"
                text={
                  dues.restricted_reason === 'limit'
                    ? `You owe ${coins(dues.dues_limit)} or more, so your vehicles are hidden from search and you can't accept bookings. Buy coins to bring them back.`
                    : `Some coins are owed for more than ${dues.dues_days} days, so your vehicles are hidden from search. Buy coins to bring them back.`
                }
              />
            ) : owed > 0 ? (
              <Text style={styles.sub}>
                {dues.due_by ? `Please buy coins by ${formatDateShort(dues.due_by)}` : 'Please buy coins soon'}, and
                before you owe {coins(dues.dues_limit)}, to keep your vehicles in search.
              </Text>
            ) : (
              <View style={styles.row}>
                <CircleCheck size={18} color={colors.success700} />
                <Text style={[styles.sub, { color: colors.success700, flex: 1 }]}>
                  Your vehicles are showing in search.
                </Text>
              </View>
            )}
            {pendingPayment ? (
              <View style={styles.row}>
                <Clock size={16} color={colors.offerText} />
                <Text style={[styles.sub, { color: colors.offerText, flex: 1 }]}>
                  We&apos;re checking your payment of {formatLKR(pendingPayment.amount)} (
                  {coins(pendingPayment.amount)}). Your vehicles stay visible meanwhile.
                </Text>
              </View>
            ) : null}
          </Section>

          <Section title="Your rewards" help={HELP.rewards}>
            <View style={styles.reward}>
              <View style={[styles.rewardIcon, { backgroundColor: colors.offer50 }]}>
                <Gift size={20} color={colors.offerText} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.entryTitle}>
                  {freeLeft > 0
                    ? `${freeLeft} free rental${freeLeft === 1 ? '' : 's'} left`
                    : `Your ${dues.free_rentals} free rentals are used`}
                </Text>
                {dues.free_rentals > 0 ? (
                  <View style={styles.dots}>
                    {Array.from({ length: dues.free_rentals }, (_, i) => (
                      <View
                        key={i}
                        style={[styles.dot, i < dues.verified_rentals && { backgroundColor: colors.offerText }]}
                      />
                    ))}
                  </View>
                ) : null}
                <Text style={styles.sub}>
                  {freeLeft > 0
                    ? 'No fee on these. Start them with the customer’s code to use them.'
                    : `Now ${dues.commission_percent}% of the agreed price${dues.fee_cap > 0 ? `, never more than ${coins(dues.fee_cap)} per rental` : ''}.`}
                </Text>
              </View>
            </View>
            <View style={styles.reward}>
              <View style={[styles.rewardIcon, { backgroundColor: colors.success50 }]}>
                <ShieldCheck size={20} color={colors.success700} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.entryTitle}>{badge ? badge.label : 'No verified rentals yet'}</Text>
                <Text style={styles.sub}>
                  {badge?.top
                    ? 'You have the Top owner badge. Customers see it and you show higher in search.'
                    : `Each rental you start with the code counts. More verified rentals = higher in search.${
                        dues.verified_rentals < 10 ? ` ${10 - dues.verified_rentals} more for the Top owner badge.` : ''
                      }`}
                </Text>
              </View>
            </View>
          </Section>

          <Section title="How it works" help={HELP.fee}>
            <Text style={styles.body}>
              Customers pay you in cash. When you start a rental with the customer&apos;s code, its fee comes out of
              your coins: {dues.commission_percent}% of the agreed price
              {dues.fee_cap > 0 ? `, at most ${coins(dues.fee_cap)}` : ''}. Example: a Rs 40,000 rental costs{' '}
              {coins(rentalFee(40000, { ...feeRules(dues), freeLeft: 0 }))}.
            </Text>
          </Section>

          {!pendingPayment ? (
            <BuyCoins dues={dues} owedCoins={Math.max(0, -wallet)} onDone={load} />
          ) : null}

          <Section title="History">
            {dues.entries.length === 0 && dues.payments.length === 0 ? (
              <Text style={styles.sub}>Nothing yet. Rentals and coin purchases appear here.</Text>
            ) : null}
            {dues.payments
              .filter((p) => p.status !== 'approved')
              .map((p) => (
                <View key={`p${p.id}`} style={styles.entry}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.entryTitle}>
                      Coins bought · {PAYMENT_METHODS.find((m) => m.value === p.method)?.label}
                    </Text>
                    <Text style={styles.sub}>
                      {formatDateShort(p.created_at.slice(0, 10))} · {formatLKR(p.amount)}
                      {p.reference ? ` · ${p.reference}` : ''}
                      {p.status === 'pending' ? ' · Checking' : ' · Not received'}
                      {p.admin_note ? ` — ${p.admin_note}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.entryAmount, { color: p.status === 'rejected' ? colors.danger : colors.text2 }]}>
                    +{coins(p.amount)}
                  </Text>
                </View>
              ))}
            {dues.entries.map((e, i) => (
              <View key={e.id}>
                {i > 0 || dues.payments.some((p) => p.status !== 'approved') ? <Divider /> : null}
                <View style={styles.entry}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.entryTitle}>
                      {e.kind === 'commission' ? 'Rental fee' : e.kind === 'payment' ? 'Coins bought' : 'Adjustment'}
                    </Text>
                    <Text style={styles.sub}>
                      {formatDateShort(e.created_at.slice(0, 10))}
                      {e.note ? ` · ${e.note}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.entryAmount, { color: e.amount < 0 ? colors.success700 : colors.ink }]}>
                    {e.amount < 0 ? '+' : '−'}
                    {coins(Math.abs(e.amount))}
                  </Text>
                </View>
              </View>
            ))}
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// Pick a coin pack, pay outside the app, then tell us here.
function BuyCoins({ dues, owedCoins, onDone }: { dues: MyDues; owedCoins: number; onDone: () => void }) {
  const { toast } = useFeedback();
  const coinValue = dues.coin_value || 10;
  const packs = topUpPacks(owedCoins);
  const [pack, setPack] = useState(packs[0]);
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = pack * coinValue;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await reportDuesPayment(amount, method, reference);
      toast("Thanks! We'll add your coins after we check the payment.");
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={owedCoins > 0 ? 'Buy coins to pay what you owe' : 'Buy coins in advance'}>
      <Text style={styles.fieldLabel}>1. Choose coins</Text>
      <Wrap>
        {packs.map((p) => (
          <Chip
            key={p}
            label={`${p.toLocaleString('en-US')} coins · ${formatLKR(p * coinValue)}`}
            selected={pack === p}
            onPress={() => setPack(p)}
          />
        ))}
      </Wrap>
      <Text style={styles.fieldLabel}>2. Pay {formatLKR(amount)} to RentAnything</Text>
      {dues.payment_details ? (
        <View style={styles.details}>
          <Text style={styles.body} selectable>
            {dues.payment_details}
          </Text>
        </View>
      ) : (
        <Text style={styles.sub}>Contact us for the payment details.</Text>
      )}
      {hasSupport ? (
        <Button
          label="Ask support on WhatsApp"
          kind="ghost"
          size="sm"
          icon={MessageCircle}
          onPress={() => contactSupport(`Hi RentAnything, I want to buy ${pack} coins (${formatLKR(amount)}).`)}
        />
      ) : null}
      <Text style={styles.fieldLabel}>3. Tell us how you paid</Text>
      <Wrap>
        {PAYMENT_METHODS.map((m) => (
          <Chip key={m.value} label={m.label} selected={method === m.value} onPress={() => setMethod(m.value)} />
        ))}
      </Wrap>
      <Field
        label="Reference (optional)"
        value={reference}
        onChangeText={setReference}
        maxLength={100}
        placeholder="e.g. transaction ID or your name on the transfer"
      />
      {error ? <Notice icon={CircleAlert} tone="danger" text={error} /> : null}
      <Button label={`I've paid ${formatLKR(amount)}`} icon={Coins} onPress={submit} loading={busy} />
    </Section>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <RoundIconButton icon={ChevronLeft} label="Back" onPress={onBack} background="transparent" size={40} />
      <Text style={styles.topTitle}>RentAnything coins</Text>
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
  scroll: { gap: 8, paddingBottom: 32, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  label: { fontSize: 13, fontWeight: font.medium, color: colors.text2 },
  wallet: {
    margin: 16,
    marginBottom: 0,
    padding: 20,
    gap: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  walletLabel: { fontSize: 15, fontWeight: font.semibold, color: colors.white },
  walletAmount: { fontSize: 36, fontWeight: font.bold, color: colors.white },
  walletSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
  reward: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rewardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 22, height: 6, borderRadius: 3, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sub: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  details: { padding: 12, borderRadius: radius.md, backgroundColor: colors.background },
  fieldLabel: { fontSize: 13, fontWeight: font.medium, color: colors.text2 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  entryTitle: { fontSize: 14, fontWeight: font.semibold, color: colors.ink },
  entryAmount: { fontSize: 15, fontWeight: font.bold },
});
