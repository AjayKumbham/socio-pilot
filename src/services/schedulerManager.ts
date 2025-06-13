import { supabase } from '@/integrations/supabase/client';
import { platformAPI } from './platformApi';
import { contentGenerator } from './contentGenerator';
import { notificationService } from './notificationService';
import { toIST, fromIST, getCurrentIST, getISTDayBoundsUTC } from '@/utils/timeUtils';

interface ScheduleEntry {
  id: string;
  user_id: string;
  platform_name: string;
  max_posts_per_day: number;
  preferred_times: string[];
  days_of_week: number[];
  is_active: boolean;
}

interface PostingJob {
  attempts: number;
  platform: string;
  content: {
    title: string;
    content: string;
    tags?: string[];
    mediaUrl?: string;
  };
  scheduledTime: Date;
  postId: string;
}

export class SchedulerManager {
  private jobs: PostingJob[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private scheduleWatchInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private dailyGenerationScheduled = false;
  private processingJobs = new Set<string>();
  private lastProcessTime = 0;
  private lastScheduleState = '';

  async start() {
    if (this.isRunning) {
      console.log('🔄 Scheduler is already running');
      return;
    }

    console.log('🚀 Starting enhanced autonomous content scheduler...');
    this.isRunning = true;
    
    // Process scheduled posts every 60 seconds
    this.intervalId = setInterval(() => {
      this.processScheduledPosts();
    }, 60000);

    // Watch for schedule changes every 30 seconds for responsiveness
    this.scheduleWatchInterval = setInterval(() => {
      this.watchScheduleChanges();
    }, 30000);

    // Load existing scheduled posts
    await this.loadScheduledPosts();
    
    // Immediately generate content for today's schedules
    await this.generateContentForToday();
    
    // Schedule daily content generation at midnight IST
    if (!this.dailyGenerationScheduled) {
      this.scheduleDailyGeneration();
      this.dailyGenerationScheduled = true;
    }

    await notificationService.showNotification({
      type: 'info',
      title: 'Scheduler Started',
      message: 'Enhanced autonomous content scheduling is now active',
      timestamp: new Date().toISOString()
    });
  }

  async startAutonomousMode() {
    await this.start();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.scheduleWatchInterval) {
      clearInterval(this.scheduleWatchInterval);
      this.scheduleWatchInterval = null;
    }
    this.isRunning = false;
    this.processingJobs.clear();
    this.lastProcessTime = 0;
    this.lastScheduleState = '';
    console.log('🛑 Scheduler stopped');
  }

  private async watchScheduleChanges() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      // Get current schedule state
      const { data: schedules } = await supabase
        .from('posting_schedule')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('is_active', true);

      const currentScheduleState = JSON.stringify(schedules?.map(s => ({
        id: s.id,
        platform: s.platform_name,
        times: s.preferred_times,
        days: s.days_of_week,
        maxPosts: s.max_posts_per_day,
        active: s.is_active
      })) || []);

