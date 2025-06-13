
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Calendar, Zap, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { schedulerManager } from '@/services/schedulerManager';
import { getCurrentIST, formatISTTime } from '@/utils/timeUtils';

interface ScheduledPost {
  id: string;
  platform_name: string;
  title: string;
  scheduled_for: string;
  status: string;
  post_type: string;
}

export const ScheduleOverview = () => {
  const { user } = useAuth();
  const [upcomingPosts, setUpcomingPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSchedulerActive, setIsSchedulerActive] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState<any>({});

  useEffect(() => {
    if (user) {
      loadUpcomingPosts();
      checkSchedulerStatus();
      
      // Check scheduler status every 30 seconds
      const interval = setInterval(() => {
        checkSchedulerStatus();
        loadUpcomingPosts();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [user]);

  const loadUpcomingPosts = async () => {
    if (!user) return;
    
    try {
      // Get current time for querying upcoming posts
      const now = new Date();
      
      // Query from current time onwards to get upcoming posts
      const { data, error } = await supabase
        .from('content_posts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'scheduled')
        .not('scheduled_for', 'is', null)
        .gte('scheduled_for', now.toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Error loading upcoming posts:', error);
      } else {
        console.log('Loaded upcoming posts:', data);
        setUpcomingPosts(data || []);
      }
    } catch (error) {
      console.error('Failed to load upcoming posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkSchedulerStatus = async () => {
    if (!user) return;
    
    try {
      const status = schedulerManager.getStatus();
      setSchedulerStatus(status);
      setIsSchedulerActive(status.isRunning);
    } catch (error) {
      console.error('Failed to check scheduler status:', error);
    }
  };

  const formatScheduledTime = (utcTime: string) => {
    return formatISTTime(utcTime, { 
      dateStyle: 'short', 
      timeStyle: 'short',
      hour12: false 
    });
  };

  const getPlatformColor = (platform: string) => {
    const colors: { [key: string]: string } = {
      'linkedin': 'bg-blue-500/20 text-blue-400',
      'hashnode': 'bg-green-500/20 text-green-400',
      'devto': 'bg-purple-500/20 text-purple-400',
      'twitter': 'bg-cyan-500/20 text-cyan-400',
      'instagram': 'bg-pink-500/20 text-pink-400',
      'youtube': 'bg-red-500/20 text-red-400',
      'reddit': 'bg-orange-500/20 text-orange-400',
    };
    return colors[platform] || 'bg-gray-500/20 text-gray-400';
  };

  const forceGenerateContent = async () => {
    setLoading(true);
    try {
      await schedulerManager.forceGenerateContent();
      await loadUpcomingPosts();
    } catch (error) {
      console.error('Failed to force generate content:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="flex items-center justify-center p-6">
          <div className="text-gray-400">Loading schedule...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <div className="flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-400" />
            Today's Schedule (IST - 24H)
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={forceGenerateContent}
            className="border-slate-600 text-gray-300 hover:bg-slate-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate Now
          </Button>
        </CardTitle>
        <p className="text-sm text-gray-400">
          Current IST: {formatISTTime(getCurrentIST())}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className={`flex items-center justify-between p-3 border rounded-lg ${
          isSchedulerActive && schedulerStatus.isRunning
            ? 'bg-green-500/10 border-green-500/20' 
            : 'bg-red-500/10 border-red-500/20'
        }`}>
          <div className="flex items-center space-x-2">
            {isSchedulerActive && schedulerStatus.isRunning ? (
              <>
                <Zap className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-medium">AI Scheduler Running</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 font-medium">Scheduler Inactive</span>
              </>
            )}
          </div>
          <div className="text-right">
            <Badge className={
              isSchedulerActive && schedulerStatus.isRunning
                ? "bg-green-500/20 text-green-400" 
                : "bg-red-500/20 text-red-400"
            }>
              {isSchedulerActive && schedulerStatus.isRunning ? 'Active' : 'Inactive'}
            </Badge>
            {schedulerStatus.scheduledJobs > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {schedulerStatus.scheduledJobs} jobs queued
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center">
            <Clock className="w-4 h-4 mr-2" />
            Upcoming Posts
          </h4>
          
          {upcomingPosts.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400">No posts scheduled</div>
              <p className="text-sm text-gray-500 mt-2">
                {!isSchedulerActive 
                  ? 'Start the scheduler to generate content automatically' 
                  : 'Content will be generated based on your active schedules'
                }
              </p>
            </div>
          ) : (
            upcomingPosts.map((post) => (
              <div
                key={post.id}
                className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <div className="space-y-1">
                  <p className="text-white text-sm font-medium truncate">
                    {post.title}
                  </p>
                  <div className="flex items-center space-x-2">
                    <Badge
                      variant="secondary"
                      className={getPlatformColor(post.platform_name)}
                    >
                      {post.platform_name.charAt(0).toUpperCase() + post.platform_name.slice(1)}
                    </Badge>
                    <span className="text-gray-400 text-xs capitalize">{post.post_type}</span>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-white text-sm font-medium">
                    {formatScheduledTime(post.scheduled_for)}
                  </p>
                  <Badge variant="outline" className="text-xs border-slate-600 text-gray-400">
                    Scheduled
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
