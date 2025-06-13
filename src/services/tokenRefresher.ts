import { supabase } from '@/integrations/supabase/client';

export async function refreshLinkedIn(userId: string): Promise<any> {
  const { data: platformRow, error } = await supabase
    .from('platforms')
    .select('credentials')
    .eq('user_id', userId)
    .eq('platform_name', 'linkedin')
    .single();
  if (error || !platformRow) throw error || new Error('LinkedIn not configured');

  const creds = platformRow.credentials as any;
  if (!creds.refresh_token || !creds.client_id || !creds.client_secret) {
    throw new Error('Missing LinkedIn refresh credentials');
  }

  const resp = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
      client_id: creds.client_id,
      client_secret: creds.client_secret,
    }),
  });
  if (!resp.ok) throw new Error('LinkedIn refresh failed');
  const json = await resp.json();
  const access_token = json.access_token;
  const expires_in = json.expires_in;
  const expires_at = Math.floor(Date.now() / 1000) + expires_in;

  await supabase.from('platforms').update({
    credentials: { ...creds, access_token, expires_at },
  }).eq('user_id', userId).eq('platform_name', 'linkedin');

  return { ...creds, access_token, expires_at };
}

export async function refreshYouTube(userId: string): Promise<any> {
  const { data: platformRow, error } = await supabase
    .from('platforms')
    .select('credentials')
    .eq('user_id', userId)
    .eq('platform_name', 'youtube')
    .single();
  if (error || !platformRow) throw error || new Error('YouTube not configured');
  const creds = platformRow.credentials as any;
  if (!creds.refresh_token || !creds.client_id || !creds.client_secret) {
    throw new Error('Missing YouTube refresh credentials');
  }
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error('YouTube refresh failed');
  const json = await resp.json();
  const access_token = json.access_token;
  const expires_in = json.expires_in;
  const expires_at = Math.floor(Date.now() / 1000) + expires_in;

  await supabase.from('platforms').update({
    credentials: { ...creds, access_token, expires_at },
  }).eq('user_id', userId).eq('platform_name', 'youtube');

  return { ...creds, access_token, expires_at };
}
