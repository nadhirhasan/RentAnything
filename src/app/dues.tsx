import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, CircleAlert, CircleCheck, Clock, Gift, Wallet } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CoinAmount, gold, TopUpSheet, WalletCard } from '@/components/coin';
import { EmptyState, Screen, SignInPrompt } from '@/components/layout';
import { ScoreMeter, TierBadge } from '@/components/reputation';
import { Button, Divider, Notice, RoundIconButton, Section, Skeleton } from '@/components/ui';
import { HELP } from '@/lib/help';
import { useAuth } from '@/lib/auth';
import { feeRules, getMyDues, PAYMENT_METHODS, type MyDues } from '@/lib/bookings';
import { formatCoins, freeRentalsLeft, rentalFee, toCoins } from '@/lib/coins';
import { MIN_OUTCOMES, nextTier } from '@/lib/reputation';
import { formatDateShort, formatLKR } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { colors, font, maxContentWidth, radius } from '@/theme';

// Owner's coin wallet: fees from rentals, coins bought, rewards, and how to
// buy coins (docs/SPEC.md §12, §16).
export default function DuesScreen() {
  const { session } = useAuth();
  const [dues, setDues] = useState<MyDues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [topUp, setTopUp] = useState<{ coins?: number } | null>(null);

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
  const pendingPayment = dues.payments.find((p) => p.status === 'pending');
  const freeLeft = freeRentalsLeft(dues.free_rentals, dues.verified_rentals);
  const next = nextTier(dues.owner_score, dues.verified_rentals, dues.owner_tier);
  const coins = (rupees: number) => formatCoins(toCoins(rupees, coinValue));
  const coinNumber = (rupees: number) => toCoins(rupees, coinValue);

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
          <WalletCard dues={dues} onTopUp={(c) => setTopUp({ coins: c })} />

          <Section style={{ gap: 10 }}>
            {dues.restricted ? (
              <Notice
                icon={CircleAlert}
                tone="danger"
                text={
                  dues.restricted_reason === 'limit'
                    ? `You owe ${coins(dues.dues_limit)} or more, so your vehicles are hidden from search and you can't accept bookings. Top up to bring them back.`
                    : `Some coins are owed for more than ${dues.dues_days} days, so your vehicles are hidden from search. Top up to bring them back.`
                }
              />
            ) : owed > 0 ? (
              <Text style={styles.sub}>
                {dues.due_by ? `Please top up by ${formatDateShort(dues.due_by)}` : 'Please top up soon'}, and before
                you owe {coins(dues.dues_limit)}, to keep your vehicles in search.
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
                  We&apos;re checking your top-up of {coins(pendingPayment.amount)} ({formatLKR(pendingPayment.amount)}).
                  Your vehicles stay visible meanwhile.
                </Text>
              </View>
            ) : null}
          </Section>

          <Section title="Your success score" help={HELP.successScore}>
            <ScoreMeter
              score={dues.owner_score}
              caption={
                dues.owner_score == null
                  ? `You get a score after ${MIN_OUTCOMES} rentals or reviews. Start rentals with the code and give good service.`
                  : `From your last 12 months: ${dues.good_outcomes} good (4-5 star reviews and rentals without problems) and ${dues.bad_outcomes} bad (1-2 star reviews, cancellations, no-shows).`
              }
            />
            <View style={styles.badgeRow}>
              {dues.owner_tier ? <TierBadge tier={dues.owner_tier} large /> : <Text style={styles.entryTitle}>No badge yet</Text>}
              <Text style={styles.sub}>
                {dues.verified_rentals} rental{dues.verified_rentals === 1 ? '' : 's'} started with the code
              </Text>
            </View>
            {next ? (
              <View style={styles.next}>
                <Text style={styles.entryTitle}>Next badge: {next.label}</Text>
                {next.needs.map((n) => (
                  <Text key={n} style={styles.sub}>
                    • {n}
                  </Text>
                ))}
                <Text style={styles.sub}>Badges show on your vehicles and move you higher in search.</Text>
              </View>
            ) : (
              <Text style={styles.sub}>You have the highest badge. Keep your score at 90% or more to keep it.</Text>
            )}
          </Section>

          <Section title="Free rentals" help={HELP.rewards}>
            <View style={styles.reward}>
              <View style={[styles.rewardIcon, { backgroundColor: gold.soft }]}>
                <Gift size={20} color={gold.text} />
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
                      <View key={i} style={[styles.dot, i < dues.verified_rentals && { backgroundColor: gold.mid }]} />
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
          </Section>

          <Section title="How coins work" help={HELP.fee}>
            <Text style={styles.body}>
              Customers pay you in cash. When you start a rental with the customer&apos;s code, its fee comes out of
              your wallet: {dues.commission_percent}% of the agreed price
              {dues.fee_cap > 0 ? `, at most ${coins(dues.fee_cap)}` : ''}. Example: a Rs 40,000 rental costs{' '}
              {coins(rentalFee(40000, { ...feeRules(dues), freeLeft: 0 }))}. Top up any time, even before you owe.
            </Text>
          </Section>

          <Section title="History">
            {dues.entries.length === 0 && dues.payments.length === 0 ? (
              <Text style={styles.sub}>Nothing yet. Rentals and top-ups appear here.</Text>
            ) : null}
            {dues.payments
              .filter((p) => p.status !== 'approved')
              .map((p) => (
                <View key={`p${p.id}`} style={styles.entry}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.entryTitle}>
                      Top-up · {PAYMENT_METHODS.find((m) => m.value === p.method)?.label}
                    </Text>
                    <Text style={styles.sub}>
                      {formatDateShort(p.created_at.slice(0, 10))} · {formatLKR(p.amount)}
                      {p.reference ? ` · ${p.reference}` : ''}
                      {p.status === 'pending' ? ' · Checking' : ' · Not received'}
                      {p.admin_note ? ` — ${p.admin_note}` : ''}
                    </Text>
                  </View>
                  <CoinAmount
                    coins={coinNumber(p.amount)}
                    size={15}
                    color={p.status === 'rejected' ? colors.danger : colors.text2}
                  />
                </View>
              ))}
            {dues.entries.map((e, i) => (
              <View key={e.id}>
                {i > 0 || dues.payments.some((p) => p.status !== 'approved') ? <Divider /> : null}
                <View style={styles.entry}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.entryTitle}>
                      {e.kind === 'commission' ? 'Rental fee' : e.kind === 'payment' ? 'Top-up' : 'Adjustment'}
                    </Text>
                    <Text style={styles.sub}>
                      {formatDateShort(e.created_at.slice(0, 10))}
                      {e.note ? ` · ${e.note}` : ''}
                    </Text>
                  </View>
                  <CoinAmount
                    coins={-coinNumber(e.amount)}
                    size={15}
                    color={e.amount < 0 ? colors.success700 : colors.ink}
                  />
                </View>
              </View>
            ))}
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
      {topUp ? (
        <TopUpSheet
          visible
          dues={dues}
          initialCoins={topUp.coins}
          onClose={() => setTopUp(null)}
          onDone={() => {
            setTopUp(null);
            load();
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
      <Text style={styles.topTitle}>My wallet</Text>
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
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  next: { gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: colors.background },
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
