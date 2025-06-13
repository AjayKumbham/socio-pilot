import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Save, CheckCircle, XCircle, TestTube } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';

interface PlatformConfigurationProps {
  platform: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface PlatformCredentials {
  [key: string]: string | undefined;
}

export const PlatformConfiguration = ({ platform, isOpen, onClose, onSuccess }: PlatformConfigurationProps) => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<PlatformCredentials>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (user && platform && isOpen) {
      loadCredentials();
    }
  }, [user, platform, isOpen]);

  const loadCredentials = async () => {
    try {
      const { data, error } = await supabase
        .from('platforms')
        .select('credentials')
        .eq('user_id', user?.id)
        .eq('platform_name', platform)
        .maybeSingle();

      if (data && !error) {
        setCredentials(data.credentials as PlatformCredentials);
      } else if (error && error.code !== 'PGRST116') {
        console.error('Error loading credentials:', error);
      }
    } catch (error) {
      console.error('Failed to load platform credentials:', error);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-platform-connection', {
        body: { 
          platform,
          credentials
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Connection Successful",
          description: `${platform} credentials are valid`,
        });

        // Handle special cases like LinkedIn that return additional data
        if (data.userInfo?.sub && platform === 'linkedin') {
          setCredentials(prev => ({ ...prev, person_id: data.userInfo.sub }));
        }
        
        // Handle YouTube token refresh
        if (data.newAccessToken && platform === 'youtube') {
          setCredentials(prev => ({ ...prev, access_token: data.newAccessToken }));
        }
      } else {
        toast({
          title: "Connection Failed",
          description: data.error || `Failed to connect to ${platform}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      toast({
        title: "Test Failed",
        description: `Failed to test ${platform} connection`,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      // Use upsert to handle both insert and update cases
      const { error } = await supabase
        .from('platforms')
        .upsert({
          user_id: user.id,
          platform_name: platform,
          credentials: credentials as any,
          is_connected: true,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,platform_name'
        });

      if (error) throw error;

      toast({
        title: "Platform Connected",
        description: `${platform} has been connected successfully`,
      });

      onSuccess();
      onClose();

    } catch (error) {
      console.error('Failed to save platform credentials:', error);
      toast({
        title: "Connection Failed",
        description: `Failed to connect ${platform}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateCredential = (key: string, value: string) => {
    setCredentials(prev => ({ ...prev, [key]: value }));
  };

  const getPlatformConfig = (platformName: string) => {
    const configs = {
      twitter: {
        name: 'X (Twitter)',
        fields: [
          { key: 'api_key', label: 'API Key', required: true },
          { key: 'api_secret', label: 'API Secret', required: true },
          { key: 'access_token', label: 'Access Token', required: true },
          { key: 'access_token_secret', label: 'Access Token Secret', required: true },
          { key: 'bearer_token', label: 'Bearer Token', required: true }
        ],
        docsUrl: 'https://developer.twitter.com/en/portal/dashboard'
      },
      linkedin: {
        name: 'LinkedIn',
        fields: [
          { key: 'access_token', label: 'Access Token', required: true },
          { key: 'client_id', label: 'Client ID', required: false },
          { key: 'client_secret', label: 'Client Secret', required: false }
        ],
        docsUrl: 'https://www.linkedin.com/developers/apps'
      },
      instagram: {
        name: 'Instagram',
        fields: [
          { key: 'access_token', label: 'Access Token', required: true },
          { key: 'business_account_id', label: 'Business Account ID', required: true }
        ],
        docsUrl: 'https://developers.facebook.com/apps'
      },
      youtube: {
        name: 'YouTube',
        fields: [
          { key: 'access_token', label: 'Access Token', required: true },
          { key: 'refresh_token', label: 'Refresh Token', required: true },
          { key: 'client_id', label: 'Client ID', required: true },
          { key: 'client_secret', label: 'Client Secret', required: true }
        ],
        docsUrl: 'https://console.cloud.google.com/apis/credentials'
      },
      reddit: {
        name: 'Reddit',
        fields: [
          { key: 'client_id', label: 'Client ID', required: true },
          { key: 'client_secret', label: 'Client Secret', required: true },
          { key: 'username', label: 'Username', required: true },
          { key: 'password', label: 'Password', required: true },
          { key: 'user_agent', label: 'User Agent (e.g., myapp/1.0)', required: false }
        ],
        docsUrl: 'https://www.reddit.com/prefs/apps'
      },
      hashnode: {
        name: 'Hashnode',
        fields: [
          { key: 'access_token', label: 'Access Token', required: true },
          { key: 'publication_id', label: 'Publication ID (optional)', required: false }
        ],
        docsUrl: 'https://hashnode.com/settings/developer'
      },
      devto: {
        name: 'Dev.to',
        fields: [
          { key: 'api_key', label: 'API Key', required: true }
        ],
        docsUrl: 'https://dev.to/settings/extensions'
      }
    };

    return configs[platformName as keyof typeof configs] || {
      name: platformName,
      fields: [{ key: 'api_key', label: 'API Key', required: true }],
      docsUrl: '#'
    };
  };

  const config = getPlatformConfig(platform);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure {config.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {config.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key} className="text-gray-300">
                {field.label} {field.required && <span className="text-red-400">*</span>}
              </Label>
              <div className="relative">
                <Input
                  id={field.key}
                  type={showKeys[field.key] ? 'text' : 'password'}
                  value={credentials[field.key] || ''}
                  onChange={(e) => updateCredential(field.key, e.target.value)}
                  placeholder={`Enter your ${field.label}`}
                  className="bg-slate-700 border-slate-600 text-white pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-white"
                  onClick={() => toggleShowKey(field.key)}
                >
                  {showKeys[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          ))}

          <div className="flex justify-between items-center pt-4">
            <a
              href={config.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm underline"
            >
              Get API Keys →
            </a>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={testConnection}
                disabled={testing}
                className="border-blue-600 text-blue-400 hover:bg-blue-600/20"
              >
                <TestTube className="w-4 h-4 mr-2" />
                {testing ? 'Testing...' : 'Test'}
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
