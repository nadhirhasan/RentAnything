// Push notifications (Android / iOS builds only). The database sends them
// through Expo's push service when a message or booking update arrives.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Expo Go can't receive remote notifications; a development or store build can.
export const pushSupported = Platform.OS !== 'web' && Constants.executionEnvironment !== 'storeClient';

let registeredToken: string | null = null;

if (pushSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function notificationsAllowed(): Promise<boolean> {
  if (!pushSupported) return false;
  return (await Notifications.getPermissionsAsync()).status === 'granted';
}

// Registers this device for the signed-in user. With ask = false it only
// registers when permission was already given (no prompt).
export async function registerForPush(ask: boolean): Promise<boolean> {
  if (!pushSupported || !Device.isDevice) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Messages and bookings',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1D4ED8',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      if (!ask) return false;
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return false;

    // Set by `eas init` (app.json → extra.eas.projectId).
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return false;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (error) return false;
    registeredToken = token;
    return true;
  } catch {
    return false;
  }
}

// Asks at a moment where it makes sense ("get the owner's reply").
export const askForNotifications = () => registerForPush(true);

// Before signing out, so the next person on this phone doesn't get our messages.
export async function unregisterPush() {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await supabase.rpc('unregister_push_token', { token }).then(
    () => {},
    () => {},
  );
}

// Opens the chat / booking a tapped notification points to.
export function useNotificationTaps() {
  useEffect(() => {
    if (!pushSupported) return;
    let mounted = true;
    const open = (n: Notifications.Notification) => {
      const url = n.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
    };
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (mounted && r?.notification) open(r.notification);
    });
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
}
