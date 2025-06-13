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
    const { title, body, subreddit } = await req.json();

    // Validate input
    if (!title || !body) {
      throw new Error('Missing title or body');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No auth header');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Fetch Reddit credentials
    const { data: platformRow } = await supabase
      .from('platforms')
      .select('credentials')
      .eq('user_id', user.id)
      .eq('platform_name', 'reddit')
      .single();

    if (!platformRow) throw new Error('Reddit not connected');

    const creds = platformRow.credentials as any;
    const clientId = creds.client_id;
    const clientSecret = creds.client_secret;
    const refreshToken = creds.refresh_token;
    let accessToken = creds.access_token;
    let expiresAt = creds.expires_at as number | undefined;

    // Refresh token if expired (<60s buffer)
    const now = Math.floor(Date.now() / 1000);
    if (!accessToken || !expiresAt || expiresAt - now < 60) {
      const tokenResp = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!tokenResp.ok) {
        const txt = await tokenResp.text();
        throw new Error(`Failed to refresh token: ${txt}`);
      }
      const tokenJson = await tokenResp.json();
      accessToken = tokenJson.access_token;
      expiresAt = now + tokenJson.expires_in;

      // Persist new token
      await supabase.from('platforms').update({
        credentials: { ...creds, access_token: accessToken, expires_at: expiresAt }
      }).eq('user_id', user.id).eq('platform_name', 'reddit');
    }

    // Determine subreddit
    const targetSubreddit = subreddit || creds.default_subreddit || 'programming';

    const postResp = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'ai-publishing-nexus/1.0 by u_auto',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        api_type: 'json',
        kind: 'self',
        sr: targetSubreddit,
        title,
        text: body,
      }),
    });

    const postJson = await postResp.json();
    if (!postResp.ok || postJson.json?.errors?.length) {
      throw new Error(`Reddit error: ${JSON.stringify(postJson.json.errors)}`);
    }

    const postId = postJson.json.data.id;
    const url = `https://reddit.com${postJson.json.data.url}`;

    return new Response(JSON.stringify({ postId, url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('post-to-reddit error', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
