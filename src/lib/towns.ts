// Sri Lankan towns with approximate centre coordinates. Used as a fallback
// when GPS is denied, to label a GPS position ("Near Kadawatha"), and for
// owners who pick a town instead of sharing their current location.

export type Town = { name: string; district: string; lat: number; lng: number };

export const TOWNS: Town[] = [
  { name: 'Colombo', district: 'Colombo', lat: 6.9271, lng: 79.8612 },
  { name: 'Dehiwala', district: 'Colombo', lat: 6.8511, lng: 79.8659 },
  { name: 'Mount Lavinia', district: 'Colombo', lat: 6.839, lng: 79.8656 },
  { name: 'Moratuwa', district: 'Colombo', lat: 6.773, lng: 79.8816 },
  { name: 'Nugegoda', district: 'Colombo', lat: 6.8649, lng: 79.8997 },
  { name: 'Maharagama', district: 'Colombo', lat: 6.848, lng: 79.9265 },
  { name: 'Kottawa', district: 'Colombo', lat: 6.8412, lng: 79.965 },
  { name: 'Homagama', district: 'Colombo', lat: 6.8441, lng: 80.0024 },
  { name: 'Battaramulla', district: 'Colombo', lat: 6.899, lng: 79.918 },
  { name: 'Rajagiriya', district: 'Colombo', lat: 6.909, lng: 79.896 },
  { name: 'Malabe', district: 'Colombo', lat: 6.9061, lng: 79.958 },
  { name: 'Kaduwela', district: 'Colombo', lat: 6.936, lng: 79.984 },
  { name: 'Avissawella', district: 'Colombo', lat: 6.9553, lng: 80.2044 },
  { name: 'Wattala', district: 'Gampaha', lat: 6.989, lng: 79.892 },
  { name: 'Kelaniya', district: 'Gampaha', lat: 6.9553, lng: 79.922 },
  { name: 'Kiribathgoda', district: 'Gampaha', lat: 6.978, lng: 79.929 },
  { name: 'Kadawatha', district: 'Gampaha', lat: 7.001, lng: 79.953 },
  { name: 'Ragama', district: 'Gampaha', lat: 7.028, lng: 79.917 },
  { name: 'Kandana', district: 'Gampaha', lat: 7.048, lng: 79.897 },
  { name: 'Ja-Ela', district: 'Gampaha', lat: 7.0744, lng: 79.8919 },
  { name: 'Gampaha', district: 'Gampaha', lat: 7.0873, lng: 79.999 },
  { name: 'Katunayake', district: 'Gampaha', lat: 7.17, lng: 79.884 },
  { name: 'Negombo', district: 'Gampaha', lat: 7.2083, lng: 79.8358 },
  { name: 'Minuwangoda', district: 'Gampaha', lat: 7.1667, lng: 79.95 },
  { name: 'Nittambuwa', district: 'Gampaha', lat: 7.144, lng: 80.096 },
  { name: 'Veyangoda', district: 'Gampaha', lat: 7.1553, lng: 80.0976 },
  { name: 'Mirigama', district: 'Gampaha', lat: 7.241, lng: 80.127 },
  { name: 'Panadura', district: 'Kalutara', lat: 6.7132, lng: 79.9026 },
  { name: 'Horana', district: 'Kalutara', lat: 6.7159, lng: 80.0626 },
  { name: 'Kalutara', district: 'Kalutara', lat: 6.5854, lng: 79.9607 },
  { name: 'Beruwala', district: 'Kalutara', lat: 6.4788, lng: 79.9828 },
  { name: 'Aluthgama', district: 'Kalutara', lat: 6.434, lng: 80.003 },
  { name: 'Kandy', district: 'Kandy', lat: 7.2906, lng: 80.6337 },
  { name: 'Peradeniya', district: 'Kandy', lat: 7.269, lng: 80.597 },
  { name: 'Katugastota', district: 'Kandy', lat: 7.317, lng: 80.626 },
  { name: 'Gampola', district: 'Kandy', lat: 7.164, lng: 80.577 },
  { name: 'Matale', district: 'Matale', lat: 7.4675, lng: 80.6234 },
  { name: 'Dambulla', district: 'Matale', lat: 7.8742, lng: 80.6511 },
  { name: 'Nuwara Eliya', district: 'Nuwara Eliya', lat: 6.9497, lng: 80.7891 },
  { name: 'Hatton', district: 'Nuwara Eliya', lat: 6.8916, lng: 80.5955 },
  { name: 'Kurunegala', district: 'Kurunegala', lat: 7.4863, lng: 80.3623 },
  { name: 'Kuliyapitiya', district: 'Kurunegala', lat: 7.469, lng: 80.04 },
  { name: 'Chilaw', district: 'Puttalam', lat: 7.5758, lng: 79.7953 },
  { name: 'Puttalam', district: 'Puttalam', lat: 8.0362, lng: 79.8283 },
  { name: 'Anuradhapura', district: 'Anuradhapura', lat: 8.3114, lng: 80.4037 },
  { name: 'Polonnaruwa', district: 'Polonnaruwa', lat: 7.9403, lng: 81.0188 },
  { name: 'Trincomalee', district: 'Trincomalee', lat: 8.5874, lng: 81.2152 },
  { name: 'Batticaloa', district: 'Batticaloa', lat: 7.7102, lng: 81.6924 },
  { name: 'Kalmunai', district: 'Ampara', lat: 7.4167, lng: 81.8167 },
  { name: 'Ampara', district: 'Ampara', lat: 7.2912, lng: 81.6724 },
  { name: 'Badulla', district: 'Badulla', lat: 6.9934, lng: 81.055 },
  { name: 'Bandarawela', district: 'Badulla', lat: 6.829, lng: 80.987 },
  { name: 'Ella', district: 'Badulla', lat: 6.8667, lng: 81.0466 },
  { name: 'Monaragala', district: 'Monaragala', lat: 6.8728, lng: 81.3507 },
  { name: 'Ratnapura', district: 'Ratnapura', lat: 6.6828, lng: 80.3992 },
  { name: 'Embilipitiya', district: 'Ratnapura', lat: 6.343, lng: 80.849 },
  { name: 'Kegalle', district: 'Kegalle', lat: 7.2513, lng: 80.3464 },
  { name: 'Galle', district: 'Galle', lat: 6.0535, lng: 80.221 },
  { name: 'Hikkaduwa', district: 'Galle', lat: 6.1395, lng: 80.1063 },
  { name: 'Ambalangoda', district: 'Galle', lat: 6.2355, lng: 80.0538 },
  { name: 'Matara', district: 'Matara', lat: 5.9549, lng: 80.555 },
  { name: 'Weligama', district: 'Matara', lat: 5.975, lng: 80.429 },
  { name: 'Tangalle', district: 'Hambantota', lat: 6.024, lng: 80.794 },
  { name: 'Hambantota', district: 'Hambantota', lat: 6.1241, lng: 81.1185 },
  { name: 'Jaffna', district: 'Jaffna', lat: 9.6615, lng: 80.0255 },
  { name: 'Kilinochchi', district: 'Kilinochchi', lat: 9.3803, lng: 80.377 },
  { name: 'Mullaitivu', district: 'Mullaitivu', lat: 9.2671, lng: 80.8142 },
  { name: 'Vavuniya', district: 'Vavuniya', lat: 8.7514, lng: 80.4971 },
  { name: 'Mannar', district: 'Mannar', lat: 8.981, lng: 79.9044 },
].sort((a, b) => a.name.localeCompare(b.name));

export const DEFAULT_TOWN = TOWNS.find((t) => t.name === 'Colombo')!;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function nearestTown(point: { lat: number; lng: number }): Town {
  let best = TOWNS[0];
  let bestKm = Infinity;
  for (const t of TOWNS) {
    const km = distanceKm(point, t);
    if (km < bestKm) {
      best = t;
      bestKm = km;
    }
  }
  return best;
}

export function searchTowns(query: string): Town[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOWNS;
  return TOWNS.filter(
    (t) => t.name.toLowerCase().includes(q) || t.district.toLowerCase().includes(q),
  );
}
