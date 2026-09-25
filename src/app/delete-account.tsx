import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { useFeedback } from '@/components/feedback';
import { H, LegalPage, Li, P } from '@/components/legal';
import { Button, Notice } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/supabase';
import { deleteMyAccount } from '@/lib/trust';

// Public page (also linked from the Play Store listing) explaining how to
// delete an account and what gets deleted.
export default function DeleteAccountScreen() {
  const { session } = useAuth();
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      message: 'This permanently deletes your profile, listings, photos and reviews. This cannot be undone.',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount();
      toast('Your account was deleted', 'info');
      router.replace('/');
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <LegalPage title="Delete your account">
      <P>You can delete your RentAnything account and its data at any time.</P>
      <H>What is deleted</H>
      <Li>Your profile: name, email, phone and WhatsApp numbers.</Li>
      <Li>All your vehicle listings and their photos.</Li>
      <Li>Your messages, reviews, feedback, reports and contact history.</Li>
      <P>Everything is deleted straight away. Backups are overwritten within 30 days.</P>
      <H>How to delete</H>
      <Li>In the app: Account → Delete account.</Li>
      <Li>Or here: sign in, then tap the button below.</Li>
      {error ? <Notice tone="danger" text={error} /> : null}
      {session ? (
        <Button label="Delete my account" kind="danger" icon={Trash2} onPress={remove} loading={busy} />
      ) : (
        <Button label="Sign in to delete your account" onPress={() => router.push('/sign-in')} />
      )}
    </LegalPage>
  );
}
