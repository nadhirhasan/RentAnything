import { Tabs } from 'expo-router/js-tabs';
import { CalendarCheck, Car, CircleUser, Compass, MessageCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { getBookingBadge } from '@/lib/bookings';
import { useMessages } from '@/lib/messages';
import { colors, font } from '@/theme';

// Booking requests waiting for the owner, checked every minute and when the
// app comes back to the foreground (there are no push notifications yet).
function useBookingBadge() {
  const { session } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const check = () =>
      getBookingBadge().then(
        (n) => active && setCount(n),
        () => {},
      );
    check();
    const timer = setInterval(check, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      active = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [session]);
  return session ? count : 0;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const badge = useBookingBadge();
  const { unread } = useMessages();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 10, lineHeight: 13, fontWeight: font.semibold },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.white,
          height: 64 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom + 4,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => <Compass color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarIcon: ({ color, size }) => <CalendarCheck color={color} size={size} />,
          tabBarBadge: badge > 0 ? badge : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, fontSize: 11 },
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
          tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, fontSize: 11 },
        }}
      />
      <Tabs.Screen
        name="my-vehicles"
        options={{
          title: 'My vehicles',
          tabBarIcon: ({ color, size }) => <Car color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => <CircleUser color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
