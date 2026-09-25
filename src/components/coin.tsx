// RentAnything coin (gold), the wallet card and the top-up sheet
// (docs/SPEC.md §16).
import { router } from 'expo-router';
import { CircleAlert, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useFeedback } from '@/components/feedback';
import { Button, Chip, Field, Notice, Wrap } from '@/components/ui';
import { PAYMENT_METHODS, reportDuesPayment, type MyDues, type PaymentMethod } from '@/lib/bookings';
import { creditUsed, formatCoins, toCoins, topUpPacks, walletCoins } from '@/lib/coins';
import { formatLKR } from '@/lib/format';
import { friendlyError } from '@/lib/supabase';
import { contactSupport, hasSupport } from '@/lib/support';
import { colors, font, maxContentWidth, radius } from '@/theme';

export const gold = {
  light: '#FDE68A',
  mid: '#F5B301',
  dark: '#B7791F',
  deep: '#7C4A03',
  text: '#92400E',
  soft: '#FFF7DB',
};

let gradientId = 0;

// A shiny gold coin with a car on it.
export function Coin({ size = 24 }: { size?: number }) {
  const [id] = useState(() => `coin${gradientId++}`);
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <LinearGradient id={`${id}o`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={gold.light} />
          <Stop offset="0.5" stopColor={gold.mid} />
          <Stop offset="1" stopColor={gold.dark} />
        </LinearGradient>
        <LinearGradient id={`${id}i`} x1="1" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={gold.light} />
          <Stop offset="0.55" stopColor={gold.mid} />
          <Stop offset="1" stopColor={gold.dark} />
        </LinearGradient>
      </Defs>
      <Circle cx="24" cy="24" r="23" fill={`url(#${id}o)`} />
      <Circle cx="24" cy="24" r="23" fill="none" stroke={gold.deep} strokeOpacity={0.35} strokeWidth="1" />
      <Circle cx="24" cy="24" r="17.5" fill={`url(#${id}i)`} stroke={gold.dark} strokeOpacity={0.6} strokeWidth="1.2" />
      {/* Little car */}
      <Path
        d="M15 28.5v-4.2c0-.5.1-1 .4-1.4l2.1-3.3c.4-.6 1-.9 1.7-.9h7.1c.5 0 1 .2 1.4.6l2.9 3.1 2.6.6c.9.2 1.6 1 1.6 1.9v3.6"
        fill="none"
        stroke={gold.deep}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M14.5 28.5h19.5" stroke={gold.deep} strokeWidth="2" strokeLinecap="round" />
      <Circle cx="19.5" cy="29" r="2.4" fill={gold.light} stroke={gold.deep} strokeWidth="1.8" />
      <Circle cx="29.5" cy="29" r="2.4" fill={gold.light} stroke={gold.deep} strokeWidth="1.8" />
      {/* Shine */}
      <Path d="M11 17a15 15 0 0 1 9-7" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth="2" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// "🪙 1,240" in one line.
export function CoinAmount({
  coins,
  size = 18,
  color = colors.ink,
  weight = font.bold,
}: {
  coins: number;
  size?: number;
  color?: string;
  weight?: (typeof font)[keyof typeof font];
}) {
  return (
    <View style={styles.amountRow} accessibilityLabel={formatCoins(coins)}>
      <Coin size={Math.round(size * 1.15)} />
      <Text style={{ fontSize: size, fontWeight: weight, color }}>
        {coins.toLocaleString('en-US', { maximumFractionDigits: 1 })}
      </Text>
    </View>
  );
}

// Small tappable wallet balance, e.g. in the My vehicles header.
export function CoinPill({ dues }: { dues: MyDues }) {
  const coins = walletCoins(dues.balance, dues.coin_value || 1);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your wallet: ${formatCoins(coins)}`}
      onPress={() => router.push('/dues')}
      style={({ pressed }) => [styles.pill, dues.restricted && styles.pillOwe, pressed && { opacity: 0.85 }]}>
      <Coin size={20} />
      <Text style={[styles.pillText, dues.restricted && { color: colors.danger }]}>
        {coins.toLocaleString('en-US', { maximumFractionDigits: 1 })}
      </Text>
    </Pressable>
  );
}

// The dark wallet card with the balance and a Top up button.
export function WalletCard({ dues, onTopUp }: { dues: MyDues; onTopUp: (coins?: number) => void }) {
  const coinValue = dues.coin_value || 1;
  const coins = walletCoins(dues.balance, coinValue);
  const credit = creditUsed(dues.balance, dues.dues_limit, coinValue);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  return (
    <View
      style={styles.wallet}
      onLayout={(e) => {
        setW(e.nativeEvent.layout.width);
        setH(e.nativeEvent.layout.height);
      }}>
      {w > 0 ? (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="walletBg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#1E293B" />
              <Stop offset="1" stopColor="#0B1220" />
            </LinearGradient>
            <LinearGradient id="walletGlow" x1="1" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={gold.mid} stopOpacity={0.35} />
              <Stop offset="0.6" stopColor={gold.mid} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width={w} height={h} rx={radius.xl} fill="url(#walletBg)" />
          <Rect width={w} height={h} rx={radius.xl} fill="url(#walletGlow)" />
          <Circle cx={w - 30} cy={-10} r={90} fill={gold.mid} fillOpacity={0.08} />
        </Svg>
      ) : null}
      <View style={styles.walletTop}>
        <Text style={styles.walletBrand}>RentAnything Wallet</Text>
        {dues.restricted ? (
          <View style={styles.warnChip}>
            <CircleAlert size={12} color="#FECACA" />
            <Text style={styles.warnChipText}>Vehicles hidden</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.balanceRow}>
        <Coin size={44} />
        <Text style={[styles.balance, dues.restricted && { color: '#FCA5A5' }]} accessibilityLabel={formatCoins(coins)}>
          {coins.toLocaleString('en-US', { maximumFractionDigits: 1 })}
        </Text>
        <Text style={styles.balanceUnit}>coins</Text>
      </View>
      {credit.used > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={styles.creditTrack}>
            <View
              style={[
                styles.creditFill,
                { width: `${Math.max(4, credit.fraction * 100)}%` },
                dues.restricted && { backgroundColor: '#F87171' },
              ]}
            />
          </View>
          <Text style={styles.walletSub}>
            {dues.restricted
              ? `All ${credit.limit.toLocaleString('en-US')} coins of credit are used`
              : `Using ${credit.used.toLocaleString('en-US')} of your ${credit.limit.toLocaleString('en-US')} coins of credit`}
            {'  ·  '}1 coin = {formatLKR(coinValue)}
          </Text>
        </View>
      ) : (
        <Text style={styles.walletSub}>
          {coins > 0 ? 'Paid in advance · fees come out of these' : 'All paid up'}
          {'  ·  '}1 coin = {formatLKR(coinValue)}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => onTopUp()}
        style={({ pressed }) => [styles.topUp, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}>
        <Plus size={18} color={gold.deep} strokeWidth={2.6} />
        <Text style={styles.topUpText}>Top up coins</Text>
      </Pressable>
      <View style={styles.quickRow}>
        {[500, 1000, 2000].map((c) => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityLabel={`Top up ${c} coins`}
            onPress={() => onTopUp(c)}
            style={({ pressed }) => [styles.quick, pressed && { opacity: 0.7 }]}>
            <Text style={styles.quickText}>+{c.toLocaleString('en-US')}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Bottom sheet: pick coins, pay outside the app, tell us.
export function TopUpSheet({
  visible,
  dues,
  initialCoins,
  onClose,
  onDone,
}: {
  visible: boolean;
  dues: MyDues;
  initialCoins?: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { toast } = useFeedback();
  const coinValue = dues.coin_value || 1;
  const owed = Math.max(0, -walletCoins(dues.balance - dues.pending, coinValue));
  const packs = topUpPacks(owed);
  if (initialCoins && !packs.includes(initialCoins)) packs.push(initialCoins);
  packs.sort((a, b) => a - b);
  const [pack, setPack] = useState(initialCoins ?? packs.find((p) => p >= owed) ?? packs[0]);
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amount = pack * coinValue;
  const pending = dues.payments.find((p) => p.status === 'pending');

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await reportDuesPayment(amount, method, reference);
      toast(`Thanks! ${pack.toLocaleString('en-US')} coins will be added after we check your payment.`);
      onDone();
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
            <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
              <View style={styles.sheetHead}>
                <Coin size={32} />
                <Text style={styles.sheetTitle}>Top up coins</Text>
              </View>
              {pending ? (
                <Notice
                  text={`We're still checking your last payment of ${formatLKR(pending.amount)} (${formatCoins(
                    toCoins(pending.amount, coinValue),
                  )}). You can top up again after that.`}
                />
              ) : (
                <>
                  <Text style={styles.step}>1. Choose coins</Text>
                  <View style={styles.packs}>
                    {packs.map((p) => {
                      const on = p === pack;
                      return (
                        <Pressable
                          key={p}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${p.toLocaleString('en-US')} coins, ${formatLKR(p * coinValue)}`}
                          onPress={() => setPack(p)}
                          style={[styles.pack, on && styles.packOn]}>
                          <Coin size={28} />
                          <Text style={styles.packCoins}>{p.toLocaleString('en-US')}</Text>
                          <Text style={styles.packPrice}>{formatLKR(p * coinValue)}</Text>
                          {owed > 0 && p === Math.ceil(owed / 10) * 10 ? (
                            <Text style={styles.packTag}>Pays what you owe</Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.step}>2. Pay {formatLKR(amount)} to RentAnything</Text>
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
                      onPress={() =>
                        contactSupport(`Hi RentAnything, I want to buy ${pack} coins (${formatLKR(amount)}).`)
                      }
                    />
                  ) : null}
                  <Text style={styles.step}>3. Tell us how you paid</Text>
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
                  <Text style={styles.sub}>
                    We add the coins after we check the payment. Your vehicles show in search while we check.
                  </Text>
                  {error ? <Notice icon={CircleAlert} tone="danger" text={error} /> : null}
                  <Button label={`I've paid ${formatLKR(amount)}`} onPress={submit} loading={busy} />
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 6,
    paddingRight: 12,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: gold.soft,
    borderWidth: 1,
    borderColor: gold.light,
  },
  pillOwe: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  pillText: { fontSize: 15, fontWeight: font.bold, color: gold.text },
  wallet: {
    margin: 16,
    marginBottom: 0,
    padding: 20,
    gap: 10,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  walletTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  walletBrand: { fontSize: 13, fontWeight: font.semibold, color: gold.light, letterSpacing: 0.6 },
  warnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(185, 28, 28, 0.55)',
  },
  warnChipText: { fontSize: 11, fontWeight: font.semibold, color: '#FECACA' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balance: { fontSize: 40, fontWeight: font.bold, color: colors.white },
  balanceUnit: { fontSize: 16, fontWeight: font.semibold, color: 'rgba(255,255,255,0.7)', marginTop: 12 },
  walletSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },
  topUp: {
    marginTop: 6,
    height: 50,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: gold.mid,
  },
  topUpText: { fontSize: 16, fontWeight: font.bold, color: gold.deep },
  quickRow: { flexDirection: 'row', gap: 8 },
  creditTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  creditFill: { height: 6, borderRadius: 3, backgroundColor: gold.mid },
  quick: {
    flex: 1,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(253, 230, 138, 0.35)',
  },
  quickText: { fontSize: 14, fontWeight: font.bold, color: gold.light },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingTop: 10,
    maxHeight: '92%',
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetTitle: { fontSize: 20, fontWeight: font.bold, color: colors.ink },
  step: { fontSize: 13, fontWeight: font.semibold, color: colors.text2 },
  packs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pack: {
    width: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  packOn: { borderColor: gold.mid, backgroundColor: gold.soft },
  packCoins: { fontSize: 20, fontWeight: font.bold, color: colors.ink },
  packPrice: { fontSize: 13, color: colors.text2 },
  packTag: { fontSize: 11, fontWeight: font.semibold, color: gold.text, marginTop: 2 },
  details: { padding: 12, borderRadius: radius.md, backgroundColor: colors.background },
  body: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  sub: { fontSize: 13, color: colors.text2, lineHeight: 18 },
});
