import { router } from 'expo-router';
import { Camera, Check, ChevronLeft, CircleAlert, Crosshair, MapPin, Plus, Trash2, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/components/layout';
import { TownPicker } from '@/components/town-picker';
import {
  Button,
  Card,
  Chip,
  Divider,
  Field,
  Group,
  Notice,
  RoundIconButton,
  Segmented,
  Stepper,
  ToggleRow,
  Wrap,
} from '@/components/ui';
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth } from '@/lib/auth';
import { getGpsPosition } from '@/lib/location';
import { STEPS, suggestTitle, toInputs, validateStep, type Errors, type FormState } from '@/lib/listing-form';
import { MAX_PHOTOS, pickPhotos, syncListingPhotos } from '@/lib/photos';
import { friendlyError, supabase } from '@/lib/supabase';
import { nearestTown, TOWNS } from '@/lib/towns';
import {
  deleteListing,
  DOCUMENTS,
  FUEL_POLICIES,
  FUEL_TYPES,
  saveVehicleListing,
  TRANSMISSIONS,
  VEHICLE_TYPES,
} from '@/lib/vehicles';
import { colors, font, radius } from '@/theme';

const PHONE_RE = /^\+?[0-9 ]{9,16}$/;
const TITLE_FIELDS: (keyof FormState)[] = ['vehicle_type', 'make', 'model', 'seats', 'double_seat', 'has_ac'];

