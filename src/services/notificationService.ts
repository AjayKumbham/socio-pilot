
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface NotificationData {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  platform?: string;
  action?: string;
  timestamp: string;
}

export class NotificationService {
  async showNotification(data: NotificationData) {
    // Show toast notification
    switch (data.type) {
      case 'success':
        toast.success(data.title, { description: data.message });
        break;
      case 'error':
        toast.error(data.title, { description: data.message });
        break;
      case 'warning':
        toast.warning(data.title, { description: data.message });
        break;
      case 'info':
        toast.info(data.title, { description: data.message });
        break;
    }

    // Store notification in database
    await this.saveNotification(data);
  }

  private async saveNotification(data: NotificationData) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    try {
      await supabase
        .from('notifications')
        .insert({
          user_id: user.user.id,
          type: data.type,
          title: data.title,
          message: data.message,
          platform: data.platform,
          action: data.action,
          created_at: data.timestamp,
          read: false
        });
    } catch (error) {
      console.error('Failed to save notification:', error);
    }
  }

  async notifyPostSuccess(platform: string, postTitle: string, postUrl?: string) {
    await this.showNotification({
      type: 'success',
      title: 'Post Published Successfully',
      message: `"${postTitle}" was published to ${platform}${postUrl ? ` - ${postUrl}` : ''}`,
      platform,
      action: 'post_published',
      timestamp: new Date().toISOString()
    });
  }

  async notifyPostError(platform: string, postTitle: string, error: string) {
    await this.showNotification({
      type: 'error',
      title: 'Post Publishing Failed',
      message: `Failed to publish "${postTitle}" to ${platform}: ${error}`,
      platform,
      action: 'post_failed',
      timestamp: new Date().toISOString()
    });
  }

  async notifyContentGenerated(platform: string, contentType: string) {
    await this.showNotification({
      type: 'info',
      title: 'Content Generated',
      message: `New ${contentType} content generated for ${platform}`,
      platform,
      action: 'content_generated',
      timestamp: new Date().toISOString()
    });
  }

  async notifyRateLimitWarning(platform: string) {
    await this.showNotification({
      type: 'warning',
      title: 'Rate Limit Approaching',
      message: `Approaching rate limit for ${platform}. Posts may be delayed.`,
      platform,
      action: 'rate_limit_warning',
      timestamp: new Date().toISOString()
    });
  }

  async notifyDailyLimit(platform: string) {
    await this.showNotification({
      type: 'warning',
      title: 'Daily Post Limit Reached',
      message: `Daily posting limit of 3 posts reached for ${platform}`,
      platform,
      action: 'daily_limit_reached',
      timestamp: new Date().toISOString()
    });
  }

  async notifySchedulingError(error: string) {
    await this.showNotification({
      type: 'error',
      title: 'Scheduling Error',
      message: `Content scheduling failed: ${error}`,
      action: 'scheduling_error',
      timestamp: new Date().toISOString()
    });
  }

  async getNotifications(limit = 50) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch notifications:', error);
      return [];
    }

    return data || [];
  }

  async markAsRead(notificationId: string) {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
  }

  async markAllAsRead() {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.user.id)
      .eq('read', false);
  }
}

export const notificationService = new NotificationService();
