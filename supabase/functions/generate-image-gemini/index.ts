
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, aspectRatio = '9:16' } = await req.json();
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Use Gemini Pro Vision for image understanding and description
    // Since Gemini 2.0 Flash doesn't yet support image generation directly,
    // we'll use the text generation to create detailed descriptions for DALL-E style prompts
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Create a detailed visual description for generating a ${aspectRatio} aspect ratio image: ${prompt}. Make it descriptive and visual for image generation. Focus on: composition, colors, lighting, style, and technical elements.`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 200,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = await response.json();
    const imageDescription = result.candidates?.[0]?.content?.parts?.[0]?.text || prompt;
    
    // For now, return a generated placeholder with the description
    // In a real implementation, you would use this description with DALL-E or another image generation service
    const width = aspectRatio === '16:9' ? 1920 : aspectRatio === '9:16' ? 720 : 1080;
    const height = aspectRatio === '16:9' ? 1080 : aspectRatio === '9:16' ? 1280 : 1080;
    
    // Create a more realistic placeholder URL that could represent a generated image
    const placeholderUrl = `https://picsum.photos/${width}/${height}?random=${Date.now()}`;
    
    return new Response(JSON.stringify({ 
      imageUrl: placeholderUrl,
      description: imageDescription,
      aspectRatio 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error generating image:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
