
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Settings, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PlatformConfiguration } from './PlatformConfiguration';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Platform {
  id: string;
  name: string;
  type: string;
  color: string;
  maxPosts: number;
  connected: boolean;
  active: boolean;
  todayPosts: number;
}

const defaultPlatforms: Platform[] = [
  {
    id: 'hashnode',
    name: 'Hashnode',
    type: 'Blog Posts',
    color: 'from-blue-500 to-blue-600',
    maxPosts: 3,
    connected: false,
    active: false,
    todayPosts: 0,
  },
  {
    id: 'devto',
    name: 'Dev.to',
    type: 'Articles',
    color: 'from-green-500 to-green-600',
    maxPosts: 3,
    connected: false,
    active: false,
    todayPosts: 0,
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    type: 'Threads',
    color: 'from-gray-800 to-gray-900',
    maxPosts: 3,
    connected: false,
    active: false,
    todayPosts: 0,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    type: 'Posts',
    color: 'from-blue-600 to-blue-700',
    maxPosts: 3,
    connected: false,
    active: false,
    todayPosts: 0,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    type: 'Reels',
    color: 'from-pink-500 to-purple-600',
    maxPosts: 3,
    connected: false,
    active: false,
    todayPosts: 0,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    type: 'Shorts',
    color: 'from-red-500 to-red-600',
    maxPosts: 3,
    connected: false,
    active: false,
    todayPosts: 0,
  },
  {
    id: 'reddit',
    name: 'Reddit',
    type: 'Posts',
    color: 'from-orange-500 to-orange-600',
    maxPosts: 3,
    connected: false,
    active: false,
    todayPosts: 0,
  },
];

export const PlatformGrid = () => {
  const { user } = useAuth();
  const [platforms, setPlatforms] = useState<Platform[]>(defaultPlatforms);
  const [setupPlatform, setSetupPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadPlatformData();
      loadTodaysPosts();
    }
  }, [user]);

  const loadPlatformData = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('platforms')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error loading platforms:', error);
      return;
    }

    setPlatforms(prev => prev.map(platform => {
      const dbPlatform = data?.find(p => p.platform_name === platform.id);
      return {
        ...platform,
        connected: dbPlatform?.is_connected || false,
        active: dbPlatform?.is_active || false,
      };
    }));
  };

  const loadTodaysPosts = async () => {
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await supabase
      .from('content_posts')
      .select('platform_name')
      .eq('user_id', user.id)
      .eq('status', 'posted')
      .gte('posted_at', today.toISOString())
      .lt('posted_at', tomorrow.toISOString());

    if (error) {
      console.error('Error loading today\'s posts:', error);
      return;
    }

    const postCounts = data?.reduce((acc: Record<string, number>, post) => {
      acc[post.platform_name] = (acc[post.platform_name] || 0) + 1;
      return acc;
    }, {});

    setPlatforms(prev => prev.map(platform => ({
      ...platform,
      todayPosts: postCounts?.[platform.id] || 0,
    })));
  };

  const togglePlatform = async (id: string) => {
    if (!user) return;

    const platform = platforms.find(p => p.id === id);
    if (!platform?.connected) {
      setSetupPlatform(id);
      return;
    }

    const newActive = !platform.active;

    const { error } = await supabase
      .from('platforms')
      .update({ is_active: newActive })
      .eq('user_id', user.id)
      .eq('platform_name', id);

    if (error) {
      console.error('Error updating platform:', error);
      return;
    }

    setPlatforms(prev =>
      prev.map(p =>
        p.id === id ? { ...p, active: newActive } : p
      )
    );
  };

  const handleSetupSuccess = () => {
    loadPlatformData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Publishing Platforms</h2>
        <Badge variant="secondary" className="bg-blue-500/20 text-blue-300">
          {platforms.filter(p => p.active).length} Active
        </Badge>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {platforms.map((platform) => (
          <Card
            key={platform.id}
            className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-all duration-200 hover:scale-105"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 bg-gradient-to-r ${platform.color} rounded-lg flex items-center justify-center`}>
                  <span className="text-white font-bold text-sm">
                    {platform.name.charAt(0)}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {platform.connected ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                  )}
                  <Switch
                    checked={platform.active}
                    onCheckedChange={() => togglePlatform(platform.id)}
                  />
                </div>
              </div>
              
              <CardTitle className="text-white text-lg">
                {platform.name}
              </CardTitle>
              <p className="text-gray-400 text-sm">{platform.type}</p>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Today's Posts</span>
                <span className="text-white">
                  {platform.todayPosts}/{platform.maxPosts}
                </span>
              </div>

              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 bg-gradient-to-r ${platform.color} rounded-full transition-all duration-300`}
                  style={{ width: `${(platform.todayPosts / platform.maxPosts) * 100}%` }}
                ></div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Badge
                  variant={platform.connected ? "default" : "destructive"}
                  className="text-xs"
                >
                  {platform.connected ? 'Connected' : 'Setup Required'}
                </Badge>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white p-1"
                  onClick={() => setSetupPlatform(platform.id)}
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {setupPlatform && (
        <PlatformConfiguration
          platform={setupPlatform}
          isOpen={!!setupPlatform}
          onClose={() => setSetupPlatform(null)}
          onSuccess={handleSetupSuccess}
        />
      )}
    </div>
  );
};
