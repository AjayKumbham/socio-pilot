import { supabase } from '@/integrations/supabase/client';

export interface GeneratedContent {
  title: string;
  content: string;
  type: 'blog' | 'social' | 'video' | 'thread';
  platform: string;
  tags?: string[];
  mediaUrl?: string;
}

export class ContentGenerator {
  private async getAISettings() {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('user_id', user.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    // Return default settings if none exist
    return data || {
      tone: 'professional',
      creativity_level: 70,
      content_length: 60,
      active_models: ['rapidapi-gpt4', 'gemini-2.0', 'llama3-8b'],
      topics: ['React', 'JavaScript', 'TypeScript', 'Web Development', 'Programming']
    };
  }

  async generateContent(platform: string, contentType: string): Promise<GeneratedContent> {
    const settings = await this.getAISettings();
    
    const prompt = this.buildPrompt(platform, contentType, settings);
    
    try {
      const content = await this.callAIAPI(prompt, settings);
      
      return {
        title: content.title,
        content: content.body,
        type: this.getContentType(platform),
        platform,
        tags: content.tags,
        mediaUrl: content.mediaUrl,
      };
    } catch (error) {
      console.error('AI content generation failed:', error);
      
      // Instead of fallback, throw error to prevent hardcoded content
      throw new Error(`Failed to generate content for ${platform}: ${error.message}`);
    }
  }

  private buildPrompt(platform: string, contentType: string, settings: any): string {
    const topics = Array.isArray(settings.topics) ? settings.topics : ['Programming', 'Web Development'];
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    
    const basePrompts = {
      hashnode: this.getBlogPrompt(settings, 'hashnode', randomTopic),
      devto: this.getBlogPrompt(settings, 'devto', randomTopic),
      twitter: this.getSocialPrompt(settings, 'twitter', randomTopic),
      linkedin: this.getSocialPrompt(settings, 'linkedin', randomTopic),
      instagram: this.getVideoPrompt(settings, 'instagram', randomTopic),
      youtube: this.getVideoPrompt(settings, 'youtube', randomTopic),
      reddit: this.getSocialPrompt(settings, 'reddit', randomTopic),
    };

    return basePrompts[platform as keyof typeof basePrompts] || basePrompts.devto;
  }

  private getBlogPrompt(settings: any, platform: string, topic: string): string {
    const wordCount = platform === 'hashnode' ? '1500-2500' : '800-1500';
    const currentDate = new Date().toLocaleDateString();
    
    return `Generate a comprehensive technical blog post about ${topic} for ${platform}.
    
Current date: ${currentDate}
Tone: ${settings.tone}
Creativity: ${settings.creativity_level}% (0=conservative, 100=highly creative)
Length: ${settings.content_length}% (aim for ${wordCount} words)

Requirements:
- Original, SEO-optimized title
- Current trends and best practices (2024-2025)
- Practical code examples where relevant
- Clear structure with headers and subheaders
- Actionable insights developers can implement
- Include real-world use cases
- Modern development practices
- No outdated information

Format: Return ONLY valid JSON with this exact structure:
{
  "title": "Compelling SEO-optimized title",
  "body": "Full markdown content with headers, code blocks, and examples",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "mediaUrl": ""
}`;
  }

  private getSocialPrompt(settings: any, platform: string, topic: string): string {
    const limits = {
      twitter: '280 characters per tweet (can be a thread)',
      linkedin: '3000 characters max',
      reddit: '40000 characters max'
    };
    
    const limit = limits[platform as keyof typeof limits] || '1000 characters';
    
    return `Generate engaging social media content about ${topic} for ${platform}.

Tone: ${settings.tone}
Creativity: ${settings.creativity_level}%
Content focus: ${topic}
Character limit: ${limit}

Platform-specific requirements:
${platform === 'twitter' ? '- Can create thread with multiple tweets\n- Use relevant hashtags\n- Engaging hook in first tweet' : ''}
${platform === 'linkedin' ? '- Professional tone\n- Include call-to-action\n- Use emojis sparingly\n- Focus on career insights' : ''}
${platform === 'reddit' ? '- Community-focused\n- Provide real value\n- Avoid self-promotion\n- Engage in discussion format' : ''}

Requirements:
- Hook readers immediately
- Provide actionable value
- Include relevant hashtags
- Encourage engagement
- Current tech trends (2024-2025)
- No generic content

Format: Return ONLY valid JSON:
{
  "title": "Post title or first line",
  "body": "Complete post content with formatting",
  "tags": ["hashtag1", "hashtag2", "hashtag3"],
  "mediaUrl": ""
}`;
  }

  private getVideoPrompt(settings: any, platform: string, topic: string): string {
    const duration = platform === 'instagram' ? '15-30 seconds' : '30-60 seconds';
    
    return `Generate a video script about ${topic} for ${platform} Shorts/Reels.

Duration: ${duration}
Tone: ${settings.tone}
Topic: ${topic}

Requirements:
- Hook viewers in first 3 seconds
- Visual scripting with [VISUAL: description] cues
- Clear, engaging narration
- Quick tips or insights
- Call to action at end
- Mobile-first format
- Trending topic angle

Script format:
- Include timing cues
- Visual descriptions for each scene
- Engaging narration text
- Background music suggestions

Format: Return ONLY valid JSON:
{
  "title": "Engaging video title",
  "body": "Complete script with [VISUAL:] cues and narration",
  "tags": ["tag1", "tag2", "tag3"],
  "mediaUrl": "placeholder-for-generated-video"
}`;
  }

  // Helper
  private cleanJson(raw: string) {
    const stripped = raw.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```/i, '')
      .replace(/^json\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    return JSON.parse(stripped);
  }

  private async callAIAPI(prompt: string, settings: any): Promise<any> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    console.log('Calling AI API for content generation...');

    const activeModels: string[] = Array.isArray(settings.active_models) && settings.active_models.length > 0
      ? (settings.active_models as string[])
      : ['rapidapi-gpt4', 'gemini-2.0', 'llama3-8b'];

    const orderedModels = this.getOrderedModels(activeModels);

    let lastError: any = null;
    for (const model of orderedModels) {
      try {
        const { data, error } = await supabase.functions.invoke('generate-content', {
          body: {
            prompt,
            settings,
            model,
            userId: user.user.id
          }
        });

        if (error) throw error;

        let parsed = data;
        if (typeof data === 'string') {
          try {
            parsed = this.cleanJson(data);
          } catch {/* ignore */}
        }

        if (parsed && parsed.title && parsed.body) {
          // Reject generic fallback content
          if (
            parsed.title === 'Generated Content' &&
            Array.isArray(parsed.tags) && parsed.tags.includes('generated')
          ) {
            throw new Error('LLM returned fallback content');
          }
          console.log(`✅ Content generated using model: ${model}`);
          return parsed;
        }

        throw new Error('AI returned invalid response format');
      } catch (err) {
        console.warn(`⚠️ Model ${model} failed, trying next if available. Reason:`, err?.message || err);
        lastError = err;
        continue; // try next model
      }
    }

    // All models failed
    throw new Error(`AI generation failed with all active models. Last error: ${lastError?.message || lastError}`);
  }

  private getOrderedModels(activeModels: string[]): string[] {
    const priority = ['rapidapi-gpt4', 'gemini-2.0', 'llama3-8b'];
    const ordered: string[] = [];
    priority.forEach(m => {
      if (activeModels.includes(m)) ordered.push(m);
    });
    // Append any custom models not in default priority list
    activeModels.forEach(m => {
      if (!ordered.includes(m)) ordered.push(m);
    });
    return ordered;
  }

  private selectBestModel(activeModels: string[]): string {
    // Prioritize models based on capability and speed
    const modelPriority = ['rapidapi-gpt4', 'gemini-2.0', 'llama3-8b'];
    
    for (const model of modelPriority) {
      if (activeModels.includes(model)) {
        return model;
      }
    }
    
    return activeModels[0] || 'rapidapi-gpt4';
  }

  private getContentType(platform: string): 'blog' | 'social' | 'video' | 'thread' {
    if (['hashnode', 'devto'].includes(platform)) return 'blog';
    if (['instagram', 'youtube'].includes(platform)) return 'video';
    if (platform === 'twitter') return 'thread';
    return 'social';
  }
}

export const contentGenerator = new ContentGenerator();
