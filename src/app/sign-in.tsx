import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyRound, Lock, MailCheck, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useFeedback } from '@/components/feedback';
import { Screen } from '@/components/layout';
import { Button, Field, Notice, RoundIconButton } from '@/components/ui';
import { isValidEmail, MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/format';
import { friendlyError, supabase } from '@/lib/supabase';
import { colors, font } from '@/theme';

type Mode = 'signin' | 'signup' | 'forgot';

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
  title: 'Welcome back',
  text: 'Sign in to contact owners and manage your vehicles.',
};

type Errors = Partial<Record<'name' | 'email' | 'password' | 'confirm', string>>;

export default function SignInScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const heading = (reason && HEADINGS[reason]) || DEFAULT_HEADING;
  const { toast } = useFeedback();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<{ email: string; kind: 'confirm' | 'reset' } | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const switchMode = (m: Mode) => {
    setMode(m);
    setErrors({});
    setFormError(null);
    setPassword('');
    setConfirm('');
  };

  // Typing in a field clears its error.
  const edit = (key: keyof Errors, set: (v: string) => void) => (v: string) => {
    set(v);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    setFormError(null);
  };

  const validate = (): boolean => {
    const e: Errors = {};
    if (mode === 'signup' && !name.trim()) e.name = 'Enter your name';
    if (!isValidEmail(email)) e.email = 'Enter a valid email address';
    if (mode === 'signin' && !password) e.password = 'Enter your password';
    if (mode === 'signup') {
      const problem = passwordProblem(password);
      if (problem) e.password = problem;
      if (!confirm) e.confirm = 'Enter your password again';
      else if (confirm !== password) e.confirm = "Passwords don't match";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (busy || !validate()) return;
    setBusy(true);
    setFormError(null);
    const cleanEmail = email.trim().toLowerCase();
    try {
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        const first = (data.user?.user_metadata?.full_name as string | undefined)?.split(' ')[0];
        toast(first ? `Welcome back, ${first}` : 'Signed in');
        close();
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: name.trim() } },
        });
        if (error) throw error;
        // With email confirmation on, there's no session until they confirm.
        if (data.session) {
          toast('Account created');
          close();
        } else {
          setSentTo({ email: cleanEmail, kind: 'confirm' });
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: Linking.createURL('/reset-password'),
        });
        if (error) throw error;
        setSentTo({ email: cleanEmail, kind: 'reset' });
      }
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : heading.title;
  const text =
    mode === 'signup'
      ? 'It takes less than a minute. Listing vehicles is free.'
      : mode === 'forgot'
        ? "Enter your account's email and we'll send you a link to set a new password."
        : heading.text;

  return (
    <Screen background={colors.white} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <RoundIconButton icon={X} label="Close" onPress={close} background="transparent" size={40} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {sentTo ? (
            <>
              <View style={styles.icon}>
                <MailCheck size={28} color={colors.primary} />
              </View>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.text}>
                {sentTo.kind === 'confirm'
                  ? `We sent a confirmation link to ${sentTo.email}. Open it, then come back and sign in.`
                  : `If an account exists for ${sentTo.email}, we sent a link to set a new password.`}
              </Text>
              <Text style={styles.small}>Can&apos;t find it? Check your spam folder.</Text>
              <Button
                label="Back to sign in"
                onPress={() => {
                  setSentTo(null);
                  switchMode('signin');
                }}
                style={{ alignSelf: 'stretch' }}
              />
            </>
          ) : (
            <>
              <View style={styles.icon}>
                {mode === 'forgot' ? <KeyRound size={28} color={colors.primary} /> : <Lock size={28} color={colors.primary} />}
              </View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.text}>{text}</Text>

              <View style={styles.form}>
                {mode === 'signup' ? (
                  <Field
                    label="Full name"
                    value={name}
                    onChangeText={edit('name', setName)}
                    placeholder="Kasun Perera"
                    autoComplete="name"
                    textContentType="name"
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                    submitBehavior="submit"
                    error={errors.name}
                  />
                ) : null}
                <Field
                  inputRef={emailRef}
                  label="Email"
                  value={email}
                  onChangeText={edit('email', setEmail)}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType={mode === 'forgot' ? 'send' : 'next'}
                  onSubmitEditing={() => (mode === 'forgot' ? submit() : passwordRef.current?.focus())}
                  submitBehavior={mode === 'forgot' ? 'blurAndSubmit' : 'submit'}
                  error={errors.email}
                />
                {mode !== 'forgot' ? (
                  <Field
                    inputRef={passwordRef}
                    label="Password"
                    password
                    value={password}
                    onChangeText={edit('password', setPassword)}
                    placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                    returnKeyType={mode === 'signup' ? 'next' : 'go'}
                    onSubmitEditing={() => (mode === 'signup' ? confirmRef.current?.focus() : submit())}
                    submitBehavior={mode === 'signup' ? 'submit' : 'blurAndSubmit'}
                    hint={mode === 'signup' ? 'Use at least 8 characters with letters and numbers.' : undefined}
                    error={errors.password}
                  />
                ) : null}
                {mode === 'signup' ? (
                  <Field
                    inputRef={confirmRef}
                    label="Confirm password"
                    password
                    value={confirm}
                    onChangeText={edit('confirm', setConfirm)}
                    placeholder="Type it again"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="go"
                    onSubmitEditing={submit}
                    error={errors.confirm}
                  />
                ) : null}
                {mode === 'signin' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => switchMode('forgot')}
                    hitSlop={8}
                    style={{ alignSelf: 'flex-end' }}>
                    <Text style={styles.link}>Forgot password?</Text>
                  </Pressable>
                ) : null}
                {formError ? <Notice tone="danger" text={formError} /> : null}
                <Button
                  label={mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
                  onPress={submit}
                  loading={busy}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                style={styles.switch}>
                <Text style={styles.text}>
                  {mode === 'signin' ? 'New to RentAnything?' : 'Already have an account?'}
                </Text>
                <Text style={styles.link}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</Text>
              </Pressable>
              {mode === 'signup' ? (
                <Text style={styles.small}>
                  By creating an account you agree to our{' '}
                  <Text style={styles.smallLink} onPress={() => router.push('/terms')} accessibilityRole="link">
                    Terms of use
                  </Text>{' '}
                  and{' '}
                  <Text style={styles.smallLink} onPress={() => router.push('/privacy')} accessibilityRole="link">
                    Privacy policy
                  </Text>
                  .
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 8, paddingVertical: 6 },
  body: { alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingBottom: 32 },
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
  small: { fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 },
  smallLink: { color: colors.text2, textDecorationLine: 'underline' },
  form: { gap: 16, alignSelf: 'stretch', marginTop: 6 },
  switch: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 8 },
  link: { fontSize: 14, lineHeight: 20, fontWeight: font.semibold, color: colors.primary },
});
