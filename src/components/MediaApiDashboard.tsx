import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Save, CheckCircle, XCircle, Settings, TestTube } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface MediaApiCredentials {
  [key: string]: string | undefined;
  gemini_api_key?: string;
  pexels_api_key?: string;
}

export const MediaApiDashboard = () => {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<MediaApiCredentials>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadCredentials();
    }
  }, [user]);

  const loadCredentials = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      console.log('Loading media API credentials for user:', user.id);
      
      const { data: platform, error } = await supabase
        .from('media_api_credentials')
        .select('api_name, credentials, is_connected')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error loading media API credentials:', error);
        setLoading(false);
        return;
      }

      const creds: MediaApiCredentials = { gemini_api_key: '', pexels_api_key: '' };
      const connectedState: Record<string, boolean> = { gemini: false, pexels: false };

      (platform || []).forEach((row: any) => {
        if (row.api_name === 'gemini') {
          creds.gemini_api_key = row.credentials.gemini_api_key || '';
          connectedState.gemini = row.is_connected;
        } else if (row.api_name === 'pexels') {
          creds.pexels_api_key = row.credentials.pexels_api_key || '';
          connectedState.pexels = row.is_connected;
        }
      });

      setCredentials(creds);
      setConnected(connectedState);
    } catch (error) {
      console.error('Failed to load media API credentials:', error);
      toast({
        title: "Load Failed",
        description: "Failed to load API credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (apiType: string) => {
    setTesting(prev => ({ ...prev, [apiType]: true }));
    
    try {
      const testCredentials = apiType === 'gemini' 
        ? { gemini_api_key: credentials.gemini_api_key }
        : { pexels_api_key: credentials.pexels_api_key };

      const { data, error } = await supabase.functions.invoke('test-platform-connection', {
        body: { 
          platform: apiType,
          credentials: testCredentials
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Connection Successful",
          description: `${apiType} API credentials are valid`,
        });
        setConnected(prev => ({ ...prev, [apiType]: true }));
      } else {
        toast({
          title: "Connection Failed",
          description: data.error || `Failed to connect to ${apiType}`,
          variant: "destructive",
        });
        setConnected(prev => ({ ...prev, [apiType]: false }));
      }
    } catch (error) {
      console.error(`${apiType} connection test failed:`, error);
      toast({
        title: "Test Failed",
        description: `Failed to test ${apiType} connection`,
        variant: "destructive",
      });
      setConnected(prev => ({ ...prev, [apiType]: false }));
    } finally {
      setTesting(prev => ({ ...prev, [apiType]: false }));
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      console.log('Saving media API credentials...');

      const mediaCredentials = {
        gemini_api_key: credentials.gemini_api_key?.trim() || '',
        pexels_api_key: credentials.pexels_api_key?.trim() || ''
      };

      const hasCredentials = !!(mediaCredentials.gemini_api_key || mediaCredentials.pexels_api_key);

      // Use upsert to handle both insert and update
      const { error } = await supabase
        .from('media_api_credentials')
        .upsert([
          {
            user_id: user.id,
            api_name: 'gemini',
            credentials: { gemini_api_key: mediaCredentials.gemini_api_key },
            is_connected: !!mediaCredentials.gemini_api_key,
            updated_at: new Date().toISOString()
          },
          {
            user_id: user.id,
            api_name: 'pexels',
            credentials: { pexels_api_key: mediaCredentials.pexels_api_key },
            is_connected: !!mediaCredentials.pexels_api_key,
            updated_at: new Date().toISOString()
          }
        ], { onConflict: 'user_id,api_name' });

      if (error) {
        console.error('Error saving media_apis platform:', error);
        throw error;
      }

      setConnected({
        gemini: !!mediaCredentials.gemini_api_key,
        pexels: !!mediaCredentials.pexels_api_key
      });

      toast({
        title: "Media APIs Saved",
        description: "API credentials have been saved successfully",
      });

      console.log('Media API credentials saved successfully');

      // Reload to verify save
      await loadCredentials();

    } catch (error: any) {
      console.error('Failed to save media API credentials:', error);
      toast({
        title: "Save Failed",
        description: `Failed to save API credentials: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateCredential = (key: keyof MediaApiCredentials, value: string) => {
    setCredentials(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="flex items-center justify-center p-6">
          <div className="text-gray-400">Loading media API settings...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-4">
        <CardTitle className="text-white flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Media Generation APIs
        </CardTitle>
        <p className="text-gray-400 text-sm">Configure API keys for content generation</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="gemini-key" className="text-gray-300">
                Gemini API Key
              </Label>
              {connected.gemini ? (
                <Badge className="bg-green-500/20 text-green-400">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-400">
                  <XCircle className="w-3 h-3 mr-1" />
                  Not Connected
                </Badge>
              )}
            </div>
            <div className="relative">
              <Input
                id="gemini-key"
                type={showKeys.gemini ? 'text' : 'password'}
                value={credentials.gemini_api_key || ''}
                onChange={(e) => setCredentials(prev => ({ ...prev, gemini_api_key: e.target.value }))}
                placeholder="Enter your Gemini API key"
                className="bg-slate-700 border-slate-600 text-white pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-white"
                onClick={() => setShowKeys(prev => ({ ...prev, gemini: !prev.gemini }))}
              >
                {showKeys.gemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testConnection('gemini')}
                disabled={testing.gemini || !credentials.gemini_api_key}
                className="border-blue-600 text-blue-400 hover:bg-blue-600/20"
              >
                <TestTube className="w-4 h-4 mr-2" />
                {testing.gemini ? 'Testing...' : 'Test'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pexels-key" className="text-gray-300">
                Pexels API Key
              </Label>
              {connected.pexels ? (
                <Badge className="bg-green-500/20 text-green-400">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-400">
                  <XCircle className="w-3 h-3 mr-1" />
                  Not Connected
                </Badge>
              )}
            </div>
            <div className="relative">
              <Input
                id="pexels-key"
                type={showKeys.pexels ? 'text' : 'password'}
                value={credentials.pexels_api_key || ''}
                onChange={(e) => setCredentials(prev => ({ ...prev, pexels_api_key: e.target.value }))}
                placeholder="Enter your Pexels API key"
                className="bg-slate-700 border-slate-600 text-white pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-white"
                onClick={() => setShowKeys(prev => ({ ...prev, pexels: !prev.pexels }))}
              >
                {showKeys.pexels ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testConnection('pexels')}
                disabled={testing.pexels || !credentials.pexels_api_key}
                className="border-blue-600 text-blue-400 hover:bg-blue-600/20"
              >
                <TestTube className="w-4 h-4 mr-2" />
                {testing.pexels ? 'Testing...' : 'Test'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-2">
          <div className="text-xs text-gray-400">
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline mr-4">
              Get Gemini Key
            </a>
            <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
              Get Pexels Key
            </a>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
