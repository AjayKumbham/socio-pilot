
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot, Play, Pause, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { schedulerManager } from '@/services/schedulerManager';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentIST, getISTDayBoundsUTC, formatISTTime } from '@/utils/timeUtils';

export const AutoStatusBanner = () => {
  const { user } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [nextPost, setNextPost] = useState<Date | null>(null);
  const [activePlatforms, setActivePlatforms] = useState(0);
  const [todaysPosts, setTodaysPosts] = useState(0);
  const [schedulerStatus, setSchedulerStatus] = useState<any>({});

  useEffect(() => {
    if (!user) return;

    const persistedActive = localStorage.getItem('scheduler_active') === 'true';
    if (persistedActive && !schedulerManager.getStatus().isRunning) {
      schedulerManager.startAutonomousMode().catch(console.error);
    }
    setIsActive(persistedActive);

    // Always load status once to render UI
    loadStatus();

    // Only keep polling when scheduler is running
    if (persistedActive) {
      const interval = setInterval(loadStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [user, isActive]);

  const loadStatus = async () => {
    if (!user) return;

    try {
      // Get scheduler status
      const status = schedulerManager.getStatus();
      setSchedulerStatus(status);
      setIsActive(status.isRunning);
      setNextPost(status.nextJob);

      // Check active schedules
      const { data: schedules } = await supabase
        .from('posting_schedule')
        .select('platform_name')
        .eq('user_id', user.id)
        .eq('is_active', true);

      setActivePlatforms(schedules?.length || 0);

      // Get today's posts count with proper IST handling
      const { startUTC, endUTC } = getISTDayBoundsUTC();

      {
        // Only verbose log when scheduler is running
        if (schedulerManager.getStatus().isRunning) {
          console.log('Current IST time:', formatISTTime(getCurrentIST()));
          console.log('Checking posts between:', startUTC.toISOString(), 'and', endUTC.toISOString());
        }
      }

      const { data: todaysPostsData, error } = await supabase
        .from('content_posts')
        .select('id, status, scheduled_for, posted_at, created_at')
        .eq('user_id', user.id)
        .gte('scheduled_for', startUTC.toISOString())
        .lt('scheduled_for', endUTC.toISOString());

      if (error) {
        console.error('Error fetching today\'s posts:', error);
      } else {
        console.log('Found posts for today:', todaysPostsData);
        setTodaysPosts(todaysPostsData?.length || 0);
      }

    } catch (error) {
      console.error('Failed to load status:', error);
    }
  };

  const toggleAutonomousMode = async () => {
    if (isActive) {
      schedulerManager.stop();
      localStorage.setItem('scheduler_active', 'false');
      setIsActive(false);
    } else {
      await schedulerManager.startAutonomousMode();
      localStorage.setItem('scheduler_active', 'true');
      setIsActive(true);
      // Reload status after starting
      setTimeout(loadStatus, 1000);
    }
  };

  const formatTimeUntilNext = () => {
    if (!nextPost) return 'No posts scheduled';
    
    const now = new Date();
    const diff = nextPost.getTime() - now.getTime();
    
    if (diff <= 0) return 'Posting now...';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <Card className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30 mb-6">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Bot className="w-6 h-6 text-purple-400" />
              <div>
                <h3 className="text-white font-semibold">Autonomous Content Publisher</h3>
                <p className="text-gray-400 text-sm">AI-powered multi-platform publishing</p>
              </div>
            </div>
            
            <Badge 
              variant={isActive ? "default" : "secondary"}
              className={isActive ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}
            >
              {isActive ? (
                <>
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Active
                </>
              ) : (
                <>
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Inactive
                </>
              )}
            </Badge>
          </div>

          <div className="flex items-center space-x-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{activePlatforms}</div>
              <div className="text-xs text-gray-400">Active Schedules</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{todaysPosts}</div>
              <div className="text-xs text-gray-400">Posts Today</div>
            </div>
            
            <div className="text-center">
              <div className="text-lg font-bold text-purple-400 flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                {formatTimeUntilNext()}
              </div>
              <div className="text-xs text-gray-400">Next Post</div>
            </div>

            <Button
              onClick={toggleAutonomousMode}
              variant={isActive ? "destructive" : "default"}
              className={isActive ? "" : "bg-green-600 hover:bg-green-700"}
              size="sm"
            >
              {isActive ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Auto Mode
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};