export function ListingForm({
  initial,
  listingId,
  existingPhotos,
}: {
  initial: FormState;
  listingId: string | null;
  existingPhotos: { id: string; path: string }[];
}) {
  const { session, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState<FormState>(initial);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pickingTown, setPickingTown] = useState(false);
  const [locating, setLocating] = useState(false);
  const [phone, setPhone] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Set after the first successful save, so a retry updates instead of
  // creating a duplicate listing.
  const savedId = useRef<string | null>(listingId);
  const scroll = useRef<ScrollView>(null);

  const needsPhone = !profile?.phone;
  const isEdit = listingId != null;

  const update = (patch: Partial<FormState>) => {
    // Editing a field clears its error.
    setErrors((e) => {
      const keys = Object.keys(patch).filter((k) => k in e);
      if (!keys.length) return e;
      const next = { ...e };
      for (const k of keys) delete next[k as keyof Errors];
      return next;
    });
    setForm((f) => {
      const next = { ...f, ...patch };
      if (!next.title_edited && Object.keys(patch).some((k) => TITLE_FIELDS.includes(k as keyof FormState))) {
        next.title = suggestTitle(next);
      }
      return next;
    });
  };

  const goTo = (s: number) => {
    setStep(s);
    setErrors({});
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  const next = () => {
    const e = validateStep(step, form);
    if (step === 3 && needsPhone && !PHONE_RE.test(phone.trim())) e.phone = 'Enter your phone number, e.g. 077 123 4567';
    setErrors(e);
    if (Object.keys(e).length) return false;
    if (step < STEPS.length - 1) goTo(step + 1);
    return true;
  };

  const back = () => (step === 0 ? router.back() : goTo(step - 1));

  const locate = async () => {
    setLocating(true);
    try {
      const pos = await getGpsPosition();
      update({ lat: pos.lat, lng: pos.lng, town: nearestTown(pos).name });
    } catch (e) {
      setErrors((x) => ({
        ...x,
        town:
          e instanceof Error && e.message === 'denied'
            ? 'Location permission is off. Choose your town instead.'
            : "Couldn't get your location. Choose your town instead.",
      }));
    } finally {
      setLocating(false);
    }
  };

  const addPhotos = async () => {
    const picked = await pickPhotos(MAX_PHOTOS - form.photos.length);
    if (picked.length) update({ photos: [...form.photos, ...picked] });
  };

  const submit = async () => {
    if (!next() || !session) return;
    setBusy(true);
    setSubmitError(null);
    try {
      if (needsPhone) {
        const { error } = await supabase.from('profiles').update({ phone: phone.trim() }).eq('id', session.user.id);
        if (error) throw error;
        await refreshProfile();
      }
      const { listing, details } = toInputs(form);
      const id = await saveVehicleListing(listing, details, savedId.current);
      savedId.current = id;
      await syncListingPhotos(session.user.id, id, form.photos, existingPhotos, (key, saved) =>
        setForm((f) => ({
          ...f,
          photos: f.photos.map((p) => (p.key === key ? { ...p, ...saved } : p)),
        })),
      );
      router.back();
    } catch (e) {
      setSubmitError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!listingId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await deleteListing(listingId);
      router.back();
    } catch (e) {
      setSubmitError(friendlyError(e));
      setBusy(false);
    }
  };

  const town = TOWNS.find((t) => t.name === form.town);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <Screen background={colors.white} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <RoundIconButton icon={ChevronLeft} label="Back" onPress={back} background="transparent" size={40} />
        <Text style={styles.topTitle}>{isEdit ? 'Edit vehicle' : 'Add vehicle'}</Text>
        <Text style={styles.stepText}>
          Step {step + 1} of {STEPS.length}
        </Text>
      </View>
      <View style={styles.progress}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.progressBar, { backgroundColor: i <= step ? colors.primary : colors.border }]} />
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 0 ? (
            <>
              <Heading title="Vehicle details" text="Tell customers exactly what you rent out." />
              <Group title="Vehicle type">
                <Wrap>
                  {VEHICLE_TYPES.map((t) => (
                    <Chip
                      key={t.value}
                      label={t.label}
                      selected={form.vehicle_type === t.value}
                      onPress={() => update({ vehicle_type: t.value })}
                    />
                  ))}
                </Wrap>
                {errors.vehicle_type ? <Text style={styles.error}>{errors.vehicle_type}</Text> : null}
              </Group>
              <View style={styles.pair}>
                <Field
                  label="Make"
                  value={form.make}
                  onChangeText={(make) => update({ make })}
                  placeholder="Toyota"
                  error={errors.make}
                  style={{ flex: 1 }}
                />
                <Field
                  label="Model"
                  value={form.model}
                  onChangeText={(model) => update({ model })}
                  placeholder="KDH"
                  error={errors.model}
                  style={{ flex: 1 }}
                />
              </View>
              <View style={styles.pair}>
                <Field
                  label="Year"
                  value={form.year}
                  onChangeText={(year) => update({ year })}
                  placeholder="2016"
                  keyboardType="number-pad"
                  maxLength={4}
                  error={errors.year}
                  style={{ flex: 1 }}
                />
                <Stepper label="Seats" value={form.seats} onChange={(seats) => update({ seats })} min={1} max={100} />
              </View>
              <Card>
                {form.vehicle_type === 'buddy_van' ? (
                  <>
                    <ToggleRow
                      title="Double seat"
                      subtitle="Two seat rows behind the driver (modified buddy van)"
                      value={form.double_seat}
                      onChange={(double_seat) => update({ double_seat })}
                    />
                    <Divider />
                  </>
                ) : null}
                <ToggleRow title="Air conditioned (AC)" value={form.has_ac} onChange={(has_ac) => update({ has_ac })} />
              </Card>
              <Group title="Transmission">
                <Segmented
                  options={TRANSMISSIONS}
                  value={form.transmission ?? 'auto'}
                  onChange={(transmission) => update({ transmission })}
                />
              </Group>
              <Group title="Fuel">
                <Segmented
                  options={FUEL_TYPES}
                  value={form.fuel_type ?? 'petrol'}
                  onChange={(fuel_type) => update({ fuel_type })}
                />
              </Group>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Heading title="Pricing" text="All prices in Sri Lankan rupees." />
              <Field
                label="Price per day"
                prefix="Rs"
                value={form.price_per_day}
                onChangeText={(price_per_day) => update({ price_per_day })}
                keyboardType="number-pad"
                placeholder="6,000"
                error={errors.price_per_day}
              />
              {!form.unlimited_km ? (
                <View style={styles.pair}>
                  <Field
                    label="Free km per day"
                    suffix="km"
                    value={form.km_per_day}
                    onChangeText={(km_per_day) => update({ km_per_day })}
                    keyboardType="number-pad"
                    placeholder="100"
                    error={errors.km_per_day}
                    style={{ flex: 1 }}
                  />
                  <Field
                    label="Extra km charge"
                    prefix="Rs"
                    suffix="/km"
                    value={form.extra_km_rate}
                    onChangeText={(extra_km_rate) => update({ extra_km_rate })}
                    keyboardType="number-pad"
                    placeholder="45"
                    error={errors.extra_km_rate}
                    style={{ flex: 1 }}
                  />
                </View>
              ) : null}
              <Checkbox
                label="Unlimited km (no daily limit)"
                checked={form.unlimited_km}
                onChange={(unlimited_km) => update({ unlimited_km })}
              />
              <View style={styles.pair}>
                <Stepper
                  label="Minimum rental days"
                  value={form.min_days}
                  onChange={(min_days) => update({ min_days })}
                  min={1}
                  max={365}
                />
                <View style={{ flex: 1 }} />
              </View>
              <Group title="Long-term offers" subtitle="Optional. Shown to customers as a discount for long hires.">
                <OfferCard
                  title="Weekly offer"
                  period="7 days"
                  on={form.weekly_on}
                  onToggle={(weekly_on) => update({ weekly_on })}
                  price={form.weekly_price}
                  onPrice={(weekly_price) => update({ weekly_price })}
                  km={form.weekly_km}
                  onKm={(weekly_km) => update({ weekly_km })}
                  priceError={errors.weekly_price}
                />
                <OfferCard
                  title="Monthly offer"
                  period="30 days"
                  on={form.monthly_on}
                  onToggle={(monthly_on) => update({ monthly_on })}
                  price={form.monthly_price}
                  onPrice={(monthly_price) => update({ monthly_price })}
                  km={form.monthly_km}
                  onKm={(monthly_km) => update({ monthly_km })}
                  priceError={errors.monthly_price}
                />
              </Group>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Heading title="Driver & terms" text="Let customers know how they can hire it." />
              <Card>
                <ToggleRow
                  title="Self-drive allowed"
                  subtitle="Customer drives the vehicle"
                  value={form.self_drive}
                  onChange={(self_drive) => update({ self_drive })}
                />
                <Divider />
                <ToggleRow
                  title="Driver available"
                  subtitle="You or your driver comes with it"
                  value={form.driver_available}
                  onChange={(driver_available) => update({ driver_available })}
                />
                {form.driver_available ? (
                  <>
                    <Field
                      label="Driver price per day (all-inclusive)"
                      prefix="Rs"
                      suffix="/day"
                      value={form.driver_price_per_day}
                      onChangeText={(driver_price_per_day) => update({ driver_price_per_day })}
                      keyboardType="number-pad"
                      placeholder="3,000"
                      error={errors.driver_price_per_day}
                    />
                    <Text style={styles.hint}>
                      Include the driver&apos;s food and stay in this price. Enter 0 if the day price already includes a driver.
                    </Text>
                  </>
                ) : null}
                {errors.self_drive ? <Text style={styles.error}>{errors.self_drive}</Text> : null}
              </Card>
              <Field
                label="Refundable deposit (optional)"
                prefix="Rs"
                value={form.deposit}
                onChangeText={(deposit) => update({ deposit })}
                keyboardType="number-pad"
                placeholder="25,000"
              />
              <Group title="Documents needed">
                <Wrap>
                  {DOCUMENTS.map((d) => {
                    const on = form.documents.includes(d.value);
                    return (
                      <Chip
                        key={d.value}
                        label={d.label}
                        icon={on ? Check : Plus}
                        selected={on}
                        onPress={() =>
                          update({
                            documents: on
                              ? form.documents.filter((x) => x !== d.value)
                              : [...form.documents, d.value],
                          })
                        }
                      />
                    );
                  })}
                </Wrap>
              </Group>
              <Group title="Fuel policy">
                <View style={{ gap: 8 }}>
                  {FUEL_POLICIES.map((p) => (
                    <Radio
                      key={p.value}
                      label={p.label}
                      selected={form.fuel_policy === p.value}
                      onPress={() => update({ fuel_policy: form.fuel_policy === p.value ? null : p.value })}
                    />
                  ))}
                </View>
              </Group>
              <Field
                label="Notes (optional)"
                value={form.terms_notes}
                onChangeText={(terms_notes) => update({ terms_notes })}
                placeholder="e.g. No smoking. Child seat available on request."
                multiline
                maxLength={1000}
              />
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Heading title="Photos & location" text={`Clear photos get more calls. Add up to ${MAX_PHOTOS}.`} />
              <View style={styles.photos}>
                {form.photos.map((p, i) => (
                  <Pressable
                    key={p.key}
                    accessibilityRole="button"
                    accessibilityLabel={i === 0 ? 'Cover photo' : 'Make cover photo'}
                    onPress={() => update({ photos: [p, ...form.photos.filter((x) => x.key !== p.key)] })}
                    style={styles.photoTile}>
                    <VehiclePhoto uri={p.uri || undefined} path={p.path} seed={p.key} style={StyleSheet.absoluteFill} iconSize={32} />
                    {i === 0 ? (
                      <View style={styles.cover}>
                        <Text style={styles.coverText}>Cover</Text>
                      </View>
                    ) : null}
                    <View style={styles.removePhoto}>
                      <RoundIconButton
                        icon={X}
                        label="Remove photo"
                        size={26}
                        background="rgba(15, 23, 42, 0.7)"
                        color={colors.white}
                        onPress={() => update({ photos: form.photos.filter((x) => x.key !== p.key) })}
                      />
                    </View>
                  </Pressable>
                ))}
                {form.photos.length < MAX_PHOTOS ? (
                  <Pressable accessibilityRole="button" onPress={addPhotos} style={[styles.photoTile, styles.addPhoto]}>
                    <Camera size={24} color={colors.primary} />
                    <Text style={styles.addPhotoText}>Add photo</Text>
                  </Pressable>
                ) : null}
              </View>
              {form.photos.length > 1 ? <Text style={styles.hint}>Tap a photo to make it the cover.</Text> : null}

              <Group title="Where is the vehicle parked?">
                <Button label="Use my current location" kind="soft" icon={Crosshair} onPress={locate} loading={locating} />
                <Pressable accessibilityRole="button" onPress={() => setPickingTown(true)} style={styles.townRow}>
                  <MapPin size={18} color={colors.primary} />
                  <Text style={[styles.townText, !form.town && { color: colors.muted }]}>
                    {form.town ? `${form.town}${town ? `, ${town.district}` : ''}` : 'Or choose your town'}
                  </Text>
                  <Text style={styles.change}>{form.town ? 'Change' : 'Choose'}</Text>
                </Pressable>
                {errors.town ? <Text style={styles.error}>{errors.town}</Text> : null}
                <Text style={styles.hint}>Customers see only the town and distance, never your exact address.</Text>
              </Group>

              <Field
                label="Listing title"
                value={form.title}
                onChangeText={(title) => update({ title, title_edited: true })}
                placeholder="Suzuki Every Buddy Van · Double seat · AC"
                maxLength={120}
                error={errors.title}
              />
              <Field
                label="Description (optional)"
                value={form.description}
                onChangeText={(description) => update({ description })}
                placeholder="Well maintained, clean, perfect for family trips…"
                multiline
                maxLength={4000}
              />
              {needsPhone ? (
                <Field
                  label="Your phone number"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="077 123 4567"
                  keyboardType="phone-pad"
                  error={errors.phone}
                />
              ) : null}
              <Card>
                <ToggleRow
                  title="Available for rent now"
                  subtitle="You can switch this off anytime"
                  value={form.is_available}
                  onChange={(is_available) => update({ is_available, available_again_on: null })}
                />
              </Card>
              {isEdit ? (
                <Button
                  label={confirmDelete ? 'Tap again to delete for good' : 'Delete this listing'}
                  kind="danger"
                  icon={Trash2}
                  onPress={remove}
                  disabled={busy}
                />
              ) : null}
            </>
          ) : null}

          {hasErrors ? <Notice tone="danger" icon={CircleAlert} text="Please fix the highlighted fields." /> : null}
          {submitError ? <Notice tone="danger" icon={CircleAlert} text={submitError} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        {step > 0 ? <Button label="Back" kind="ghost" onPress={back} /> : null}
        <Button
          style={{ flex: 1 }}
          label={step < STEPS.length - 1 ? `Next: ${STEPS[step + 1]}` : isEdit ? 'Save changes' : 'Publish listing'}
          icon={step === STEPS.length - 1 ? Check : undefined}
          onPress={step < STEPS.length - 1 ? next : submit}
          loading={busy}
        />
      </View>

      <TownPicker
        visible={pickingTown}
        title="Where is it parked?"
        onClose={() => setPickingTown(false)}
        onPick={(t) => {
          setPickingTown(false);
          update({ lat: t.lat, lng: t.lng, town: t.name });
        }}
      />
    </Screen>
  );
}

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.headingText}>{text}</Text>
    </View>
  );
}

