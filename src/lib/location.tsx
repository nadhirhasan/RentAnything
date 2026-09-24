import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { DEFAULT_TOWN, nearestTown, type Town } from './towns';

export type Place = {
  lat: number;
  lng: number;
  label: string; // e.g. "Kadawatha, Gampaha"
  source: 'gps' | 'town' | 'default';
};

type LocationState = {
  place: Place | null; // null while the first GPS lookup is running
  status: 'locating' | 'ready' | 'denied' | 'error';
  locateWithGps: () => Promise<void>;
  chooseTown: (town: Town) => void;
};

const LocationContext = createContext<LocationState | null>(null);

const townPlace = (t: Town, source: Place['source']): Place => ({
  lat: t.lat,
  lng: t.lng,
  label: `${t.name}, ${t.district}`,
  source,
});

// Current GPS position (asks for permission). Throws 'denied' if refused.
export async function getGpsPosition(): Promise<{ lat: number; lng: number }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('denied');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [status, setStatus] = useState<LocationState['status']>('locating');

  // State is only set once the GPS lookup settles, so this is safe to start
  // from an effect.
  const resolveGps = useCallback(
    () =>
      getGpsPosition().then(
        (pos) => {
          const town = nearestTown(pos);
          setPlace({ ...pos, label: `Near ${town.name}, ${town.district}`, source: 'gps' });
          setStatus('ready');
        },
        (e) => {
          setStatus(e instanceof Error && e.message === 'denied' ? 'denied' : 'error');
          // Keep searching from somewhere sensible; the user can pick a town.
          setPlace((p) => p ?? townPlace(DEFAULT_TOWN, 'default'));
        },
      ),
    [],
  );

  const locateWithGps = useCallback(async () => {
    setStatus('locating');
    await resolveGps();
  }, [resolveGps]);

  const chooseTown = useCallback((town: Town) => {
    setPlace(townPlace(town, 'town'));
    setStatus('ready');
  }, []);

  useEffect(() => {
    resolveGps();
  }, [resolveGps]);

  return (
    <LocationContext.Provider value={{ place, status, locateWithGps, chooseTown }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useUserLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useUserLocation must be used inside LocationProvider');
  return ctx;
}
