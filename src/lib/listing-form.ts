// State, validation and conversion for the 4-step "Add vehicle" form.
// Type-only imports keep this file runnable under `node --test`.
import type { PhotoItem } from './photos';
import type {
  DocumentKind,
  FuelPolicy,
  FuelType,
  ListingInput,
  MyListing,
  Transmission,
  VehicleInput,
  VehicleType,
} from './vehicles';

export type FormState = {
  // Step 1: vehicle
  vehicle_type: VehicleType | null;
  make: string;
  model: string;
  year: string;
  seats: number;
  double_seat: boolean;
  has_ac: boolean;
  transmission: Transmission | null;
  fuel_type: FuelType | null;
  // Step 2: pricing (amounts kept as typed text)
  price_per_day: string;
  unlimited_km: boolean;
  km_per_day: string;
  extra_km_rate: string;
  min_days: number;
  weekly_on: boolean;
  weekly_price: string;
  weekly_km: string;
  monthly_on: boolean;
  monthly_price: string;
  monthly_km: string;
  // Step 3: driver & terms
  self_drive: boolean;
  driver_available: boolean;
  driver_price_per_day: string;
  deposit: string;
  documents: DocumentKind[];
  fuel_policy: FuelPolicy | null;
  terms_notes: string;
  // Step 4: photos & location
  photos: PhotoItem[];
  lat: number | null;
  lng: number | null;
  town: string;
  title: string;
  title_edited: boolean;
  description: string;
  is_available: boolean;
  available_again_on: string | null;
};

export const STEPS = ['Vehicle', 'Pricing', 'Driver & terms', 'Photos & location'] as const;

export const EMPTY_FORM: FormState = {
  vehicle_type: null,
  make: '',
  model: '',
  year: '',
  seats: 5,
  double_seat: false,
  has_ac: true,
  transmission: 'auto',
  fuel_type: 'petrol',
  price_per_day: '',
  unlimited_km: false,
  km_per_day: '100',
  extra_km_rate: '',
  min_days: 1,
  weekly_on: false,
  weekly_price: '',
  weekly_km: '',
  monthly_on: false,
  monthly_price: '',
  monthly_km: '',
  self_drive: true,
  driver_available: false,
  driver_price_per_day: '',
  deposit: '',
  documents: [],
  fuel_policy: null,
  terms_notes: '',
  photos: [],
  lat: null,
  lng: null,
  town: '',
  title: '',
  title_edited: false,
  description: '',
  is_available: true,
  available_again_on: null,
};

const num = (s: string): number | null => {
  const digits = s.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
};
const text = (n: number | null | undefined) => (n == null ? '' : String(n));

export function suggestTitle(f: Pick<FormState, 'vehicle_type' | 'make' | 'model' | 'seats' | 'double_seat' | 'has_ac'>) {
  const name = [f.make.trim(), f.model.trim()].filter(Boolean).join(' ');
  if (!name) return '';
  const parts = [f.vehicle_type === 'buddy_van' ? `${name} Buddy Van` : name];
  if (f.double_seat && f.vehicle_type === 'buddy_van') parts.push('Double seat');
  if (f.vehicle_type && ['van', 'mini_bus', 'bus'].includes(f.vehicle_type)) parts.push(`${f.seats} seats`);
  if (f.has_ac) parts.push('AC');
  return parts.join(' · ');
}

export type Errors = Partial<Record<keyof FormState | 'phone', string>>;

