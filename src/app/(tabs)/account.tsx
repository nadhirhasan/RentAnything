import { router } from 'expo-router';
import { Car, ChevronRight, CircleCheck, LogOut } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen, SignInPrompt } from '@/components/layout';
import { Button, Card, Field, Notice, ToggleRow } from '@/components/ui';
import { useAuth, type Profile } from '@/lib/auth';
import { friendlyError, supabase } from '@/lib/supabase';
import { colors, font } from '@/theme';

const PHONE_RE = /^\+?[0-9 ]{9,16}$/;

export default function AccountScreen() {
  const { session, profile, refreshProfile } = useAuth();

  if (!session) {
    return (
      <Screen>
        <Header />
        <SignInPrompt
          title="Your account"
          text="Sign in to contact owners and to list your own vehicles."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{(profile?.full_name || session.user.email || '?')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile?.full_name || 'Your name'}</Text>
            <Text style={styles.sub}>{session.user.email}</Text>
          </View>
        </Card>

        {profile ? (
          <ContactForm key={profile.id} profile={profile} onSaved={refreshProfile} />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}

        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <MenuRow icon={<Car size={20} color={colors.ink} />} label="My vehicles" onPress={() => router.navigate('/my-vehicles')} />
          <MenuRow
            icon={<LogOut size={20} color={colors.danger} />}
            label="Sign out"
            danger
            onPress={() => supabase.auth.signOut()}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

// Starts from the saved profile; remounted (via key) for a different user.
function ContactForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [name, setName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [sameWhatsapp, setSameWhatsapp] = useState(!profile.whatsapp || profile.whatsapp === profile.phone);
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'primary' | 'danger'; text: string } | null>(null);

  const save = async () => {
    setMessage(null);
    const p = phone.trim();
    const w = sameWhatsapp ? '' : whatsapp.trim();
    if (p && !PHONE_RE.test(p)) {
      setMessage({ tone: 'danger', text: 'Enter a valid phone number, e.g. 077 123 4567.' });
      return;
    }
    if (w && !PHONE_RE.test(w)) {
      setMessage({ tone: 'danger', text: 'Enter a valid WhatsApp number.' });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), phone: p || null, whatsapp: w || null })
      .eq('id', profile.id);
    setBusy(false);
    if (error) setMessage({ tone: 'danger', text: friendlyError(error) });
    else {
      setMessage({ tone: 'primary', text: 'Saved.' });
      onSaved();
    }
  };

  return (
    <Card>
      <Text style={styles.cardTitle}>Contact details</Text>
      <Text style={styles.sub}>
        Customers use these to call or WhatsApp you about your vehicles. Only signed-in people can see them.
      </Text>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" />
      <Field
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="077 123 4567"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      <ToggleRow title="WhatsApp on the same number" value={sameWhatsapp} onChange={setSameWhatsapp} />
      {!sameWhatsapp ? (
        <Field
          label="WhatsApp number"
          value={whatsapp}
          onChangeText={setWhatsapp}
          placeholder="077 123 4567"
          keyboardType="phone-pad"
        />
      ) : null}
      {message ? (
        <Notice tone={message.tone} icon={message.tone === 'primary' ? CircleCheck : undefined} text={message.text} />
      ) : null}
      <Button label="Save" onPress={save} loading={busy} />
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
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 20, fontWeight: font.bold, color: colors.primary },
  name: { fontSize: 17, fontWeight: font.semibold, color: colors.ink },
  sub: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  cardTitle: { fontSize: 16, fontWeight: font.semibold, color: colors.ink },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  menuText: { flex: 1, fontSize: 15, fontWeight: font.medium, color: colors.ink },
});
