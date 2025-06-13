import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Brain, Sparkles, Save, Loader2, CheckCircle, XCircle, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { notificationService } from '@/services/notificationService';

export const AISettings = () => {
  const { user } = useAuth();
  const [creativity, setCreativity] = useState([70]);
  const [tone, setTone] = useState('professional');
  const [contentLength, setContentLength] = useState([60]);
  const [activeModels, setActiveModels] = useState<string[]>(['rapidapi-gpt4', 'gemini-2.0', 'llama3-8b']);
  const [topics, setTopics] = useState<string>('React, TypeScript, JavaScript, Web Development, Programming');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // API Keys state
  const [rapidApiKey, setRapidApiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  
  // Test connection states
  const [testingConnections, setTestingConnections] = useState<Record<string, boolean>>({});
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'success' | 'error' | null>>({});

  useEffect(() => {
    if (user) {
      loadSettings();
      loadApiKeys();
    }
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setCreativity([data.creativity_level]);
        setTone(data.tone);
        setContentLength([data.content_length]);
        const models = Array.isArray(data.active_models) 
          ? (data.active_models as string[])
          : ['rapidapi-gpt4'];
        setActiveModels(models);
        const topicsArray = Array.isArray(data.topics) 
          ? (data.topics as string[])
          : [];
        setTopics(topicsArray.join(', '));
      }
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadApiKeys = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from('llm_api_credentials')
        .select('api_name, api_key, is_connected')
        .eq('user_id', user.id);

      if (data) {
        data.forEach((row: any) => {
          if (row.api_name === 'rapidapi') setRapidApiKey(row.api_key || '');
          else if (row.api_name === 'gemini') setGeminiKey(row.api_key || '');
          else if (row.api_name === 'groq') setGroqKey(row.api_key || '');
        });
      }
    } catch (error) {
      console.error('Failed to load LLM API keys:', error);
    }
  };

  const saveApiKeys = async () => {
    if (!user) return;
    
    try {
      const rows = [
        { api_name: 'rapidapi', api_key: rapidApiKey.trim() },
        { api_name: 'gemini', api_key: geminiKey.trim() },
        { api_name: 'groq', api_key: groqKey.trim() },
      ].filter(r => r.api_key !== '');

      const { error } = await supabase
        .from('llm_api_credentials')
        .upsert(rows.map(r => ({
          user_id: user.id,
          api_name: r.api_name,
          api_key: r.api_key,
          is_connected: true,
          updated_at: new Date().toISOString()
        })), { onConflict: 'user_id,api_name' });

      if (error) throw error;

      // Mirror into legacy platforms table for edge-function compatibility
      const legacyCreds = {
        rapidapi_key: rapidApiKey.trim(),
        rapidapi_api_key: rapidApiKey.trim(),
        gemini_key: geminiKey.trim(),
        gemini_api_key: geminiKey.trim(),
        groq_key: groqKey.trim(),
        groq_api_key: groqKey.trim()
      };

      await supabase.from('platforms').upsert({
        user_id: user.id,
        platform_name: 'llm_apis',
        credentials: legacyCreds,
        is_connected: Object.values(legacyCreds).some(v => v),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,platform_name' });

      console.log('API keys saved successfully');
    } catch (error) {
      console.error('Failed to save LLM API keys:', error);
      throw error;
    }
  };

  const testLLMConnection = async (provider: string) => {
    console.log(`Starting test for ${provider}`);
    setTestingConnections(prev => ({ ...prev, [provider]: true }));
    setConnectionStatus(prev => ({ ...prev, [provider]: null }));
    
    try {
      const apiKey = provider === 'rapidapi' ? rapidApiKey : 
                    provider === 'gemini' ? geminiKey : groqKey;
      
      console.log(`Testing ${provider} with key: ${apiKey ? `${apiKey.substring(0, 8)}...` : 'NO KEY'}`);
      
      if (!apiKey || apiKey.trim() === '') {
        throw new Error('API key is empty');
      }

      const { data, error } = await supabase.functions.invoke('test-llm-connection', {
        body: { 
          provider,
          apiKey: apiKey.trim()
        }
      });

      console.log(`${provider} test response:`, { data, error });

      if (error) {
        console.error(`${provider} test error:`, error);
        throw error;
      }
      
      if (data && data.success) {
        setConnectionStatus(prev => ({ ...prev, [provider]: 'success' }));
        await notificationService.showNotification({
          type: 'success',
          title: 'Connection Test',
          message: `${provider.toUpperCase()} API connection successful`,
          timestamp: new Date().toISOString()
        });
        // Persist the verified key immediately
        await supabase.from('llm_api_credentials').upsert({
          user_id: user!.id,
          api_name: provider,
          api_key: apiKey.trim(),
          is_connected: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,api_name' });
        // also mirror into platforms while retaining previously stored keys
        const credKey = provider === 'rapidapi' ? 'rapidapi_key' : provider === 'gemini' ? 'gemini_key' : 'groq_key';
        const credAlias = provider === 'rapidapi' ? 'rapidapi_api_key' : provider + '_api_key';

        const { data: existingRow } = await supabase.from('platforms')
          .select('id, credentials')
          .eq('user_id', user!.id)
          .eq('platform_name', 'llm_apis')
          .single();

        const baseCreds: Record<string, string> = (existingRow?.credentials && typeof existingRow.credentials === 'object') ? existingRow.credentials as Record<string,string> : {};
        const mergedCreds: Record<string, string> = {
          ...baseCreds,
          [credKey]: apiKey.trim(),
          [credAlias]: apiKey.trim(),
        };

        await supabase.from('platforms').upsert({
          user_id: user!.id,
          platform_name: 'llm_apis',
          credentials: mergedCreds,
          is_connected: Object.values(mergedCreds).some(v => v),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,platform_name' });
      } else {
        console.log(`${provider} test failed:`, data?.error);
        setConnectionStatus(prev => ({ ...prev, [provider]: 'error' }));
        await notificationService.showNotification({
          type: 'error',
          title: 'Connection Test Failed',
          message: data?.error || `${provider.toUpperCase()} API connection failed`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`Failed to test ${provider} connection:`, error);
      setConnectionStatus(prev => ({ ...prev, [provider]: 'error' }));
      await notificationService.showNotification({
        type: 'error',
        title: 'Connection Test Failed',
        message: `${provider.toUpperCase()} API connection failed: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setTestingConnections(prev => ({ ...prev, [provider]: false }));
    }
  };

  const saveSettings = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      // Always try to save API keys first (even if some are empty)
      await saveApiKeys();
      
      const topicsArray = topics.split(',').map(t => t.trim()).filter(t => t);
      
      const { error } = await supabase
        .from('ai_settings')
        .upsert({
          user_id: user.id,
          creativity_level: creativity[0],
          tone,
          content_length: contentLength[0],
          active_models: activeModels,
          topics: topicsArray,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      await notificationService.showNotification({
        type: 'success',
        title: 'Settings Saved',
        message: 'AI configuration updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      await notificationService.showNotification({
        type: 'error',
        title: 'Save Failed',
        message: `Failed to save AI settings: ${error.message}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setSaving(false);
    }
  };

  const aiModels = [
    { id: 'rapidapi-gpt4', name: 'GPT-4 (RapidAPI)', provider: 'RapidAPI ChatGPT', color: 'green', description: 'Most capable model via RapidAPI' },
    { id: 'gemini-2.0', name: 'Gemini 2.0 Flash', provider: 'Google', color: 'purple', description: 'Fast and efficient' },
    { id: 'llama3-8b', name: 'LLaMA3-8B-8192', provider: 'GroqCloud', color: 'orange', description: 'Open source, fast inference' },
  ];

  const toggleModel = (modelId: string) => {
    setActiveModels(prev => 
      prev.includes(modelId) 
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Brain className="w-5 h-5 mr-2 text-purple-400" />
          AI Configuration
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* API Keys Section */}
        <div className="space-y-4 p-4 bg-slate-700/30 rounded-lg">
          <Label className="text-sm font-medium text-gray-300">AI API Keys</Label>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <div className="flex-1">
                <Label className="text-xs text-gray-400">RapidAPI Key (ChatGPT)</Label>
                <Input
                  type="password"
                  value={rapidApiKey}
                  onChange={(e) => {
                    setRapidApiKey(e.target.value);
                    setConnectionStatus(prev => ({ ...prev, rapidapi: null }));
                  }}
                  placeholder="Enter your RapidAPI key..."
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testLLMConnection('rapidapi')}
                disabled={!rapidApiKey || testingConnections.rapidapi}
                className="mt-5"
              >
                {testingConnections.rapidapi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              </Button>
              {connectionStatus.rapidapi && (
                <div className="mt-5">
                  {connectionStatus.rapidapi === 'success' ? 
                    <CheckCircle className="w-4 h-4 text-green-500" /> : 
                    <XCircle className="w-4 h-4 text-red-500" />
                  }
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex-1">
                <Label className="text-xs text-gray-400">Gemini API Key</Label>
                <Input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    setConnectionStatus(prev => ({ ...prev, gemini: null }));
                  }}
                  placeholder="AI..."
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testLLMConnection('gemini')}
                disabled={!geminiKey || testingConnections.gemini}
                className="mt-5"
              >
                {testingConnections.gemini ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              </Button>
              {connectionStatus.gemini && (
                <div className="mt-5">
                  {connectionStatus.gemini === 'success' ? 
                    <CheckCircle className="w-4 h-4 text-green-500" /> : 
                    <XCircle className="w-4 h-4 text-red-500" />
                  }
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex-1">
                <Label className="text-xs text-gray-400">GroqCloud API Key</Label>
                <Input
                  type="password"
                  value={groqKey}
                  onChange={(e) => {
                    setGroqKey(e.target.value);
                    setConnectionStatus(prev => ({ ...prev, groq: null }));
                  }}
                  placeholder="gsk_..."
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testLLMConnection('groq')}
                disabled={!groqKey || testingConnections.groq}
                className="mt-5"
              >
                {testingConnections.groq ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              </Button>
              {connectionStatus.groq && (
                <div className="mt-5">
                  {connectionStatus.groq === 'success' ? 
                    <CheckCircle className="w-4 h-4 text-green-500" /> : 
                    <XCircle className="w-4 h-4 text-red-500" />
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-300">Content Topics</Label>
          <Input
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            placeholder="React, JavaScript, Programming..."
            className="bg-slate-700 border-slate-600 text-white"
          />
          <p className="text-xs text-gray-400">Comma-separated topics for content generation</p>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-300">Content Tone</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-700 border-slate-600">
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="inspirational">Inspirational</SelectItem>
              <SelectItem value="educational">Educational</SelectItem>
              <SelectItem value="conversational">Conversational</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-sm font-medium text-gray-300">Creativity Level</Label>
            <span className="text-sm text-purple-400">{creativity[0]}%</span>
          </div>
          <Slider
            value={creativity}
            onValueChange={setCreativity}
            max={100}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-gray-400">Higher values = more creative and varied content</p>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <Label className="text-sm font-medium text-gray-300">Content Length</Label>
            <span className="text-sm text-blue-400">{contentLength[0]}%</span>
          </div>
          <Slider
            value={contentLength}
            onValueChange={setContentLength}
            max={100}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-gray-400">Relative length for generated content</p>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-300">Active AI Models</Label>
          <div className="space-y-2">
            {aiModels.map((model) => (
              <div 
                key={model.id} 
                className={`flex items-center justify-between p-3 rounded cursor-pointer transition-colors ${
                  activeModels.includes(model.id) 
                    ? 'bg-slate-700 border border-slate-600' 
                    : 'bg-slate-700/50 hover:bg-slate-700'
                }`}
                onClick={() => toggleModel(model.id)}
              >
                <div>
                  <span className="text-white text-sm font-medium">{model.name}</span>
                  <p className="text-xs text-gray-400">{model.provider}</p>
                  <p className="text-xs text-gray-500">{model.description}</p>
                </div>
                <Badge
                  variant={activeModels.includes(model.id) ? 'default' : 'secondary'}
                  className={`
                    ${model.color === 'green' && activeModels.includes(model.id) ? 'bg-green-500/20 text-green-400' : ''}
                    ${model.color === 'blue' && activeModels.includes(model.id) ? 'bg-blue-500/20 text-blue-400' : ''}
                    ${model.color === 'purple' && activeModels.includes(model.id) ? 'bg-purple-500/20 text-purple-400' : ''}
                    ${model.color === 'orange' && activeModels.includes(model.id) ? 'bg-orange-500/20 text-orange-400' : ''}
                  `}
                >
                  {activeModels.includes(model.id) ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">Select which AI models to use for content generation</p>
        </div>

        <Button 
          onClick={saveSettings}
          disabled={saving}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
};
