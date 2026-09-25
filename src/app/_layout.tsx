import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FeedbackProvider } from '@/components/feedback';
import { AuthProvider, useAuth } from '@/lib/auth';
import { FiltersProvider } from '@/lib/filters';
import { LocationProvider } from '@/lib/location';
import { MessagesProvider } from '@/lib/messages';
import { registerForPush, useNotificationTaps } from '@/lib/push';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, font } from '@/theme';

export default function RootLayout() {
  if (!isSupabaseConfigured) return <NotConfigured />;

  return (
    <SafeAreaProvider>
      <FeedbackProvider>
        <AuthProvider>
          <MessagesProvider>
            <PushSetup />
            <LocationProvider>
              <FiltersProvider>
                <StatusBar style="dark" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                  }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="vehicle/[id]" />
                  <Stack.Screen name="filters" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="reset-password" />
                  <Stack.Screen name="admin" />
                  <Stack.Screen name="book/[id]" />
                  <Stack.Screen name="booking/[id]" />
                  <Stack.Screen name="dues" />
                  <Stack.Screen name="chat/[id]" />
                  <Stack.Screen name="admin-chat/[id]" />
                  <Stack.Screen name="review/[id]" />
                  <Stack.Screen name="privacy" />
                  <Stack.Screen name="terms" />
                  <Stack.Screen name="delete-account" />
                  <Stack.Screen name="listing/new" />
                  <Stack.Screen name="listing/[id]/edit" />
                </Stack>
              </FiltersProvider>
            </LocationProvider>
          </MessagesProvider>
        </AuthProvider>
      </FeedbackProvider>
    </SafeAreaProvider>
  );
}

// Registers this phone for push when the user has already allowed it, and
// opens the right screen when a notification is tapped.
function PushSetup() {
  const { session } = useAuth();
  const userId = session?.user.id;
  useNotificationTaps();
  useEffect(() => {
    if (userId) registerForPush(false);
  }, [userId]);
  return null;
}

function NotConfigured() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: font.bold, color: colors.ink }}>Supabase not configured</Text>
      <Text style={{ fontSize: 14, color: colors.text2, textAlign: 'center' }}>
        Copy .env.example to .env and fill in EXPO_PUBLIC_SUPABASE_URL and
        EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.
      </Text>
    </View>
  );
}
