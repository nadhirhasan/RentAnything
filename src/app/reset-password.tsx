import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { KeyRound, TriangleAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useFeedback } from '@/components/feedback';
import { EmptyState, Screen } from '@/components/layout';
import { Button, Field, Notice } from '@/components/ui';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/format';
import { friendlyError, supabase } from '@/lib/supabase';
import { colors, font } from '@/theme';

// Reads the tokens Supabase puts in the password-reset link, either as
// #access_token=…&refresh_token=… (implicit flow) or ?code=… (PKCE).
function parseRecoveryUrl(url: string) {
  const params = new URLSearchParams();
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.split('?')[1] ?? '';
  for (const part of [query, hash]) {
    new URLSearchParams(part).forEach((v, k) => params.set(k, v));
  }
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    code: params.get('code'),
    error: params.get('error_description'),
  };
}

// Opened from the "Reset your password" email.
export default function ResetPasswordScreen() {
  const nativeUrl = Linking.useLinkingURL();
  const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : nativeUrl;
  const { toast } = useFeedback();

  const [status, setStatus] = useState<{ state: 'checking' | 'ready' | 'invalid'; message?: string }>({
    state: 'checking',
  });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!url) return;
    const { accessToken, refreshToken, code, error } = parseRecoveryUrl(url);
    const start = error
      ? Promise.reject(new Error(error))
      : code
        ? supabase.auth.exchangeCodeForSession(code)
        : accessToken && refreshToken
          ? supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          : Promise.reject(new Error('This link is missing its sign-in details.'));
    start
      .then((res) => {
        if (res && 'error' in res && res.error) throw res.error;
        setStatus({ state: 'ready' });
      })
      .catch((e) => setStatus({ state: 'invalid', message: friendlyError(e) }));
  }, [url]);

  const save = async () => {
    const e: typeof errors = {};
    const problem = passwordProblem(password);
    if (problem) e.password = problem;
    if (confirm !== password) e.confirm = "Passwords don't match";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFormError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setFormError(friendlyError(error));
      return;
    }
    toast('Password updated. You are signed in.');
    router.replace('/');
  };

  if (status.state === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status.state === 'invalid') {
    return (
      <Screen background={colors.white}>
        <EmptyState
          icon={TriangleAlert}
          title="This link has expired"
          text={`Reset links work once and expire after an hour. Request a new one from the sign-in screen.${status.message ? `\n\n(${status.message})` : ''}`}
          action={
            <Button
              label="Go to sign in"
              onPress={() => router.replace('/sign-in')}
              style={{ alignSelf: 'stretch' }}
            />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen background={colors.white}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.icon}>
          <KeyRound size={28} color={colors.primary} />
        </View>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.text}>Choose a password you don&apos;t use anywhere else.</Text>
        <View style={{ gap: 16, alignSelf: 'stretch' }}>
          <Field
            label="New password"
            password
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setErrors((x) => ({ ...x, password: undefined }));
            }}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => confirmRef.current?.focus()}
            hint="Use at least 8 characters with letters and numbers."
            error={errors.password}
          />
          <Field
            inputRef={confirmRef}
            label="Confirm new password"
            password
            value={confirm}
            onChangeText={(v) => {
              setConfirm(v);
              setErrors((x) => ({ ...x, confirm: undefined }));
            }}
            placeholder="Type it again"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={save}
            error={errors.confirm}
          />
          {formError ? <Notice tone="danger" text={formError} /> : null}
          <Button label="Save new password" onPress={save} loading={busy} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { alignItems: 'center', gap: 14, padding: 24, paddingTop: 48 },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: font.bold, color: colors.ink, textAlign: 'center' },
  text: { fontSize: 14, color: colors.text2, textAlign: 'center', lineHeight: 20 },
});
