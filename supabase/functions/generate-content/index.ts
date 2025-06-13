// @ts-nocheck

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: strip markdown fences / prefixes and parse JSON safely
function cleanJson(raw: string) {
  const stripped = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```/i, '')
    .replace(/^json\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(stripped);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, settings, model, userId } = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch API keys from llm_api_credentials (new table)
    const { data: credsRows, error: credsError } = await supabase
      .from('llm_api_credentials')
      .select('api_name, api_key')
      .eq('user_id', userId);

    if (credsError || !credsRows || credsRows.length === 0) {
      console.error('Failed to get LLM API keys:', credsError);
      throw new Error('LLM API keys not configured. Please set up your AI API keys in the settings.');
    }

    const credentials = credsRows.reduce((acc: Record<string,string>, row: any) => {
      acc[row.api_name + '_key'] = row.api_key;
      return acc;
    }, {} as Record<string,string>);

    const credentialsKeys = Object.keys(credentials);

    let content;
    
    // Try different AI providers based on the model
    if (model.includes('rapidapi') || model.includes('gpt')) {
      if (!credentialsKeys.includes('rapidapi_key')) {
        throw new Error('RapidAPI key not configured');
      }
      content = await generateWithRapidAPI(prompt, settings, credentials.rapidapi_key);
    } else if (model.includes('gemini')) {
      if (!credentialsKeys.includes('gemini_key')) {
        throw new Error('Gemini API key not configured');
      }
      content = await generateWithGemini(prompt, settings, credentials.gemini_key);
    } else if (model.includes('llama') || model.includes('groq')) {
      if (!credentialsKeys.includes('groq_key')) {
        throw new Error('Groq API key not configured');
      }
      content = await generateWithGroq(prompt, model, settings, credentials.groq_key);
    } else {
      throw new Error('Unsupported model');
    }

    return new Response(JSON.stringify(content), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating content:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateWithRapidAPI(prompt: string, settings: any, apiKey: string) {
  console.log('Generating content with RapidAPI ChatGPT...');
  
  const response = await fetch('https://chatgpt-42.p.rapidapi.com/gpt4', {
    method: 'POST',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'chatgpt-42.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { 
          role: 'user', 
          content: `${prompt}\n\nGenerate content with ${settings.tone} tone and ${settings.creativity_level}% creativity level. Always return valid JSON with the exact structure: {"title": "string", "body": "string", "tags": ["array"], "mediaUrl": "string"}.`
        }
      ],
      web_access: false
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('RapidAPI error:', errorData);
    throw new Error(`RapidAPI error: ${errorData.message || 'Unknown error'}`);
  }

  const data = await response.json();
  
  if (!data.status || !data.result) {
    throw new Error('Invalid response from RapidAPI');
  }
  
  const content = data.result;
  
  try {
    return cleanJson(content);
  } catch {
    // Fallback if AI doesn't return valid JSON
    return {
      title: "Generated Content",
      body: content,
      tags: ["ai", "generated"],
      mediaUrl: ""
    };
  }
}

async function generateWithGemini(prompt: string, settings: any, apiKey: string) {
  console.log('Generating content with Gemini...');
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${prompt}\n\nGenerate content with ${settings.tone} tone and ${settings.creativity_level}% creativity. Return valid JSON format with this exact structure: {"title": "string", "body": "string", "tags": ["array"], "mediaUrl": "string"}.`
        }]
      }],
      generationConfig: {
        temperature: settings.creativity_level / 100,
        maxOutputTokens: 2000,
      }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Gemini API error:', errorData);
    throw new Error(`Gemini API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const content = data.candidates[0].content.parts[0].text;
  
  try {
    return cleanJson(content);
  } catch {
    return {
      title: "Generated Content",
      body: content,
      tags: ["ai", "generated"],
      mediaUrl: ""
    };
  }
}

async function generateWithGroq(prompt: string, model: string, settings: any, apiKey: string) {
  console.log('Generating content with Groq...');
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [
        { 
          role: 'system', 
          content: `You are a content generator. Generate content with ${settings.tone} tone and ${settings.creativity_level}% creativity level. Always return valid JSON with the exact structure: {"title": "string", "body": "string", "tags": ["array"], "mediaUrl": "string"}.` 
        },
        { role: 'user', content: prompt }
      ],
      temperature: settings.creativity_level / 100,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Groq API error:', errorData);
    throw new Error(`Groq API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  try {
    return cleanJson(content);
  } catch {
    return {
      title: "Generated Content",
      body: content,
      tags: ["ai", "generated"],
      mediaUrl: ""
    };
  }
}
