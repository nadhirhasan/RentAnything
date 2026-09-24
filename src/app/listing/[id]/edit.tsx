import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Car } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { EmptyState, Screen } from '@/components/layout';
import { ListingForm } from '@/components/listing-form';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fromListing } from '@/lib/listing-form';
import { friendlyError } from '@/lib/supabase';
import { getMyListing, type MyListing } from '@/lib/vehicles';
import { colors } from '@/theme';

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading: authLoading } = useAuth();
  const [listing, setListing] = useState<MyListing | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    getMyListing(id)
      .then(setListing)
      .catch((e) => setError(friendlyError(e)));
  }, [id, session]);

  if (authLoading) return null;
  if (!session) return <Redirect href={{ pathname: '/sign-in', params: { reason: 'list' } }} />;

  if (error || listing === null) {
    return (
      <Screen>
        <EmptyState
          icon={Car}
          title="Listing not found"
          text={error ?? 'It may have been deleted.'}
          action={<Button label="Back" onPress={() => router.back()} />}
        />
      </Screen>
    );
  }

  if (listing === undefined) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ListingForm
      initial={fromListing(listing)}
      listingId={listing.id}
      existingPhotos={listing.listing_photos.map((p) => ({ id: p.id, path: p.path }))}
    />
  );
}
