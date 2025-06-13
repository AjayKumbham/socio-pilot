import { supabase } from '@/integrations/supabase/client';
import { contentGenerator } from './contentGenerator';

export interface VideoContent {
  script: string;
  title: string;
  description: string;
  tags: string[];
  duration: number;
  platform: 'instagram' | 'youtube';
  visualCues: VisualCue[];
}

export interface VisualCue {
  timestamp: number;
  description: string;
  type: 'screenshot' | 'animation' | 'stock_video' | 'generated_image';
  duration: number;
}

export interface GeneratedVideo {
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  format: string;
}

export interface MediaAsset {
  type: 'image' | 'video';
  url: string;
  duration?: number;
}

export class VideoGenerator {
  async generateVideoScript(topic: string, platform: 'instagram' | 'youtube'): Promise<VideoContent> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const maxDuration = platform === 'instagram' ? 30 : 60;
    
    const prompt = `Create a ${maxDuration}-second video script about ${topic} for ${platform}.

Requirements:
- Hook viewers in first 3 seconds
- Clear, engaging narration with precise timing
- Platform-optimized format
- Tech/programming focus
- Include detailed visual cues with timestamps
- Duration: ${maxDuration} seconds max

Visual cue types available:
- [SCREENSHOT: description] - Code editor screenshots
- [ANIMATION: description] - Animated explanations
- [STOCK_VIDEO: description] - Relevant stock footage
- [GENERATED_IMAGE: description] - AI-generated visuals

Return JSON format:
{
  "script": "Full narration text",
  "title": "Engaging title",
  "description": "Platform description with hashtags",
  "tags": ["tag1", "tag2"],
  "duration": ${maxDuration},
  "visualCues": [
    {
      "timestamp": 0,
      "description": "Visual description",
      "type": "screenshot|animation|stock_video|generated_image",
      "duration": 3
    }
  ]
}`;

