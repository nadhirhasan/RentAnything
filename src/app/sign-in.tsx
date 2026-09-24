import { router, useLocalSearchParams } from 'expo-router';
import { Lock, MailCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout';
import { Button, Field, Notice, RoundIconButton } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { colors, font } from '@/theme';

const HEADINGS: Record<string, { title: string; text: string }> = {
  contact: {
    title: 'Sign in to contact the owner',
    text: 'Owners only get calls from signed-in people, so they know who is calling.',
  },
  list: {
    title: 'Sign in to list your vehicle',
    text: 'List your vehicles for free and get calls from people nearby.',
  },
};

const DEFAULT_HEADING = {
  title: 'Welcome to RentAnything',
  text: 'Find rental vehicles near you, or list your own.',
};

export default function SignInScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const heading = (reason && HEADINGS[reason]) || DEFAULT_HEADING;

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const submit = async () => {
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError('Enter your email and a password of at least 6 characters.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Enter your name.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        close();
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() } },
        });
        if (err) throw err;
        // With email confirmation on, there's no session until they confirm.
        if (data.session) close();
        else setCheckEmail(true);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen background={colors.white} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <RoundIconButton icon={X} label="Close" onPress={close} background="transparent" size={40} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.icon}>
            {checkEmail ? <MailCheck size={28} color={colors.primary} /> : <Lock size={28} color={colors.primary} />}
          </View>

          {checkEmail ? (
            <>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.text}>
                We sent a confirmation link to {email.trim()}. Open it, then come back and sign in.
              </Text>
              <Button
                label="Back to sign in"
                onPress={() => {
                  setCheckEmail(false);
                  setMode('signin');
                }}
                style={{ alignSelf: 'stretch' }}
              />
            </>
          ) : (
            <>
              <Text style={styles.title}>{mode === 'signup' ? 'Create your account' : heading.title}</Text>
              <Text style={styles.text}>{heading.text}</Text>

              <View style={{ gap: 14, alignSelf: 'stretch' }}>
                {mode === 'signup' ? (
                  <Field
                    label="Your name"
                    value={name}
                    onChangeText={setName}
                    placeholder="Kasun Perera"
                    autoComplete="name"
                    textContentType="name"
                  />
                ) : null}
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  secureTextEntry
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                  onSubmitEditing={submit}
                />
                {error ? <Notice tone="danger" text={error} /> : null}
                <Button label={mode === 'signup' ? 'Create account' : 'Sign in'} onPress={submit} loading={busy} />
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setError(null);
                }}
                style={styles.switch}>
                <Text style={styles.text}>{mode === 'signin' ? 'New here?' : 'Already have an account?'}</Text>
                <Text style={styles.link}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 8, paddingVertical: 6 },
  body: { alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingBottom: 32 },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 21, fontWeight: font.bold, color: colors.ink, textAlign: 'center' },
  text: { fontSize: 14, color: colors.text2, textAlign: 'center', lineHeight: 20 },
  switch: { flexDirection: 'row', gap: 4, paddingVertical: 8 },
  link: { fontSize: 14, fontWeight: font.semibold, color: colors.primary },
});
