import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
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

// Longest side of an uploaded photo. Plenty for a phone screen, and a
// 3–5 MB camera photo becomes roughly 200–400 KB.
export const MAX_PHOTO_SIDE = 1600;

// Shrinks and re-encodes a photo as JPEG. Re-encoding also drops EXIF data,
// which can include the GPS position where the photo was taken.
async function compress(asset: ImagePicker.ImagePickerAsset, index: number): Promise<PhotoItem> {
  const key = `new-${Date.now()}-${index}`;
  try {
    const ctx = ImageManipulator.manipulate(asset.uri);
    const { width = 0, height = 0 } = asset;
    if (width > MAX_PHOTO_SIDE || height > MAX_PHOTO_SIDE) {
      ctx.resize(width >= height ? { width: MAX_PHOTO_SIDE } : { height: MAX_PHOTO_SIDE });
    }
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: 0.72, format: SaveFormat.JPEG, base64: true });
    return { key, uri: saved.uri, base64: saved.base64, mimeType: 'image/jpeg' };
  } catch {
    // Fall back to the original file rather than failing the whole pick.
    return { key, uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
  }
}

export async function pickPhotos(remaining: number): Promise<PhotoItem[]> {
  if (remaining <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 1, // compressed once, below
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.slice(0, remaining).map(compress));
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
