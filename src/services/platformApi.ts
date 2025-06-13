
import { supabase } from '@/integrations/supabase/client';

export interface PostContent {
  title: string;
  content: string;
  tags?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  isReel?: boolean; // For Instagram reels vs posts
}

interface PlatformCredentials {
  access_token?: string;
  api_key?: string;
  api_secret?: string;
  access_token_secret?: string;
  person_id?: string;
  business_account_id?: string;
  publication_id?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  username?: string;
  password?: string;
  facebook_page_id?: string;
  app_id?: string;
  app_secret?: string;
  channel_id?: string;
  user_agent?: string;
  subreddits?: string;
  [key: string]: string | undefined;
}

export class PlatformAPI {
  private async getCredentials(platform: string): Promise<PlatformCredentials> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('platforms')
      .select('credentials')
      .eq('user_id', user.user.id)
      .eq('platform_name', platform)
      .eq('is_connected', true)
      .maybeSingle();

    if (error || !data) {
      console.error(`Platform ${platform} not connected:`, error);
      throw new Error(`Platform ${platform} not connected. Please configure it in Platform Setup.`);
    }
    return data.credentials as PlatformCredentials;
  }

  private async updateCredentials(platform: string, credentials: PlatformCredentials): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    await supabase
      .from('platforms')
      .update({ credentials })
      .eq('user_id', user.user.id)
      .eq('platform_name', platform);
  }

  private async refreshYouTubeToken(credentials: PlatformCredentials): Promise<string> {
    if (!credentials.refresh_token || !credentials.client_id || !credentials.client_secret) {
      throw new Error('Missing required credentials for token refresh');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: credentials.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh YouTube access token');
    }

    const data = await response.json();
    const newAccessToken = data.access_token;

    await this.updateCredentials('youtube', {
      ...credentials,
      access_token: newAccessToken,
    });

    return newAccessToken;
  }

  async postToHashnode(content: PostContent): Promise<string> {
    let result: any;
    const credentials = await this.getCredentials('hashnode');
    
    const response = await fetch('https://gql.hashnode.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': credentials.access_token || '',
      },
      body: JSON.stringify({
        query: `
          mutation PublishPost($input: PublishPostInput!) {
            publishPost(input: $input) {
              post {
                id
                url
              }
            }
          }
        `,
        variables: {
          input: {
            title: content.title,
            contentMarkdown: content.content,
            tags: content.tags?.map(tag => ({ name: tag })) || [],
            publicationId: credentials.publication_id || undefined,
          }
        }
      })
    });

    result = await response.json();
    if (result.errors) throw new Error(result.errors[0].message);
    
    return result.data.publishPost.post.id;
  }

  async postToDevTo(content: PostContent): Promise<string> {
    let result: any;
    const credentials = await this.getCredentials('devto');
    
    if (!credentials.api_key) {
      throw new Error('Dev.to API key not configured. Please add your Dev.to API key in Platform Setup.');
    }
    
    console.log('Posting to Dev.to with content:', { title: content.title, tags: content.tags });
    
    const response = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': credentials.api_key,
      },
      body: JSON.stringify({
        article: {
          title: content.title,
          body_markdown: content.content,
          tags: content.tags || [],
          published: true,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Dev.to API error:', response.status, errorText);
      
      if (response.status === 401) {
        throw new Error('Dev.to API key is invalid. Please update your credentials in Platform Setup.');
      } else if (response.status === 422) {
        throw new Error('Dev.to article validation failed. Check your content format.');
      } else {
        throw new Error(`Dev.to API error: ${response.status} - ${errorText}`);
      }
    }

    result = await response.json();
    console.log('Dev.to post successful:', result);
    return result.id.toString();
  }

  async postToTwitter(content: PostContent): Promise<string> {
    try {
      const { data, error } = await supabase.functions.invoke('post-to-twitter', {
        body: { 
          content: content.content,
          mediaUrl: content.mediaUrl,
          mediaType: content.mediaType
        }
      });

      if (error) throw error;
      return data.tweetId;
    } catch (error) {
      console.error('Twitter posting failed:', error);
      throw new Error('Failed to post to Twitter');
    }
  }

  async postToLinkedIn(content: PostContent): Promise<string> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');
    let credentials = await this.getCredentials('linkedin');
    
    const personId = credentials.person_id || '';
    let result: any;
    
    let response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.access_token || ''}`,
      },
      body: JSON.stringify({
        author: personId,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content.content,
            },
            shareMediaCategory: 'NONE',
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      })
    });

    result = await response.json();
    if (!response.ok && response.status === 401) {
      // Try refresh
      try {
        const refreshed = await import('./tokenRefresher').then(m => m.refreshLinkedIn(user.user!.id));
        credentials = refreshed;
        response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${credentials.access_token}`,
          },
          body: JSON.stringify({
            author: personId,
            lifecycleState: 'PUBLISHED',
            specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: content.content }, shareMediaCategory: 'NONE' } },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
          }),
        });
      } catch {/* fallthrough */}
    }
    result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Failed to post to LinkedIn');
    
    return result.id;
  }

  async postToInstagram(content: PostContent): Promise<string> {
    const credentials = await this.getCredentials('instagram');
    
    if (!content.mediaUrl) throw new Error('Instagram posts require media');
    
    const isReel = content.isReel || content.mediaType === 'video';
    const mediaType = isReel ? 'REELS' : 'IMAGE';
    
    // Create media container
    const mediaResponse = await fetch(`https://graph.facebook.com/v18.0/${credentials.business_account_id || ''}/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        [isReel ? 'video_url' : 'image_url']: content.mediaUrl,
        caption: content.content,
        media_type: mediaType,
        access_token: credentials.access_token || '',
      })
    });

    const mediaResult = await mediaResponse.json();
    if (!mediaResponse.ok) throw new Error(mediaResult.error?.message || 'Failed to create Instagram media');

    // For reels, we need to wait for processing
    if (isReel) {
      await this.waitForInstagramVideoProcessing(mediaResult.id, credentials.access_token || '');
    }

    // Publish media
    const publishResponse = await fetch(`https://graph.facebook.com/v18.0/${credentials.business_account_id || ''}/media_publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        creation_id: mediaResult.id,
        access_token: credentials.access_token || '',
      })
    });

    const publishResult = await publishResponse.json();
    if (!publishResponse.ok) throw new Error(publishResult.error?.message || 'Failed to publish to Instagram');
    
    return publishResult.id;
  }

  private async waitForInstagramVideoProcessing(containerId: string, accessToken: string): Promise<void> {
    const maxAttempts = 30;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const statusResponse = await fetch(`https://graph.facebook.com/v18.0/${containerId}?fields=status_code&access_token=${accessToken}`);
      const statusResult = await statusResponse.json();
      
      if (statusResult.status_code === 'FINISHED') {
        return;
      } else if (statusResult.status_code === 'ERROR') {
        throw new Error('Instagram video processing failed');
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }
    
    throw new Error('Instagram video processing timeout');
  }

  async postToYouTube(content: PostContent): Promise<string> {
    const credentials = await this.getCredentials('youtube');
    
    if (!content.mediaUrl || content.mediaType !== 'video') {
      throw new Error('YouTube Shorts require video content');
    }
    
    let accessToken = credentials.access_token;
    
    try {
      // Test current token
      let testResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (testResponse.status === 401) {
        accessToken = await this.refreshYouTubeToken(credentials);
      }
      
      // Upload video as YouTube Short
      const { data, error } = await supabase.functions.invoke('upload-youtube-short', {
        body: { 
          videoUrl: content.mediaUrl,
          title: content.title,
          description: content.content,
          tags: content.tags,
          accessToken
        }
      });

      if (error) throw error;
      return data.videoId;
      
    } catch (error) {
      console.error('YouTube upload failed:', error);
      throw new Error('Failed to upload to YouTube');
    }
  }

  async postToReddit(content: PostContent): Promise<string> {
    let result: any;
    const credentials = await this.getCredentials('reddit');
    
    // Get user's preferred subreddits or use default programming-related ones
    const subreddits = credentials.subreddits ? 
      credentials.subreddits.split(',') : 
      ['programming', 'webdev', 'javascript', 'typescript'];
    
    // Select an appropriate subreddit based on content tags
    const selectedSubreddit = this.selectSubreddit(content.tags || [], subreddits);
    
    const response = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${credentials.access_token || ''}`,
      },
      body: new URLSearchParams({
        api_type: 'json',
        kind: 'self',
        sr: selectedSubreddit,
        title: content.title,
        text: content.content,
      })
    });

    result = await response.json();
    if (!response.ok) throw new Error('Failed to post to Reddit');
    
    return result.json.data.id;
  }

  private selectSubreddit(tags: string[], availableSubreddits: string[]): string {
    // Map tags to subreddits
    const tagToSubreddit: Record<string, string> = {
      'javascript': 'javascript',
      'typescript': 'typescript',
      'react': 'reactjs',
      'webdev': 'webdev',
      'programming': 'programming',
      'coding': 'programming'
    };
    
    for (const tag of tags) {
      const mappedSubreddit = tagToSubreddit[tag.toLowerCase()];
      if (mappedSubreddit && availableSubreddits.includes(mappedSubreddit)) {
        return mappedSubreddit;
      }
    }
    
    return availableSubreddits[0] || 'programming';
  }
}

export const platformAPI = new PlatformAPI();