    try {
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: { 
          prompt, 
          userId: user.user.id,
          contentType: 'video_script'
        }
      });

      if (error) throw error;

      const parsedContent = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;

      return {
        script: parsedContent.script,
        title: parsedContent.title,
        description: parsedContent.description,
        tags: parsedContent.tags,
        duration: parsedContent.duration,
        platform,
        visualCues: parsedContent.visualCues || []
      };
    } catch (error) {
      console.error('Script generation failed:', error);
      throw new Error('Failed to generate video script');
    }
  }

  async generateVideo(content: VideoContent): Promise<GeneratedVideo> {
    try {
      // Generate media assets for visual cues
      const mediaAssets = await this.generateMediaAssets(content.visualCues);
      
      // Generate TTS audio using browser's speech synthesis
      const audioBlob = await this.generateTTSAudio(content.script);
      
      // Create video by combining assets
      const localUrl = await this.assembleVideoInBrowser(content, mediaAssets, audioBlob);
      // Convert dataURL/blob URL to Blob
      const blob = await fetch(localUrl).then(r => r.blob());
      const uploadedUrl = await import('./mediaUploader').then(m => m.uploadMedia(blob, 'mp4'));
      const videoUrl = uploadedUrl;

      return {
        videoUrl,
        duration: content.duration,
        format: 'mp4'
      };
    } catch (error) {
      console.error('Video generation failed:', error);
      throw new Error('Failed to generate video');
    }
  }

  private async generateTTSAudio(text: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      // Find a good voice
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(voice => 
        voice.lang.startsWith('en') && voice.name.includes('Google')
      ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0];
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      // Create audio context to capture the speech
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const mediaStreamDestination = audioContext.createMediaStreamDestination();
      
      const mediaRecorder = new MediaRecorder(mediaStreamDestination.stream);
      const audioChunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        resolve(audioBlob);
      };

      utterance.onstart = () => {
        mediaRecorder.start();
      };

      utterance.onend = () => {
        setTimeout(() => mediaRecorder.stop(), 100);
      };

      utterance.onerror = () => {
        reject(new Error('Speech synthesis failed'));
      };

      speechSynthesis.speak(utterance);
    });
  }

  private async assembleVideoInBrowser(
    content: VideoContent, 
    mediaAssets: MediaAsset[], 
    audioBlob: Blob
  ): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // Set canvas dimensions for vertical video (9:16 aspect ratio)
    canvas.width = 720;
    canvas.height = 1280;

    const stream = canvas.captureStream(30); // 30 FPS
    const mediaRecorder = new MediaRecorder(stream);
    const videoChunks: BlobPart[] = [];

    mediaRecorder.ondataavailable = (event) => {
      videoChunks.push(event.data);
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(videoChunks, { type: 'video/mp4' });
        const videoUrl = URL.createObjectURL(videoBlob);
        resolve(videoUrl);
      };

      mediaRecorder.start();

      let currentTime = 0;
      const frameDuration = 1000 / 30; // 30 FPS
      let currentAssetIndex = 0;

      const drawFrame = async () => {
        if (currentTime >= content.duration * 1000) {
          mediaRecorder.stop();
          return;
        }

        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Find current visual cue
        const currentCue = content.visualCues.find(cue => 
          currentTime >= cue.timestamp * 1000 && 
          currentTime < (cue.timestamp + cue.duration) * 1000
        );

        if (currentCue && mediaAssets[currentAssetIndex]) {
          const asset = mediaAssets[currentAssetIndex];

          if (asset.type === 'image') {
            try {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                // Scale image to fit canvas while maintaining aspect ratio
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const x = (canvas.width - img.width * scale) / 2;
                const y = (canvas.height - img.height * scale) / 2;
                ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
              };
              img.src = asset.url;
            } catch (error) {
              console.error('Error drawing asset:', error);
            }
          }
        }

        // Add text overlay
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        
        // Add title with stroke for better visibility
        const titleLines = this.wrapText(ctx, content.title, canvas.width - 40);
        titleLines.forEach((line, index) => {
          const y = 100 + (index * 50);
          ctx.strokeText(line, canvas.width / 2, y);
          ctx.fillText(line, canvas.width / 2, y);
        });

        currentTime += frameDuration;
        
        // Check if we need to move to next asset
        if (currentCue && currentTime >= (currentCue.timestamp + currentCue.duration) * 1000) {
          currentAssetIndex = Math.min(currentAssetIndex + 1, mediaAssets.length - 1);
        }

        setTimeout(drawFrame, frameDuration);
      };

      drawFrame();
    });
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  private async generateMediaAssets(visualCues: VisualCue[]): Promise<MediaAsset[]> {
    const assets: MediaAsset[] = [];
    
    for (const cue of visualCues) {
      try {
        let asset: MediaAsset;
        
        switch (cue.type) {
          case 'generated_image':
            asset = await this.generateImage(cue.description);
            break;
          case 'stock_video':
            asset = await this.getStockVideo(cue.description);
            break;
          case 'screenshot':
            asset = await this.generateCodeScreenshot(cue.description);
            break;
          case 'animation':
            asset = await this.generateCodeScreenshot(cue.description); // Use screenshot for now
            break;
          default:
            continue;
        }
        
        assets.push(asset);
      } catch (error) {
        console.error(`Failed to generate asset for cue: ${cue.description}`, error);
        // Create a fallback asset
        assets.push(await this.generateCodeScreenshot('Loading...'));
      }
    }
    
    return assets;
  }

  // Utility methods for caching media assets in Supabase
  private async getCachedAsset(type: 'image' | 'video', description: string): Promise<MediaAsset | null> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return null;

      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('type', type)
        .ilike('description', description)
        .maybeSingle();

      if (error) {
        console.warn('Failed to query media_assets cache:', error);
        return null;
      }

      if (data && data.url) {
        return {
          type: data.type as 'image' | 'video',
          url: data.url,
          duration: data.duration ?? (type === 'image' ? 3 : undefined)
        };
      }

      return null;
    } catch (err) {
      console.warn('Cache lookup error:', err);
      return null;
    }
  }

  private async saveAsset(asset: MediaAsset, description: string) {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      await supabase.from('media_assets').upsert({
        user_id: user.user.id,
        type: asset.type,
        description,
        url: asset.url,
        duration: asset.duration ?? (asset.type === 'image' ? 3 : undefined)
      });
    } catch (err) {
      console.warn('Failed to upsert media asset cache:', err);
    }
  }

  private async generateImage(description: string): Promise<MediaAsset> {
    // Try cache first
    const cached = await this.getCachedAsset('image', description);
    if (cached) return cached;

    try {
      const { data, error } = await supabase.functions.invoke('generate-image-gemini', {
        body: { 
          prompt: `Create a vertical 9:16 aspect ratio image for tech content: ${description}. Style: modern, clean, professional, high contrast.`,
          aspectRatio: '9:16'
        }
      });

      if (error) throw error;
      
      const asset: MediaAsset = {
        type: 'image',
        url: data.imageUrl,
        duration: 3
      };

      // Cache result
      await this.saveAsset(asset, description);
      
      return asset;
    } catch (error) {
      console.error('Image generation failed:', error);
      return this.generateCodeScreenshot(description);
    }
  }

  private async getStockVideo(description: string): Promise<MediaAsset> {
    // Try cache first
    const cached = await this.getCachedAsset('video', description);
    if (cached) return cached;

    try {
      const { data, error } = await supabase.functions.invoke('get-stock-video', {
        body: { 
          query: description,
          orientation: 'portrait',
          minDuration: 3
        }
      });

      if (error) throw error;
      
      const asset: MediaAsset = {
        type: 'video',
        url: data.videoUrl,
        duration: Math.min(data.duration, 5)
      };

      // Cache result
      await this.saveAsset(asset, description);
      
      return asset;
    } catch (error) {
      console.error('Stock video fetch failed:', error);
      return this.generateCodeScreenshot(description);
    }
  }

  private async generateCodeScreenshot(description: string): Promise<MediaAsset> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    canvas.width = 720;
    canvas.height = 1280;
    
    // Dark theme background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add code editor-like styling
    ctx.fillStyle = '#21262d';
    ctx.fillRect(20, 80, canvas.width - 40, canvas.height - 200);
    
    // Title bar
    ctx.fillStyle = '#30363d';
    ctx.fillRect(20, 80, canvas.width - 40, 40);
    
    // Traffic lights
    ctx.fillStyle = '#ff5f56';
    ctx.beginPath();
    ctx.arc(45, 100, 6, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.fillStyle = '#ffbd2e';
    ctx.beginPath();
    ctx.arc(70, 100, 6, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.fillStyle = '#27c93f';
    ctx.beginPath();
    ctx.arc(95, 100, 6, 0, 2 * Math.PI);
    ctx.fill();
    
    // Code content
    ctx.fillStyle = '#e6edf3';
    ctx.font = '18px Courier New, monospace';
    ctx.textAlign = 'left';
    
    const codeLines = this.generateCodeForDescription(description);
    
    codeLines.forEach((line, index) => {
      const y = 150 + (index * 25);
      if (y < canvas.height - 100) {
        ctx.fillText(line, 40, y);
      }
    });
    
    // Add description at bottom
    ctx.fillStyle = '#58a6ff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    const descLines = this.wrapText(ctx, description, canvas.width - 40);
    descLines.forEach((line, index) => {
      ctx.fillText(line, canvas.width / 2, canvas.height - 80 + (index * 30));
    });
    
    const dataUrl = canvas.toDataURL('image/png');
    
    return {
      type: 'image',
      url: dataUrl,
      duration: 4
    };
  }

  private generateCodeForDescription(description: string): string[] {
    const keywords = description.toLowerCase();
    
    if (keywords.includes('react') || keywords.includes('component')) {
      return [
        'import React from "react";',
        '',
        'const MyComponent = () => {',
        '  const [state, setState] = useState(0);',
        '',
        '  return (',
        '    <div className="container">',
        '      <h1>Hello World</h1>',
        '      <button onClick={() => setState(s => s + 1)}>',
        '        Count: {state}',
        '      </button>',
        '    </div>',
        '  );',
        '};',
        '',
        'export default MyComponent;'
      ];
    } else if (keywords.includes('api') || keywords.includes('fetch')) {
      return [
        'async function fetchData() {',
        '  try {',
        '    const response = await fetch("/api/data");',
        '    const data = await response.json();',
        '    return data;',
        '  } catch (error) {',
        '    console.error("Error:", error);',
        '    throw error;',
        '  }',
        '}',
        '',
        'fetchData().then(data => {',
        '  console.log("Data received:", data);',
        '});'
      ];
    } else {
      return [
        'function processData(input) {',
        '  const result = input.map(item => ({',
        '    id: item.id,',
        '    name: item.name.toUpperCase(),',
        '    value: item.value * 2',
        '  }));',
        '',
        '  return result.filter(item => ',
        '    item.value > 0',
        '  );',
        '}',
        '',
        'const data = processData(inputArray);',
        'console.log("Processed:", data);'
      ];
    }
  }

  async generateThumbnail(title: string, platform: string): Promise<string> {
    // Only generate thumbnails for regular YouTube videos, not shorts
    if (platform === 'youtube') {
      console.log('Thumbnails not needed for YouTube Shorts');
      return '';
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-image-gemini', {
        body: { 
          prompt: `Create an eye-catching thumbnail for: ${title}. Style: tech/programming theme, high contrast, readable text, YouTube thumbnail style`,
          aspectRatio: '16:9'
        }
      });

      if (error) throw error;
      return data.imageUrl;
    } catch (error) {
      console.error('Thumbnail generation failed:', error);
      return '';
    }
  }
}

export const videoGenerator = new VideoGenerator();
