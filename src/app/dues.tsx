import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, CircleAlert, CircleCheck, Clock, MessageCircle, Wallet } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFeedback } from '@/components/feedback';
import { EmptyState, Screen, SignInPrompt } from '@/components/layout';
import {
  Button,
  Chip,
  Divider,
  Field,
  LabelRow,
  Notice,
  RoundIconButton,
  Section,
  Skeleton,
  Wrap,
} from '@/components/ui';
import { HELP } from '@/lib/help';
import { useAuth } from '@/lib/auth';
import { getMyDues, PAYMENT_METHODS, reportDuesPayment, type MyDues, type PaymentMethod } from '@/lib/bookings';
import { formatAmountInput, formatDateShort, formatLKR, parseAmount } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { contactSupport, hasSupport } from '@/lib/support';
import { colors, font, maxContentWidth, radius } from '@/theme';

// Owner's balance with RentAnything: commissions from rentals, payments, and
// how to pay (docs/SPEC.md §12).
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
        <SignInPrompt title="Payments to RentAnything" text="Sign in to see your balance." />
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

  const owed = Math.max(0, dues.balance - dues.pending);
  const pendingPayment = dues.payments.find((p) => p.status === 'pending');

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
          <Section style={{ gap: 12 }}>
            <LabelRow
              text={dues.balance > 0 ? 'You owe RentAnything' : 'Your balance'}
              help={HELP.balance}
              style={styles.label}
            />
            <Text style={[styles.amount, dues.restricted && { color: colors.danger }]}>
              {formatLKR(Math.max(0, dues.balance))}
            </Text>
            {dues.restricted ? (
              <Notice
                icon={CircleAlert}
                tone="danger"
                text={
                  dues.restricted_reason === 'limit'
                    ? `You owe ${formatLKR(dues.dues_limit)} or more, so your vehicles are hidden from search and you can't accept bookings. Pay to bring them back.`
                    : `Part of your balance is more than ${dues.dues_days} days old, so your vehicles are hidden from search. Pay to bring them back.`
                }
              />
            ) : dues.balance <= 0 ? (
              <View style={styles.row}>
                <CircleCheck size={18} color={colors.success700} />
                <Text style={[styles.sub, { color: colors.success700 }]}>All paid up. Thank you!</Text>
              </View>
            ) : owed > 0 ? (
              <Text style={styles.sub}>
                {dues.due_by ? `Please pay by ${formatDateShort(dues.due_by)}` : 'Please pay soon'}, or before you owe{' '}
                {formatLKR(dues.dues_limit)}, to keep your vehicles in search.
              </Text>
            ) : null}
            {pendingPayment ? (
              <View style={styles.row}>
                <Clock size={16} color={colors.offerText} />
                <Text style={[styles.sub, { color: colors.offerText, flex: 1 }]}>
                  We&apos;re checking your payment of {formatLKR(pendingPayment.amount)}. Your vehicles stay visible
                  meanwhile.
                </Text>
              </View>
            ) : null}
          </Section>

          <Section title="How it works" help={HELP.fee}>
            <Text style={styles.body}>
              Customers pay you in cash. When a rental starts (you enter the customer&apos;s code), RentAnything&apos;s
              fee of {dues.commission_percent}% of the agreed price is added here. Pay your balance any time.
            </Text>
          </Section>

          {owed > 0 || dues.balance > 0 ? (
            <Section title="How to pay">
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
                  onPress={() => contactSupport(`Hi RentAnything, I want to pay my balance of ${formatLKR(owed)}.`)}
                />
              ) : null}
            </Section>
          ) : null}

          {owed > 0 && !pendingPayment ? <ReportPayment owed={owed} onDone={load} /> : null}

          <Section title="History">
            {dues.entries.length === 0 && dues.payments.length === 0 ? (
              <Text style={styles.sub}>Nothing yet. Fees appear here when a rental starts.</Text>
            ) : null}
            {dues.payments
              .filter((p) => p.status !== 'approved')
              .map((p) => (
                <View key={`p${p.id}`} style={styles.entry}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.entryTitle}>
                      Payment reported · {PAYMENT_METHODS.find((m) => m.value === p.method)?.label}
                    </Text>
                    <Text style={styles.sub}>
                      {formatDateShort(p.created_at.slice(0, 10))}
                      {p.reference ? ` · ${p.reference}` : ''}
                      {p.status === 'pending' ? ' · Checking' : ' · Not received'}
                      {p.admin_note ? ` — ${p.admin_note}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.entryAmount, { color: p.status === 'rejected' ? colors.danger : colors.text2 }]}>
                    {formatLKR(p.amount)}
                  </Text>
                </View>
              ))}
            {dues.entries.map((e, i) => (
              <View key={e.id}>
                {i > 0 || dues.payments.some((p) => p.status !== 'approved') ? <Divider /> : null}
                <View style={styles.entry}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.entryTitle}>
                      {e.kind === 'commission' ? 'Fee' : e.kind === 'payment' ? 'Payment received' : 'Adjustment'}
                    </Text>
                    <Text style={styles.sub}>
                      {formatDateShort(e.created_at.slice(0, 10))}
                      {e.note ? ` · ${e.note}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.entryAmount, { color: e.amount < 0 ? colors.success700 : colors.ink }]}>
                    {e.amount < 0 ? '−' : '+'}
                    {formatLKR(Math.abs(e.amount))}
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

function ReportPayment({ owed, onDone }: { owed: number; onDone: () => void }) {
  const { toast } = useFeedback();
  const [amount, setAmount] = useState(formatAmountInput(String(owed)));
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = parseAmount(amount);
    if (!n || n <= 0) {
      setError('Enter the amount you paid.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reportDuesPayment(n, method, reference);
      toast("Thanks! We'll confirm your payment soon.");
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="I've paid">
      <Text style={styles.sub}>After you pay, tell us here so we can match your payment.</Text>
      <Field
        label="Amount paid"
        prefix="Rs"
        value={amount}
        onChangeText={(t) => setAmount(formatAmountInput(t))}
        keyboardType="number-pad"
      />
      <Text style={styles.fieldLabel}>Paid by</Text>
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
      <Button label="Send" onPress={submit} loading={busy} />
    </Section>
  );
}

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <RoundIconButton icon={ChevronLeft} label="Back" onPress={onBack} background="transparent" size={40} />
      <Text style={styles.topTitle}>Payments to RentAnything</Text>
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
  amount: { fontSize: 32, fontWeight: font.bold, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sub: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  details: { padding: 12, borderRadius: radius.md, backgroundColor: colors.background },
  fieldLabel: { fontSize: 13, fontWeight: font.medium, color: colors.text2 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  entryTitle: { fontSize: 14, fontWeight: font.semibold, color: colors.ink },
  entryAmount: { fontSize: 15, fontWeight: font.bold },
});
