
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
    const { videoUrl, title, description, tags, accessToken } = await req.json();
    
    // Download video file
    const videoResponse = await fetch(videoUrl);
    const videoBuffer = await videoResponse.arrayBuffer();
    
    // Upload video to YouTube as Short
    const uploadResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'multipart/related; boundary=boundary',
      },
      body: createMultipartBody({
        snippet: {
          title,
          description: description + '\n\n#Shorts',
          tags: [...(tags || []), 'Shorts'],
          categoryId: '28', // Science & Technology
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        }
      }, videoBuffer)
    });

    if (!uploadResponse.ok) {
      throw new Error(`YouTube upload failed: ${uploadResponse.status}`);
    }

    const result = await uploadResponse.json();
    
    return new Response(JSON.stringify({ 
      videoId: result.id,
      url: `https://youtube.com/shorts/${result.id}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error uploading to YouTube:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function createMultipartBody(metadata: any, videoBuffer: ArrayBuffer): Uint8Array {
  const boundary = 'boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;
  
  const metadataHeader = 'Content-Type: application/json\r\n\r\n';
  const videoHeader = 'Content-Type: video/mp4\r\n\r\n';
  
  const metadataPart = delimiter + metadataHeader + JSON.stringify(metadata);
  const videoPart = delimiter + videoHeader;
  
  const encoder = new TextEncoder();
  const metadataBytes = encoder.encode(metadataPart);
  const videoHeaderBytes = encoder.encode(videoPart);
  const closeBytes = encoder.encode(closeDelim);
  
  const totalLength = metadataBytes.length + videoHeaderBytes.length + videoBuffer.byteLength + closeBytes.length;
  const combined = new Uint8Array(totalLength);
  
  let offset = 0;
  combined.set(metadataBytes, offset);
  offset += metadataBytes.length;
  combined.set(videoHeaderBytes, offset);
  offset += videoHeaderBytes.length;
  combined.set(new Uint8Array(videoBuffer), offset);
  offset += videoBuffer.byteLength;
  combined.set(closeBytes, offset);
  
  return combined;
}