function OfferCard(p: {
  title: string;
  period: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  price: string;
  onPrice: (v: string) => void;
  km: string;
  onKm: (v: string) => void;
  priceError?: string;
}) {
  return (
    <Card>
      <ToggleRow title={p.title} subtitle={p.period} value={p.on} onChange={p.onToggle} />
      {p.on ? (
        <View style={styles.pair}>
          <Field
            label={`Price for ${p.period}`}
            prefix="Rs"
            value={p.price}
            onChangeText={p.onPrice}
            keyboardType="number-pad"
            error={p.priceError}
            style={{ flex: 1 }}
          />
          <Field
            label="Km included"
            suffix="km"
            value={p.km}
            onChangeText={p.onKm}
            keyboardType="number-pad"
            placeholder="Unlimited"
            style={{ flex: 1 }}
          />
        </View>
      ) : null}
    </Card>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={[
          styles.checkbox,
          checked && { backgroundColor: colors.primary, borderColor: colors.primary },
        ]}>
        {checked ? <Check size={14} color={colors.white} strokeWidth={3} /> : null}
      </View>
      <Text style={{ fontSize: 15, fontWeight: font.medium, color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

function Radio({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.radio,
        selected && { backgroundColor: colors.primary50, borderColor: colors.primary },
      ]}>
      <View style={[styles.radioOuter, selected && { borderColor: colors.primary }]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: font.medium, color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 16, paddingVertical: 6 },
  topTitle: { flex: 1, fontSize: 17, fontWeight: font.semibold, color: colors.ink },
  stepText: { fontSize: 13, fontWeight: font.medium, color: colors.muted },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 12 },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  body: { padding: 16, paddingTop: 20, paddingBottom: 32, gap: 20 },
  heading: { fontSize: 21, fontWeight: font.bold, color: colors.ink },
  headingText: { fontSize: 14, color: colors.text2 },
  pair: { flexDirection: 'row', gap: 12 },
  error: { fontSize: 12, color: colors.danger },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.switchOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.switchOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoTile: { width: '31%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' },
  addPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primary50,
  },
  addPhotoText: { fontSize: 12, fontWeight: font.semibold, color: colors.primary },
  cover: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
  },
  coverText: { fontSize: 11, fontWeight: font.semibold, color: colors.white },
  removePhoto: { position: 'absolute', top: 6, right: 6 },
  townRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  townText: { flex: 1, fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  change: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
});
