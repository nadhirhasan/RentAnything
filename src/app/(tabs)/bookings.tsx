import { router, useFocusEffect } from 'expo-router';
import { CalendarCheck, Inbox } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { BookingCard, DuesBanner } from '@/components/booking';
import { EmptyState, Screen, SignInPrompt } from '@/components/layout';
import { Button, Segmented, Skeleton } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getMyBookings, getMyDues, type BookingListItem, type MyDues } from '@/lib/bookings';
import { friendlyError } from '@/lib/supabase';
import { colors, font, radius } from '@/theme';

type Tab = 'trips' | 'requests';

type Data = { trips: BookingListItem[]; requests: BookingListItem[]; dues: MyDues | null };

export default function BookingsScreen() {
  const { session } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // null = not chosen yet: open on Requests when an owner has something to answer.
  const [picked, setPicked] = useState<Tab | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [trips, requests, dues] = await Promise.all([
        getMyBookings(false),
        getMyBookings(true),
        getMyDues().catch(() => null),
      ]);
      setData({ trips, requests, dues });
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!session) {
    return (
      <Screen>
        <Header />
        <SignInPrompt
          title="Your bookings"
          text="Sign in to request vehicles and see your bookings. Owners see requests for their vehicles here."
        />
      </Screen>
    );
  }

  const waiting = data?.requests.filter((r) => r.needs_action).length ?? 0;
  const tab: Tab = picked ?? (waiting > 0 ? 'requests' : 'trips');
  const items = tab === 'trips' ? data?.trips : data?.requests;

  return (
    <Screen>
      <Header />
      <View style={styles.tabs}>
        <Segmented
          options={[
            { value: 'trips', label: 'My trips' },
            { value: 'requests', label: waiting ? `Requests (${waiting})` : 'Requests' },
          ]}
          value={tab}
          onChange={(v) => setPicked(v as Tab)}
        />
      </View>
      {items == null ? (
        error ? (
          <EmptyState
            icon={CalendarCheck}
            title="Couldn't load your bookings"
            text={error}
            action={<Button label="Try again" onPress={load} />}
          />
        ) : (
          <View style={{ padding: 16, gap: 12 }}>
            <Skeleton style={{ height: 96, borderRadius: radius.lg }} />
            <Skeleton style={{ height: 96, borderRadius: radius.lg }} />
          </View>
        )
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListHeaderComponent={tab === 'requests' ? <DuesBanner dues={data?.dues ?? null} /> : null}
          ListEmptyComponent={
            tab === 'trips' ? (
              <EmptyState
                icon={CalendarCheck}
                title="No trips yet"
                text="Find a vehicle and tap Request to book. You pay the owner in cash when you pick it up."
                action={<Button label="Find a vehicle" onPress={() => router.navigate('/')} />}
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title="No requests yet"
                text="When customers ask to book your vehicles, the requests show up here."
              />
            )
          }
          renderItem={({ item }) => <BookingCard item={item} role={tab === 'trips' ? 'customer' : 'owner'} />}
        />
      )}
    </Screen>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.heading}>Bookings</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, backgroundColor: colors.white },
  heading: { fontSize: 24, fontWeight: font.bold, color: colors.ink },
  tabs: { paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.white },
});
