import { createURL } from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import {
  CalendarCheck,
  Car,
  ChevronRight,
  FileText,
  KeyRound,
  LogOut,
  MessageCircle,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EditableAvatar } from '@/components/avatar';
import { Coin } from '@/components/coin';
import { useFeedback } from '@/components/feedback';
import { Screen, SignInPrompt } from '@/components/layout';
import { Button, Card, Divider, Field, Notice, Skeleton, ToggleRow } from '@/components/ui';
import { VehiclePhoto } from '@/components/vehicle';
import { useAuth, type Profile } from '@/lib/auth';
import { formatLKPhone, isValidLKPhone } from '@/lib/format';
import { pickAvatar, saveAvatar } from '@/lib/photos';
import { unregisterPush } from '@/lib/push';
import { friendlyError, supabase } from '@/lib/supabase';
import { contactSupport, hasSupport } from '@/lib/support';
import { deleteMyAccount, getReviewInvites, type ReviewInvite } from '@/lib/trust';
import { colors, font } from '@/theme';

export default function AccountScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const { toast, confirm } = useFeedback();
  const [photoBusy, setPhotoBusy] = useState(false);

  if (!session) {
    return (
      <Screen>
        <Header />
        <SignInPrompt
          title="Your account"
          text="Sign in to contact owners and to list your own vehicles."
        />
        <LegalLinks />
      </Screen>
    );
  }

  const email = session.user.email ?? '';

  const signOut = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You can sign back in anytime with your email and password.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    await unregisterPush();
    await supabase.auth.signOut();
    toast('Signed out', 'info');
  };

  const deleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      message:
        'This permanently deletes your profile, your vehicle listings and photos, and your reviews. This cannot be undone.',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteMyAccount();
      toast('Your account was deleted', 'info');
      router.replace('/');
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const updatePhoto = async (remove: boolean) => {
    if (remove) {
      const ok = await confirm({
        title: 'Remove your photo?',
        message: 'People will see your initials instead.',
        confirmLabel: 'Remove',
        destructive: true,
      });
      if (!ok) return;
    }
    const item = remove ? null : await pickAvatar();
    if (!remove && !item) return;
    setPhotoBusy(true);
    try {
      await saveAvatar(session.user.id, item, profile?.avatar_path ?? null);
      await refreshProfile();
      toast(remove ? 'Photo removed' : 'Profile photo saved');
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  const changePassword = async () => {
    const ok = await confirm({
      title: 'Change password',
      message: `We'll email a link to ${email} so you can set a new password.`,
      confirmLabel: 'Send link',
    });
    if (!ok) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: createURL('/reset-password'),
    });
    if (error) toast(friendlyError(error), 'error');
    else toast(`Link sent to ${email}`);
  };

  return (
    <Screen>
      <Header />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <EditableAvatar
            name={profile?.full_name || email}
            path={profile?.avatar_path}
            busy={photoBusy}
            onPress={() => updatePhoto(false)}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name} numberOfLines={1}>
              {profile?.full_name || 'Add your name'}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {email}
            </Text>
            <View style={styles.photoLinks}>
              <Pressable accessibilityRole="button" onPress={() => updatePhoto(false)} hitSlop={8} disabled={photoBusy}>
                <Text style={styles.photoLink}>{profile?.avatar_path ? 'Change photo' : 'Add a photo'}</Text>
              </Pressable>
              {profile?.avatar_path ? (
                <Pressable accessibilityRole="button" onPress={() => updatePhoto(true)} hitSlop={8} disabled={photoBusy}>
                  <Text style={[styles.photoLink, { color: colors.text2 }]}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Card>
        {profile && !profile.avatar_path ? (
          <Text style={styles.photoHint}>
            A clear photo of your face helps owners and customers trust you.
          </Text>
        ) : null}

        {profile ? (
          <ContactForm key={profile.id} profile={profile} onSaved={refreshProfile} />
        ) : (
          <Card>
            <Skeleton style={{ height: 18, width: '50%' }} />
            <Skeleton style={{ height: 48 }} />
            <Skeleton style={{ height: 48 }} />
          </Card>
        )}

        <ReviewInvites />

        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <MenuRow icon={<Car size={20} color={colors.ink} />} label="My vehicles" onPress={() => router.navigate('/my-vehicles')} />
          <Divider />
          <MenuRow
            icon={<CalendarCheck size={20} color={colors.ink} />}
            label="Bookings"
            onPress={() => router.navigate('/bookings')}
          />
          <Divider />
          <MenuRow
            icon={<Coin size={22} />}
            label="My wallet (coins)"
            onPress={() => router.push('/dues')}
          />
          {profile?.is_admin ? (
            <>
              <Divider />
              <MenuRow
                icon={<ShieldCheck size={20} color={colors.ink} />}
                label="Moderation"
                onPress={() => router.push('/admin')}
              />
            </>
          ) : null}
          <Divider />
          <MenuRow icon={<KeyRound size={20} color={colors.ink} />} label="Change password" onPress={changePassword} />
          <Divider />
          <MenuRow icon={<LogOut size={20} color={colors.danger} />} label="Sign out" danger onPress={signOut} />
        </Card>

        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <MenuRow icon={<FileText size={20} color={colors.ink} />} label="Privacy policy" onPress={() => router.push('/privacy')} />
          <Divider />
          <MenuRow icon={<FileText size={20} color={colors.ink} />} label="Terms of use" onPress={() => router.push('/terms')} />
          {hasSupport ? (
            <>
              <Divider />
              <MenuRow
                icon={<MessageCircle size={20} color={colors.ink} />}
                label="Help & support"
                onPress={() => contactSupport('Hi RentAnything, I need help with…')}
              />
            </>
          ) : null}
          <Divider />
          <MenuRow icon={<Trash2 size={20} color={colors.danger} />} label="Delete account" danger onPress={deleteAccount} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

// Vehicles the user contacted and can now review.
function ReviewInvites() {
  const [invites, setInvites] = useState<ReviewInvite[]>([]);
  useFocusEffect(
    useCallback(() => {
      getReviewInvites().then(setInvites, () => {});
    }, []),
  );
  if (!invites.length) return null;
  return (
    <Card>
      <View style={{ gap: 2 }}>
        <Text style={styles.cardTitle}>Rate your recent rentals</Text>
        <Text style={styles.sub}>Help others choose. It takes 30 seconds.</Text>
      </View>
      {invites.map((i) => (
        <Pressable
          key={i.listing_id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/review/[id]', params: { id: i.listing_id } })}
          style={({ pressed }) => [styles.invite, pressed && { opacity: 0.8 }]}>
          <VehiclePhoto path={i.cover_photo} seed={i.listing_id} style={styles.inviteThumb} fit="cover" iconSize={20} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.inviteTitle} numberOfLines={1}>
              {i.title}
            </Text>
            <Text style={styles.sub}>{i.verified ? 'Verified hire · ' : ''}{i.town}</Text>
          </View>
          <Star size={20} color="#F59E0B" />
        </Pressable>
      ))}
    </Card>
  );
}

function LegalLinks() {
  return (
    <View style={styles.legal}>
      <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} hitSlop={6}>
        <Text style={styles.legalLink}>Privacy policy</Text>
      </Pressable>
      <Text style={styles.sub}>·</Text>
      <Pressable accessibilityRole="link" onPress={() => router.push('/terms')} hitSlop={6}>
        <Text style={styles.legalLink}>Terms of use</Text>
      </Pressable>
    </View>
  );
}

// Starts from the saved profile; remounted (via key) for a different user.
function ContactForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const { toast } = useFeedback();
  const initial = {
    name: profile.full_name,
    phone: profile.phone ?? '',
    sameWhatsapp: !profile.whatsapp || profile.whatsapp === profile.phone,
    whatsapp: profile.whatsapp ?? '',
  };
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [sameWhatsapp, setSameWhatsapp] = useState(initial.sameWhatsapp);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; whatsapp?: string }>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dirty =
    name !== initial.name ||
    phone !== initial.phone ||
    sameWhatsapp !== initial.sameWhatsapp ||
    (!sameWhatsapp && whatsapp !== initial.whatsapp);

  const save = async () => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'Enter your name';
    if (phone.trim() && !isValidLKPhone(phone)) e.phone = 'Enter a valid number, e.g. 077 123 4567';
    if (!sameWhatsapp && !isValidLKPhone(whatsapp)) e.whatsapp = 'Enter a valid WhatsApp number';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFormError(null);
    const p = phone.trim() ? formatLKPhone(phone) : null;
    const w = sameWhatsapp ? null : formatLKPhone(whatsapp);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), phone: p, whatsapp: w })
      .eq('id', profile.id);
    setBusy(false);
    if (error) {
      setFormError(friendlyError(error));
      return;
    }
    toast('Contact details saved');
    onSaved();
  };

  return (
    <Card>
      <Text style={styles.cardTitle}>Contact details</Text>
      <Text style={styles.sub}>
        Customers use these to call or WhatsApp you about your vehicles. Only signed-in people can see them.
      </Text>
      <Field
        label="Full name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setErrors((x) => ({ ...x, name: undefined }));
        }}
        placeholder="Your name"
        autoCapitalize="words"
        autoComplete="name"
        error={errors.name}
      />
      <Field
        label="Phone number"
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          setErrors((x) => ({ ...x, phone: undefined }));
        }}
        onBlur={() => phone.trim() && setPhone(formatLKPhone(phone))}
        placeholder="077 123 4567"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        hint={profile.phone ? undefined : 'Needed before you can list a vehicle.'}
        error={errors.phone}
      />
      <ToggleRow title="WhatsApp on the same number" value={sameWhatsapp} onChange={setSameWhatsapp} />
      {!sameWhatsapp ? (
        <Field
          label="WhatsApp number"
          value={whatsapp}
          onChangeText={(v) => {
            setWhatsapp(v);
            setErrors((x) => ({ ...x, whatsapp: undefined }));
          }}
          onBlur={() => whatsapp.trim() && setWhatsapp(formatLKPhone(whatsapp))}
          placeholder="077 123 4567"
          keyboardType="phone-pad"
          error={errors.whatsapp}
        />
      ) : null}
      {formError ? <Notice tone="danger" text={formError} /> : null}
      {dirty ? <Button label="Save changes" onPress={save} loading={busy} /> : null}
    </Card>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.heading}>Account</Text>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuRow}>
      {icon}
      <Text style={[styles.menuText, danger && { color: colors.danger }]}>{label}</Text>
      {!danger ? <ChevronRight size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.white, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 },
  heading: { fontSize: 24, fontWeight: font.bold, color: colors.ink },
  body: { padding: 16, gap: 12 },
  photoLinks: { flexDirection: 'row', gap: 16, paddingTop: 6 },
  photoLink: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
  photoHint: { fontSize: 13, color: colors.text2, lineHeight: 18, paddingHorizontal: 4, marginTop: -4 },
  name: { fontSize: 17, fontWeight: font.semibold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  cardTitle: { fontSize: 16, fontWeight: font.semibold, color: colors.ink },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteThumb: { width: 48, height: 48, borderRadius: 10 },
  inviteTitle: { fontSize: 15, fontWeight: font.semibold, color: colors.ink },
  legal: { flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 16 },
  legalLink: { fontSize: 13, color: colors.text2, textDecorationLine: 'underline' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  menuText: { flex: 1, fontSize: 15, fontWeight: font.medium, color: colors.ink },
});