      // Check if schedule state has changed
      if (this.lastScheduleState !== currentScheduleState) {
        console.log('📊 Schedule state changed, checking for today\'s schedules...');
        this.lastScheduleState = currentScheduleState;
        
        // Get current day of week in IST (0 = Sunday, 1 = Monday, etc.)
        const istNow = getCurrentIST();
        const currentDayOfWeek = istNow.getDay();
        
        // Filter schedules for today
        const todaySchedules = schedules?.filter(schedule => {
          const daysRaw = Array.isArray(schedule.days_of_week) ? schedule.days_of_week : [];
          const daysOfWeek = daysRaw.map((d: any) => typeof d === 'string' ? parseInt(d, 10) : d);
          return daysOfWeek.includes(currentDayOfWeek);
        }) || [];

        if (todaySchedules.length > 0) {
          console.log(`📝 Found ${todaySchedules.length} active schedules for today, generating content...`);
          // Generate content only for today's schedules
          for (const schedule of todaySchedules) {
            const hasContent = await this.hasContentForToday(schedule.platform_name);
            if (!hasContent) {
              console.log(`📝 Generating content for ${schedule.platform_name}`);
              await this.scheduleContentForPlatform(schedule);
            }
          }
        } else {
          console.log('📅 No active schedules for today, skipping content generation');
        }
      }
    } catch (error) {
      console.error('❌ Failed to watch schedule changes:', error);
    }
  }

  private scheduleDailyGeneration() {
    // Calculate IST time
    const istNow = getCurrentIST();
    
    // Calculate next midnight in IST
    const nextMidnightIST = new Date(istNow);
    nextMidnightIST.setHours(24, 0, 0, 0); // Next day at 00:00
    
    // Convert back to UTC for setTimeout
    const nextMidnightUTC = fromIST(nextMidnightIST);
    const msUntilMidnight = nextMidnightUTC.getTime() - new Date().getTime();
    
    console.log(`⏰ Next daily generation scheduled for: ${nextMidnightIST.toLocaleString('en-IN')} IST`);
    
    setTimeout(() => {
      this.generateContentForToday();
      // Set up daily interval (24 hours)
      setInterval(() => this.generateContentForToday(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  private async generateContentForToday() {
    try {
      console.log('🎯 Generating content for today\'s schedules...');
      
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        console.log('❌ No authenticated user found');
        return;
      }

      // Get current IST date and day
      const istNow = getCurrentIST();
      const currentDayOfWeek = istNow.getDay(); // Sunday = 0, Monday = 1, etc.

      console.log(`📅 Current IST time: ${istNow.toLocaleString('en-IN')}`);
      console.log(`📅 Current day of week: ${currentDayOfWeek}`);

      // Get active schedules for today
      const { data: schedules, error } = await supabase
        .from('posting_schedule')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('is_active', true);

      if (error) {
        console.error('❌ Error fetching schedules:', error);
        return;
      }

      if (!schedules || schedules.length === 0) {
        console.log('📝 No active posting schedules found');
        return;
      }

      // Filter schedules for today
      const todaySchedules = schedules.filter(schedule => {
        const daysRaw = Array.isArray(schedule.days_of_week) ? schedule.days_of_week : [];
        const daysOfWeek = daysRaw.map((d: any) => typeof d === 'string' ? parseInt(d, 10) : d);
        return daysOfWeek.includes(currentDayOfWeek);
      });

      if (todaySchedules.length === 0) {
        console.log(`📅 No schedules active for today (day ${currentDayOfWeek})`);
        return;
      }

      console.log(`📋 Found ${todaySchedules.length} active schedules for today`);

      // Generate content for each platform that doesn't have content for today
      for (const schedule of todaySchedules) {
        const hasContent = await this.hasContentForToday(schedule.platform_name);
        if (!hasContent) {
          console.log(`📝 Generating content for ${schedule.platform_name}`);
          await this.scheduleContentForPlatform(schedule);
        } else {
          console.log(`✅ ${schedule.platform_name} already has content for today`);
        }
      }

    } catch (error) {
      console.error('❌ Failed to generate content for today:', error);
    }
  }

  private async hasContentForToday(platformName: string): Promise<boolean> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return false;

      // Get today's date range in IST, converted to UTC
      const { startUTC, endUTC } = getISTDayBoundsUTC();

      console.log(`🔍 Checking for existing content for ${platformName} between ${startUTC.toISOString()} and ${endUTC.toISOString()}`);

      const { data: posts } = await supabase
        .from('content_posts')
        .select('id, status, scheduled_for')
        .eq('user_id', user.user.id)
        .eq('platform_name', platformName)
        .in('status', ['posted', 'published'])
        .gte('scheduled_for', startUTC.toISOString())
        .lt('scheduled_for', endUTC.toISOString());

      console.log(`📊 Found ${posts?.length || 0} existing posts for ${platformName} today`);
      return posts && posts.length > 0;
    } catch (error) {
      console.error('❌ Failed to check existing content:', error);
      return false;
    }
  }

  private async scheduleContentForPlatform(schedule: any) {
    try {
      // Get AI settings for topics
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('topics')
        .eq('user_id', schedule.user_id)
        .single();

      const topics = Array.isArray(aiSettings?.topics) && aiSettings.topics.length > 0
        ? (aiSettings.topics as string[])
        : ['Technology', 'Programming', 'AI', 'Web Development'];

      const maxPosts = schedule.max_posts_per_day || 3;
      const preferredTimes = Array.isArray(schedule.preferred_times) 
        ? schedule.preferred_times 
        : ['09:00', '14:00', '18:00'];

      console.log(`📝 Scheduling content for ${schedule.platform_name}: ${maxPosts} posts at ${preferredTimes.join(', ')} IST`);

      // Generate content for today's time slots
      for (let i = 0; i < Math.min(maxPosts, preferredTimes.length); i++) {
        const randomTopic = topics[Math.floor(Math.random() * topics.length)];
        console.log(`🎯 Generating content for ${schedule.platform_name} on topic: ${randomTopic}`);
        
        try {
          // Generate content using the AI service
          const content = await contentGenerator.generateContent(schedule.platform_name, randomTopic);

          // Calculate posting time for today in IST
          const [hours, minutes] = preferredTimes[i].split(':').map(Number);
          const istNow = getCurrentIST();
          
          // Create scheduled time for today in IST
          const scheduledTimeIST = new Date(istNow);
          scheduledTimeIST.setHours(hours, minutes, 0, 0);
          
          // If time has passed today, schedule for next occurrence
          if (scheduledTimeIST <= istNow) {
            const currentDayOfWeek = istNow.getDay();
            const daysOfWeek = Array.isArray(schedule.days_of_week) ? schedule.days_of_week : [];
            
            // Find next day in the schedule
            let daysToAdd = 1;
            for (let j = 1; j <= 7; j++) {
              const checkDay = (currentDayOfWeek + j) % 7;
              if (daysOfWeek.includes(checkDay)) {
                daysToAdd = j;
                break;
              }
            }
            
            scheduledTimeIST.setDate(scheduledTimeIST.getDate() + daysToAdd);
          }
          
          // Convert to UTC for storage
          const scheduledTimeUTC = fromIST(scheduledTimeIST);

          console.log(`⏰ Scheduling for ${scheduledTimeIST.toLocaleString('en-IN')} IST`);

          // Save to database with correct post_type
          const { data: postData, error } = await supabase.from('content_posts').insert({
            user_id: schedule.user_id,
            platform_name: schedule.platform_name,
            post_type: this.getPostType(schedule.platform_name),
            title: content.title,
            content: content.content,
            media_url: content.mediaUrl,
            status: 'scheduled',
            scheduled_for: scheduledTimeUTC.toISOString(),
          }).select().single();

          if (error) {
            console.error(`❌ Failed to save content for ${schedule.platform_name}:`, error);
            continue;
          }

          // Add to jobs queue
          this.jobs.push({
            attempts: 0,
            platform: schedule.platform_name,
            content,
            scheduledTime: scheduledTimeUTC,
            postId: postData.id,
          });

          console.log(`✅ Content scheduled for ${schedule.platform_name}`);

        } catch (contentError) {
          console.error(`❌ Failed to generate content for ${schedule.platform_name}:`, contentError);
            await notificationService.showNotification({
              type: 'error',
              title: 'Content Generation Failed',
              message: `AI failed to generate content for ${schedule.platform_name}.`,
              timestamp: new Date().toISOString()
            });
        }
      }
    } catch (error) {
      console.error(`❌ Failed to schedule content for ${schedule.platform_name}:`, error);
    }
  }

  private async loadScheduledPosts() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data: posts } = await supabase
        .from('content_posts')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('status', 'scheduled')
        .not('scheduled_for', 'is', null);

      if (posts) {
        this.jobs = posts.map(post => ({
          attempts: 0,
          platform: post.platform_name,
          content: {
            title: post.title,
            content: post.content,
            tags: post.platform_name === 'hashnode' || post.platform_name === 'devto' ? [] : undefined,
            mediaUrl: post.media_url || undefined,
          },
          scheduledTime: new Date(post.scheduled_for!),
          postId: post.id,
        }));
        
        console.log(`📋 Loaded ${this.jobs.length} scheduled posts`);
      }
    } catch (error) {
      console.error('❌ Failed to load scheduled posts:', error);
    }
  }

  private async processScheduledPosts() {
    const now = Date.now();
    
    // Prevent rapid processing
    if (now - this.lastProcessTime < 30000) {
      return;
    }
    
    this.lastProcessTime = now;

    if (this.jobs.length === 0) return;

    const currentTime = new Date();
    const dueJobs = this.jobs.filter(job => 
      job.scheduledTime <= currentTime && !this.processingJobs.has(job.postId)
    );

    if (dueJobs.length === 0) return;

    console.log(`📝 Processing ${dueJobs.length} due posts...`);

    for (const job of dueJobs) {
      if (this.processingJobs.has(job.postId)) continue;
      
      this.processingJobs.add(job.postId);
      
      try {
        console.log(`🚀 Posting to ${job.platform}...`);
        
        // Update status to posting
        await supabase
          .from('content_posts')
          .update({ status: 'posting' })
          .eq('id', job.postId);

        let postId: string;
        
        // Post to platform using platformAPI
        switch (job.platform) {
          case 'hashnode':
            postId = await platformAPI.postToHashnode(job.content);
            break;
          case 'devto':
            postId = await platformAPI.postToDevTo(job.content);
            break;
          case 'twitter':
            postId = await platformAPI.postToTwitter(job.content);
            break;
          case 'linkedin':
            postId = await platformAPI.postToLinkedIn(job.content);
            break;
          case 'instagram':
            postId = await platformAPI.postToInstagram(job.content);
            break;
          case 'youtube':
            postId = await platformAPI.postToYouTube(job.content);
            break;
          case 'reddit':
            postId = await platformAPI.postToReddit(job.content);
            break;
          default:
            throw new Error(`Unsupported platform: ${job.platform}`);
        }

        // Update status to published
        await supabase
          .from('content_posts')
          .update({ 
            status: 'published',
            platform_post_id: postId,
            posted_at: new Date().toISOString()
          })
          .eq('id', job.postId);

        // Remove from jobs
        this.jobs = this.jobs.filter(j => j.postId !== job.postId);
        
        console.log(`✅ Successfully posted to ${job.platform}`);

        await notificationService.showNotification({
          type: 'success',
          title: 'Post Published',
          message: `Successfully posted to ${job.platform}`,
          platform: job.platform,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error(`❌ Failed to post to ${job.platform} (attempt ${job.attempts}):`, error);
        
        // Retry logic
        job.attempts += 1;
        if (job.attempts < 3) {
          const backoffMs = Math.pow(2, job.attempts) * 60000; // exponential back-off: 1m, 2m, 4m
          job.scheduledTime = new Date(Date.now() + backoffMs);
          console.log(`🔄 Scheduling retry #${job.attempts} for ${job.platform} in ${backoffMs/1000}s`);
          await notificationService.showNotification({
            type: 'warning',
            title: 'Retry Scheduled',
            message: `Retry #${job.attempts} for ${job.platform} scheduled in ${backoffMs/1000}s`,
            platform: job.platform,
            timestamp: new Date().toISOString()
          });
          continue;
        }

        // Exhausted retries
        await supabase
          .from('content_posts')
          .update({ status: 'failed', error_message: (error as Error).message })
          .eq('id', job.postId);
        await notificationService.showNotification({
          type: 'error',
          title: 'Post Failed',
          message: `Failed to post to ${job.platform}: ${(error as Error).message}`,
          platform: job.platform,
          timestamp: new Date().toISOString()
        });
      } finally {
        this.processingJobs.delete(job.postId);
      }
    }
  }

  async forceGenerateContent() {
    console.log('🔥 Force generating content for today...');
    await this.generateContentForToday();
  }

  getStatus() {
    const nextJob = this.jobs.length > 0 ? 
      this.jobs.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime())[0].scheduledTime : 
      null;
      
    return {
      isRunning: this.isRunning,
      scheduledJobs: this.jobs.length,
      processingJobs: this.processingJobs.size,
      lastProcessTime: this.lastProcessTime,
      nextJob
    };
  }

  private getPostType(platform: string): string {
    const postTypes: { [key: string]: string } = {
      'hashnode': 'blog',
      'devto': 'blog',
      'twitter': 'social',
      'linkedin': 'social',
      'instagram': 'social',
      'youtube': 'video',
      'reddit': 'social'
    };
    return postTypes[platform] || 'social';
  }
}

export const schedulerManager = new SchedulerManager();
