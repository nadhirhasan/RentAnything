import { supabase } from './supabase';

// Mirrors the enums in supabase/migrations/*_vehicle_listings.sql.
export type VehicleType =
  | 'car'
  | 'suv'
  | 'van'
  | 'buddy_van'
  | 'mini_bus'
  | 'bus'
  | 'double_cab'
  | 'lorry'
  | 'three_wheeler'
  | 'motorbike'
  | 'other';
export type Transmission = 'auto' | 'manual';
export type FuelType = 'petrol' | 'diesel' | 'hybrid' | 'electric';
export type FuelPolicy = 'same_level' | 'pay_used' | 'included';
export type DocumentKind = 'nic' | 'driving_licence' | 'proof_of_address' | 'guarantor';
export type ContactChannel = 'call' | 'whatsapp';
export type DriverMode = 'with_driver' | 'self_drive';
export type SortBy = 'recommended' | 'nearest' | 'price' | 'rating';

export const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'suv', label: 'SUV / Jeep' },
  { value: 'van', label: 'Van' },
  { value: 'buddy_van', label: 'Buddy van' },
  { value: 'mini_bus', label: 'Mini bus' },
  { value: 'bus', label: 'Bus' },
  { value: 'double_cab', label: 'Double cab' },
  { value: 'lorry', label: 'Lorry' },
  { value: 'three_wheeler', label: 'Three-wheeler' },
  { value: 'motorbike', label: 'Motorbike' },
  { value: 'other', label: 'Other' },
];

export const vehicleTypeLabel = (t: VehicleType) =>
  VEHICLE_TYPES.find((v) => v.value === t)?.label ?? t;

export const TRANSMISSIONS: { value: Transmission; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'manual', label: 'Manual' },
];

export const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: 'petrol', label: 'Petrol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'electric', label: 'Electric' },
];

export const FUEL_POLICIES: { value: FuelPolicy; label: string }[] = [
  { value: 'same_level', label: 'Return with the same fuel level' },
  { value: 'pay_used', label: 'Customer pays for fuel used' },
  { value: 'included', label: 'Fuel included in the price' },
];

export const DOCUMENTS: { value: DocumentKind; label: string }[] = [
  { value: 'nic', label: 'NIC' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'proof_of_address', label: 'Proof of address' },
  { value: 'guarantor', label: 'Guarantor' },
];

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchFilters = {
  text: string;
  types: VehicleType[];
  minSeats: number | null;
  acOnly: boolean;
  driverMode: DriverMode | null;
  doubleSeatOnly: boolean;
  maxPricePerDay: number | null;
  unlimitedKmOnly: boolean;
  radiusKm: number | null;
  sortBy: SortBy;
};

export const DEFAULT_FILTERS: SearchFilters = {
  text: '',
  types: [],
  minSeats: null,
  acOnly: false,
  driverMode: null,
  doubleSeatOnly: false,
  maxPricePerDay: null,
  unlimitedKmOnly: false,
  radiusKm: null,
  sortBy: 'recommended',
};

export function activeFilterCount(f: SearchFilters): number {
  return [
    f.types.length > 0,
    f.minSeats != null,
    f.acOnly,
    f.driverMode != null,
    f.doubleSeatOnly,
    f.maxPricePerDay != null,
    f.unlimitedKmOnly,
    f.radiusKm != null,
  ].filter(Boolean).length;
}

export type VehicleSummary = {
  id: string;
  title: string;
  town: string;
  distance_km: number;
  vehicle_type: VehicleType;
  make: string;
  model: string;
  year: number | null;
  seats: number;
  double_seat: boolean;
  has_ac: boolean;
  price_per_day: number;
  km_per_day: number | null;
  extra_km_rate: number | null;
  weekly_price: number | null;
  weekly_km: number | null;
  monthly_price: number | null;
  monthly_km: number | null;
  self_drive: boolean;
  driver_available: boolean;
  driver_price_per_day: number | null;
  min_days: number;
  owner_verified: number; // owner's rentals started with the code
  owner_score: number | null; // success score, null until 3 outcomes
  owner_tier: string | null;
  cover_photo: string | null;
  rating_avg: number | null; // only when there are 3+ reviews
  rating_count: number;
  total_count: number;
};

export const PAGE_SIZE = 20;