export function validateStep(step: number, f: FormState, currentYear = new Date().getFullYear()): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (!f.vehicle_type) e.vehicle_type = 'Choose the vehicle type';
    if (!f.make.trim()) e.make = 'Required';
    if (!f.model.trim()) e.model = 'Required';
    const year = num(f.year);
    if (f.year.trim() && (year == null || year < 1950 || year > currentYear + 1))
      e.year = `Enter a year between 1950 and ${currentYear + 1}`;
    if (f.seats < 1 || f.seats > 100) e.seats = 'Between 1 and 100';
  }
  if (step === 1) {
    if (!num(f.price_per_day)) e.price_per_day = 'Enter the price per day';
    if (!f.unlimited_km) {
      if (!num(f.km_per_day)) e.km_per_day = 'Enter free km per day';
      if (num(f.extra_km_rate) == null) e.extra_km_rate = 'Enter the extra km charge';
    }
    if (f.weekly_on && !num(f.weekly_price)) e.weekly_price = 'Enter the 7-day price';
    if (f.monthly_on && !num(f.monthly_price)) e.monthly_price = 'Enter the 30-day price';
  }
  if (step === 2) {
    if (!f.self_drive && !f.driver_available)
      e.self_drive = 'Turn on self-drive, a driver, or both';
    if (f.driver_available && num(f.driver_price_per_day) == null)
      e.driver_price_per_day = 'Enter the driver price (0 if included)';
  }
  if (step === 3) {
    if (f.lat == null || f.lng == null || !f.town) e.town = 'Set where the vehicle is parked';
    const t = f.title.trim();
    if (t.length < 3 || t.length > 120) e.title = 'Title must be 3–120 characters';
  }
  return e;
}

export function toInputs(f: FormState): { listing: ListingInput; details: VehicleInput } {
  const kmLimited = !f.unlimited_km;
  return {
    listing: {
      title: f.title.trim(),
      description: f.description.trim(),
      lat: f.lat!,
      lng: f.lng!,
      town: f.town,
      is_available: f.is_available,
      available_again_on: f.is_available ? null : f.available_again_on,
    },
    details: {
      vehicle_type: f.vehicle_type!,
      make: f.make.trim(),
      model: f.model.trim(),
      year: num(f.year),
      seats: f.seats,
      double_seat: f.vehicle_type === 'buddy_van' && f.double_seat,
      has_ac: f.has_ac,
      transmission: f.transmission,
      fuel_type: f.fuel_type,
      price_per_day: num(f.price_per_day)!,
      km_per_day: kmLimited ? num(f.km_per_day) : null,
      extra_km_rate: kmLimited ? num(f.extra_km_rate) : null,
      min_days: f.min_days,
      weekly_price: f.weekly_on ? num(f.weekly_price) : null,
      weekly_km: f.weekly_on ? num(f.weekly_km) : null,
      monthly_price: f.monthly_on ? num(f.monthly_price) : null,
      monthly_km: f.monthly_on ? num(f.monthly_km) : null,
      self_drive: f.self_drive,
      driver_available: f.driver_available,
      driver_price_per_day: f.driver_available ? num(f.driver_price_per_day) : null,
      deposit: num(f.deposit),
      documents: f.documents,
      fuel_policy: f.fuel_policy,
      terms_notes: f.terms_notes.trim(),
    },
  };
}

export function fromListing(l: MyListing): FormState {
  const v = l.vehicle_details;
  if (!v) return { ...EMPTY_FORM, title: l.title, description: l.description };
  return {
    vehicle_type: v.vehicle_type,
    make: v.make,
    model: v.model,
    year: text(v.year),
    seats: v.seats,
    double_seat: v.double_seat,
    has_ac: v.has_ac,
    transmission: v.transmission,
    fuel_type: v.fuel_type,
    price_per_day: text(v.price_per_day),
    unlimited_km: v.km_per_day == null,
    km_per_day: text(v.km_per_day ?? 100),
    extra_km_rate: text(v.extra_km_rate),
    min_days: v.min_days,
    weekly_on: v.weekly_price != null,
    weekly_price: text(v.weekly_price),
    weekly_km: text(v.weekly_km),
    monthly_on: v.monthly_price != null,
    monthly_price: text(v.monthly_price),
    monthly_km: text(v.monthly_km),
    self_drive: v.self_drive,
    driver_available: v.driver_available,
    driver_price_per_day: text(v.driver_price_per_day),
    deposit: text(v.deposit),
    documents: v.documents,
    fuel_policy: v.fuel_policy,
    terms_notes: v.terms_notes,
    photos: l.listing_photos.map((p) => ({ key: p.id, id: p.id, path: p.path, uri: '' })),
    lat: l.lat,
    lng: l.lng,
    town: l.town,
    title: l.title,
    title_edited: true,
    description: l.description,
    is_available: l.is_available,
    available_again_on: l.available_again_on,
  };
}
