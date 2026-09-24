import { Redirect } from 'expo-router';

import { ListingForm } from '@/components/listing-form';
import { useAuth } from '@/lib/auth';
import { EMPTY_FORM } from '@/lib/listing-form';

export default function NewListingScreen() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href={{ pathname: '/sign-in', params: { reason: 'list' } }} />;
  return <ListingForm initial={EMPTY_FORM} listingId={null} existingPhotos={[]} />;
}
