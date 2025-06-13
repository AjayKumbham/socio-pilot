import { supabase } from '../integrations/supabase/client';

/**
 * Uploads a Blob or File to Supabase Storage `media` bucket and returns a public URL.
 * Automatically creates the bucket if it does not exist (no-op if exists).
 */
export async function uploadMedia(blob: Blob, ext: string): Promise<string> {
  const fileName = `${crypto.randomUUID()}.${ext.replace(/^[.]/, '')}`;
  const filePath = `${fileName}`;

  // Ensure bucket exists (will error if already exists – we ignore).
  try {
    await supabase.storage.createBucket('media', {
      public: true,
    });
  } catch (_) {}

  const { error } = await supabase.storage.from('media').upload(filePath, blob, {
    contentType: blob.type || (ext === 'mp4' ? 'video/mp4' : 'application/octet-stream'),
    upsert: false,
  });
  if (error) throw error;

  // getPublicUrl is free and instant (no signed URL needed).
  const {
    data: { publicUrl },
  } = supabase.storage.from('media').getPublicUrl(filePath);

  return publicUrl;
}
