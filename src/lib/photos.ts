import * as ImagePicker from 'expo-image-picker';

import { base64ToBytes } from './format';
import { PHOTO_BUCKET, supabase } from './supabase';

export const MAX_PHOTOS = 8;

// A photo in the listing form: either already uploaded (id + path) or newly
// picked on this device (uri + bytes to upload on save).
export type PhotoItem = {
  key: string;
  uri: string;
  id?: string;
  path?: string;
  base64?: string | null;
  mimeType?: string;
};

export async function pickPhotos(remaining: number): Promise<PhotoItem[]> {
  if (remaining <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 0.7,
    base64: true,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, remaining).map((a, i) => ({
    key: `new-${Date.now()}-${i}`,
    uri: a.uri,
    base64: a.base64,
    mimeType: a.mimeType ?? 'image/jpeg',
  }));
}

async function readBytes(item: PhotoItem): Promise<Uint8Array> {
  if (item.base64) return base64ToBytes(item.base64);
  const res = await fetch(item.uri);
  return new Uint8Array(await res.arrayBuffer());
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
};

// Makes the listing's photos match `items` (in order): deletes removed ones,
// uploads new ones, and saves the order. Storage paths are
// <owner_id>/<listing_id>/<file> to satisfy the bucket policies.
// `onUploaded` reports each finished upload so a retry after a failure
// doesn't upload the same photo twice.
export async function syncListingPhotos(
  ownerId: string,
  listingId: string,
  items: PhotoItem[],
  existing: { id: string; path: string }[],
  onUploaded?: (key: string, saved: { id: string; path: string }) => void,
) {
  const keptIds = new Set(items.filter((i) => i.id).map((i) => i.id));
  const removed = existing.filter((e) => !keptIds.has(e.id));
  if (removed.length) {
    const { error } = await supabase
      .from('listing_photos')
      .delete()
      .in(
        'id',
        removed.map((r) => r.id),
      );
    if (error) throw error;
    await supabase.storage.from(PHOTO_BUCKET).remove(removed.map((r) => r.path));
  }

  for (const [position, item] of items.entries()) {
    if (item.id) {
      const { error } = await supabase
        .from('listing_photos')
        .update({ position })
        .eq('id', item.id);
      if (error) throw error;
      continue;
    }
    const mimeType = item.mimeType ?? 'image/jpeg';
    const ext = EXTENSIONS[mimeType] ?? 'jpg';
    const path = `${ownerId}/${listingId}/${Date.now()}-${position}.${ext}`;
    const bytes = await readBytes(item);
    const upload = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: false });
    if (upload.error) throw upload.error;
    const { data, error } = await supabase
      .from('listing_photos')
      .insert({ listing_id: listingId, path, position })
      .select('id')
      .single();
    if (error) throw error;
    onUploaded?.(item.key, { id: data.id as string, path });
  }
}
