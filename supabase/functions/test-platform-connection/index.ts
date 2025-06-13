
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMAC-SHA1 implementation for OAuth
async function hmacSha1(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const signatureArray = new Uint8Array(signature);
  return btoa(String.fromCharCode.apply(null, Array.from(signatureArray)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { platform, credentials } = await req.json();

    let testResult = false;
    let error = '';

    switch (platform) {
      case 'gemini':
        try {
          if (!credentials.gemini_api_key && !credentials.api_key) {
            throw new Error('Gemini API key is required');
          }
          
          const apiKey = credentials.gemini_api_key || credentials.api_key;
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: "Test connection"
                }]
              }]
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.candidates && result.candidates.length > 0) {
              testResult = true;
            } else {
              error = 'Invalid response format from Gemini API';
            }
          } else {
            const errorData = await response.json();
            error = errorData.error?.message || `HTTP ${response.status}: Invalid API key`;
          }
        } catch (e) {
          error = e.message;
        }
        break;

      case 'pexels':
        try {
          if (!credentials.pexels_api_key && !credentials.api_key) {
            throw new Error('Pexels API key is required');
          }
          
          const apiKey = credentials.pexels_api_key || credentials.api_key;
          const response = await fetch('https://api.pexels.com/v1/search?query=nature&per_page=1', {
            headers: {
              'Authorization': apiKey,
            },
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.photos && result.photos.length > 0) {
              testResult = true;
            } else {
              error = 'No photos returned from Pexels API';
            }
          } else {
            const errorData = await response.json();
            error = errorData.error || `HTTP ${response.status}: Invalid API key`;
          }
        } catch (e) {
          error = e.message;
        }
        break;

      case 'reddit':
        try {
          if (!credentials.client_id || !credentials.client_secret || !credentials.username || !credentials.password) {
            throw new Error('Client ID, client secret, username, and password are required');
          }
          
          console.log('Testing Reddit connection...');
          
          // Use the user-provided user agent from credentials, with proper fallback
          const userAgent = credentials.user_agent || `web:${credentials.client_id}:v1.0.0 (by /u/${credentials.username})`;
          
          console.log('Using User-Agent:', userAgent);
          
          // First, get access token
          const authResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${credentials.client_id}:${credentials.client_secret}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': userAgent,
            },
            body: new URLSearchParams({
              grant_type: 'password',
              username: credentials.username,
              password: credentials.password,
            }),
          });

          console.log('Reddit auth response status:', authResponse.status);
          console.log('Reddit auth response headers:', Object.fromEntries(authResponse.headers.entries()));
          
          if (!authResponse.ok) {
            const responseText = await authResponse.text();
            console.log('Reddit auth error response:', responseText);
            
            // Check if response contains HTML (which indicates blocking/error page)
            if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html')) {
              error = 'Reddit returned an HTML error page instead of JSON. This usually means:\n' +
                     '• Your IP is being blocked or rate-limited\n' +
                     '• Invalid app configuration (must be "script" type)\n' +
                     '• User-Agent format is incorrect\n\n' +
                     'Please check your Reddit app settings and ensure it\'s configured as a "script" application.';
            } else {
              try {
                const authError = JSON.parse(responseText);
                if (authError.error === 'invalid_grant') {
                  error = 'Invalid Reddit username or password';
                } else if (authError.error === 'invalid_client') {
                  error = 'Invalid Reddit client ID or secret';
                } else {
                  error = authError.error_description || authError.error || 'Reddit authentication failed';
                }
              } catch {
                error = `Reddit API error (${authResponse.status}): ${responseText}`;
              }
            }
          } else {
            const authData = await authResponse.json();
            console.log('Reddit auth success, received token');
            
            if (!authData.access_token) {
              error = 'No access token received from Reddit';
            } else {
              // Test the access token by getting user info
              const userResponse = await fetch('https://oauth.reddit.com/api/v1/me', {
                headers: {
                  'Authorization': `Bearer ${authData.access_token}`,
                  'User-Agent': userAgent,
                },
              });

              if (userResponse.ok) {
                const userData = await userResponse.json();
                if (userData.name) {
                  testResult = true;
                  console.log('Reddit connection successful for user:', userData.name);
                } else {
                  error = 'Invalid user data from Reddit API';
                }
              } else {
                const userErrorText = await userResponse.text();
                console.log('Reddit user API error:', userErrorText);
                error = `Failed to verify Reddit user (${userResponse.status})`;
              }
            }
          }
        } catch (e) {
          console.error('Reddit connection error:', e);
          error = `Reddit connection failed: ${e.message}`;
        }
        break;

      case 'hashnode':
        try {
          if (!credentials.access_token) {
            throw new Error('Access token is required');
          }
          
          const response = await fetch('https://gql.hashnode.com/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': credentials.access_token,
            },
            body: JSON.stringify({
              query: `query { me { id username } }`
            })
          });
          
          const result = await response.json();
          
          if (result.errors) {
            error = result.errors[0].message;
          } else if (result.data?.me) {
            testResult = true;
          } else {
            error = 'Invalid response from Hashnode API';
          }
        } catch (e) {
          error = e.message;
        }
        break;

      case 'devto':
        try {
          if (!credentials.api_key) {
            throw new Error('API key is required');
          }
          
          const response = await fetch('https://dev.to/api/users/me', {
            headers: {
              'api-key': credentials.api_key,
            },
          });
          
          if (response.ok) {
            testResult = true;
          } else {
            const errorData = await response.json();
            error = errorData.error || `HTTP ${response.status}: Invalid API key`;
          }
        } catch (e) {
          error = e.message;
        }
        break;

      case 'twitter':
        try {
          if (!credentials.api_key || !credentials.api_secret || !credentials.access_token || !credentials.access_token_secret) {
            throw new Error('All Twitter OAuth 1.0a credentials are required (API Key, API Secret, Access Token, Access Token Secret)');
          }
          
          const url = 'https://api.twitter.com/2/users/me';
          const method = 'GET';
          
          const oauthParams = {
            oauth_consumer_key: credentials.api_key,
            oauth_nonce: Math.random().toString(36).substring(2, 15),
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_token: credentials.access_token,
            oauth_version: '1.0',
          };

          // Create parameter string for signature
          const parameterString = Object.entries(oauthParams)
            .sort()
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');

          // Create signature base string
          const signatureBaseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(parameterString)}`;
          
          // Create signing key
          const signingKey = `${encodeURIComponent(credentials.api_secret)}&${encodeURIComponent(credentials.access_token_secret)}`;
          
          // Generate signature
          const signature = await hmacSha1(signingKey, signatureBaseString);

          // Create authorization header
          const authorizationHeader = 'OAuth ' + Object.entries({
            ...oauthParams,
            oauth_signature: signature
          })
            .sort()
            .map(([key, value]) => `${encodeURIComponent(key)}="${encodeURIComponent(value)}"`)
            .join(', ');

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': authorizationHeader,
            },
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.data && result.data.id) {
              testResult = true;
            } else {
              error = 'Invalid response from Twitter API';
            }
          } else {
            const errorText = await response.text();
            console.log('Twitter API Error Response:', errorText);
            try {
              const errorData = JSON.parse(errorText);
              error = errorData.detail || errorData.title || `HTTP ${response.status}: ${errorData.errors?.[0]?.message || 'Authentication failed'}`;
            } catch {
              error = `HTTP ${response.status}: ${errorText}`;
            }
          }
        } catch (e) {
          console.error('Twitter connection error:', e);
          error = e.message;
        }
        break;

      case 'linkedin':
        try {
          if (!credentials.access_token) {
            throw new Error('Access token is required');
          }
          
          const response = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: {
              'Authorization': `Bearer ${credentials.access_token}`,
            },
          });
          
          if (response.ok) {
            const userData = await response.json();
            if (userData.sub) {
              testResult = true;
              return new Response(JSON.stringify({ 
                success: testResult, 
                error,
                userInfo: { sub: userData.sub }
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            } else {
              error = 'No user data returned from LinkedIn API';
            }
          } else {
            const errorData = await response.json();
            error = errorData.message || `HTTP ${response.status}: Invalid access token`;
          }
        } catch (e) {
          error = e.message;
        }
        break;

      case 'instagram':
        try {
          if (!credentials.access_token || !credentials.business_account_id) {
            throw new Error('Access token and business account ID are required');
          }
          
          const response = await fetch(`https://graph.facebook.com/v18.0/${credentials.business_account_id}?fields=id,name&access_token=${credentials.access_token}`);
          const result = await response.json();
          
          if (response.ok && !result.error && result.id) {
            testResult = true;
          } else {
            error = result.error?.message || `HTTP ${response.status}: Invalid credentials or business account ID`;
          }
        } catch (e) {
          error = e.message;
        }
        break;

      case 'youtube':
        try {
          if (!credentials.access_token) {
            throw new Error('Access token is required');
          }
          
          const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
            headers: {
              'Authorization': `Bearer ${credentials.access_token}`,
            },
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.items && result.items.length > 0) {
              testResult = true;
            } else {
              error = 'No YouTube channel found for this account';
            }
          } else {
            const errorData = await response.json();
            error = errorData.error?.message || `HTTP ${response.status}: Invalid access token`;
            
            if (response.status === 401) {
              error += ' (Token may have expired - refresh needed)';
            }
          }
        } catch (e) {
          error = e.message;
        }
        break;

      default:
        error = `Platform '${platform}' is not supported for testing`;
    }

    return new Response(JSON.stringify({ success: testResult, error }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error testing platform connection:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
