
// @ts-nocheck
// deno-lint-ignore-file
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, mediaUrl, mediaType } = await req.json();
    
    // Get user credentials from Supabase
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: platform } = await supabaseClient
      .from('platforms')
      .select('credentials')
      .eq('user_id', user.id)
      .eq('platform_name', 'twitter')
      .single();

    if (!platform) throw new Error('Twitter not connected');

    const credentials = platform.credentials as any;
    
    // Use Twitter API v2 with OAuth 1.0a
    const tweetData: any = { text: content };
    
    // If there's media, upload it first
    if (mediaUrl) {
      const mediaId = await uploadMedia(mediaUrl, mediaType, credentials);
      if (mediaType === 'video') {
        tweetData.media = { media_ids: [mediaId] };
      } else {
        tweetData.media = { media_ids: [mediaId] };
      }
    }

    const tweetResponse = await postTweet(tweetData, credentials);
    
    return new Response(JSON.stringify({ 
      tweetId: tweetResponse.data.id,
      url: `https://twitter.com/user/status/${tweetResponse.data.id}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error posting to Twitter:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function uploadMedia(mediaUrl: string, mediaType: string, credentials: any): Promise<string> {
  const endpoint = 'https://upload.twitter.com/1.1/media/upload.json';
  // Download media file
  const mediaResponse = await fetch(mediaUrl);
  const mediaBuffer = await mediaResponse.arrayBuffer();
  
  // Upload to Twitter
  const uploadResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': await generateOAuthHeader('POST', endpoint, credentials),
      'Content-Type': 'multipart/form-data',
    },
    body: new FormData().append('media', new Blob([mediaBuffer])),
  });
  
  const uploadResult = await uploadResponse.json();
  return uploadResult.media_id_string;
}

async function postTweet(tweetData: any, credentials: any): Promise<any> {
  const endpoint = 'https://api.twitter.com/2/tweets';
  const response = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      'Authorization': await generateOAuthHeader('POST', endpoint, credentials),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tweetData),
  });
  
  return await response.json();
}

function generateOAuthHeader(method: string, url: string, credentials: any, extraParams: Record<string,string> = {}): string {
  const oauth_params: Record<string,string> = {
    oauth_consumer_key: credentials.api_key,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.access_token,
    oauth_version: '1.0',
    ...extraParams,
  };

  // Collect all params (oauth + query)
  const urlObj = new URL(url);
  urlObj.searchParams.forEach((value, key) => {
    oauth_params[key] = value;
  });

  // Percent encode helper
  const enc = (str: string) => encodeURIComponent(str).replace(/!/g, '%21').replace(/\*/g, '%2A').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');

  // Build parameter string
  const paramString = Object.keys(oauth_params)
    .sort()
    .map(k => `${enc(k)}=${enc(oauth_params[k])}`)
    .join('&');

  const baseString = [method.toUpperCase(), enc(urlObj.origin + urlObj.pathname), enc(paramString)].join('&');

  const signingKey = `${enc(credentials.api_secret)}&${enc(credentials.access_token_secret)}`;

  const keyData = new TextEncoder().encode(signingKey);
  const msgData = new TextEncoder().encode(baseString);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signatureArrayBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureArrayBuffer)));

  const header = 'OAuth ' + Object.entries({ ...oauth_params, oauth_signature: signature })
    .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
    .join(', ');
  return header;
}