export async function searchVehicles(
  origin: { lat: number; lng: number },
  f: SearchFilters,
  page = 0,
  pageSize = PAGE_SIZE,
): Promise<VehicleSummary[]> {
  const { data, error } = await supabase.rpc('search_vehicles', {
    origin_lat: origin.lat,
    origin_lng: origin.lng,
    search_text: f.text.trim() || null,
    vehicle_types: f.types.length ? f.types : null,
    min_seats: f.minSeats,
    ac_only: f.acOnly,
    driver_mode: f.driverMode,
    double_seat_only: f.doubleSeatOnly,
    max_price_per_day: f.maxPricePerDay,
    unlimited_km_only: f.unlimitedKmOnly,
    radius_km: f.radiusKm,
    sort_by: f.sortBy,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
  if (error) throw error;
  return (data ?? []) as VehicleSummary[];
}

export async function countVehicles(origin: { lat: number; lng: number }, f: SearchFilters) {
  const rows = await searchVehicles(origin, f, 0, 1);
  return rows[0]?.total_count ?? 0;
}

// ---------------------------------------------------------------------------
// Vehicle page
// ---------------------------------------------------------------------------

export type VehicleDetail = {
  id: string;
  title: string;
  description: string;
  town: string;
  distance_km: number | null;
  is_live: boolean;
  is_mine: boolean;
  hidden_reason: 'reports' | 'admin' | null; // only for the owner
  owner_name: string;
  owner_avatar: string | null;
  owner_verified: number;
  owner_score: number | null;
  owner_tier: string | null;
  owner_listing_count: number;
  owner_rating_avg: number | null;
  owner_rating_count: number;
  rating_avg: number | null;
  rating_count: number;
  verified_count: number;
  photos: string[];
  vehicle_type: VehicleType;
  make: string;
  model: string;
  year: number | null;
  seats: number;
  double_seat: boolean;
  has_ac: boolean;
  transmission: Transmission | null;
  fuel_type: FuelType | null;
  price_per_day: number;
  km_per_day: number | null;
  extra_km_rate: number | null;
  min_days: number;
  weekly_price: number | null;
  weekly_km: number | null;
  monthly_price: number | null;
  monthly_km: number | null;
  self_drive: boolean;
  driver_available: boolean;
  driver_price_per_day: number | null;
  deposit: number | null;
  documents: DocumentKind[];
  fuel_policy: FuelPolicy | null;
  terms_notes: string;
};

export async function getVehicle(
  id: string,
  origin: { lat: number; lng: number } | null,
): Promise<VehicleDetail | null> {
  const { data, error } = await supabase
    .rpc('get_vehicle', {
      listing_id: id,
      origin_lat: origin?.lat ?? null,
      origin_lng: origin?.lng ?? null,
    })
    .maybeSingle();
  if (error) throw error;
  return (data as VehicleDetail | null) ?? null;
}

export async function getOwnerContact(listingId: string, channel: ContactChannel) {
  const { data, error } = await supabase
    .rpc('get_listing_contact', { listing_id: listingId, channel })
    .single();
  if (error) throw error;
  return data as { phone: string | null; whatsapp: string | null };
}

// ---------------------------------------------------------------------------
// Owner: my listings
// ---------------------------------------------------------------------------

export type VehicleDetailsRow = Omit<
  VehicleDetail,
  | 'id'
  | 'title'
  | 'description'
  | 'town'
  | 'distance_km'
  | 'is_live'
  | 'is_mine'
  | 'hidden_reason'
  | 'owner_name'
  | 'owner_avatar'
  | 'owner_verified'
  | 'owner_score'
  | 'owner_tier'
  | 'owner_listing_count'
  | 'owner_rating_avg'
  | 'owner_rating_count'
  | 'rating_avg'
  | 'rating_count'
  | 'verified_count'
  | 'photos'
>;

export type MyListing = {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  town: string;
  is_available: boolean;
  available_again_on: string | null;
  is_hidden: boolean;
  hidden_reason: 'reports' | 'admin' | null;
  created_at: string;
  vehicle_details: VehicleDetailsRow | null;
  listing_photos: { id: string; path: string; position: number }[];
};

const MY_LISTING_COLUMNS =
  'id, title, description, lat, lng, town, is_available, available_again_on, is_hidden, hidden_reason, created_at, vehicle_details(*), listing_photos(id, path, position)';

export async function getMyListings(): Promise<MyListing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select(MY_LISTING_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // vehicle_details is 1:1 (its key is listing_id), so PostgREST returns an
  // object, not an array; without generated types supabase-js can't know.
  return (data ?? []).map(sortPhotos) as unknown as MyListing[];
}

export async function getMyListing(id: string): Promise<MyListing | null> {
  const { data, error } = await supabase
    .from('listings')
    .select(MY_LISTING_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? (sortPhotos(data) as unknown as MyListing) : null;
}

function sortPhotos<T extends { listing_photos: { position: number }[] }>(l: T): T {
  return { ...l, listing_photos: [...l.listing_photos].sort((a, b) => a.position - b.position) };
}

// Same rule as public.is_live() in SQL (minus the admin-only hidden flag).
export function isSwitchedOn(
  l: Pick<MyListing, 'is_available' | 'available_again_on'>,
  today: string,
): boolean {
  return l.is_available || (l.available_again_on != null && l.available_again_on <= today);
}

export async function setAvailability(id: string, on: boolean, backOn: string | null) {
  const { error } = await supabase
    .from('listings')
    .update({ is_available: on, available_again_on: on ? null : backOn })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteListing(id: string) {
  const { data: photos } = await supabase.from('listing_photos').select('path').eq('listing_id', id);
  const { error } = await supabase.from('listings').delete().eq('id', id);
  if (error) throw error;
  if (photos?.length) {
    await supabase.storage.from('listing-photos').remove(photos.map((p) => p.path));
  }
}

export type ListingInput = {
  title: string;
  description: string;
  lat: number;
  lng: number;
  town: string;
  is_available: boolean;
  available_again_on: string | null;
};

export type VehicleInput = {
  vehicle_type: VehicleType;
  make: string;
  model: string;
  year: number | null;
  seats: number;
  double_seat: boolean;
  has_ac: boolean;
  transmission: Transmission | null;
  fuel_type: FuelType | null;
  price_per_day: number;
  km_per_day: number | null;
  extra_km_rate: number | null;
  min_days: number;
  weekly_price: number | null;
  weekly_km: number | null;
  monthly_price: number | null;
  monthly_km: number | null;
  self_drive: boolean;
  driver_available: boolean;
  driver_price_per_day: number | null;
  deposit: number | null;
  documents: DocumentKind[];
  fuel_policy: FuelPolicy | null;
  terms_notes: string;
};

export async function saveVehicleListing(
  listing: ListingInput,
  details: VehicleInput,
  listingId: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('save_vehicle_listing', {
    listing,
    details,
    listing_id: listingId,
  });
  if (error) throw error;
  return data as string;
}
