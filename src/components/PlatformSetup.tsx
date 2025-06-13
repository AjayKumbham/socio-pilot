
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformGrid } from './PlatformGrid';
import { MediaApiSetup } from './MediaApiSetup';

export const PlatformSetup = () => {
  const [activeTab, setActiveTab] = useState('platforms');

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Platform Setup</h1>
        <p className="text-gray-300">Connect your social media platforms and configure media APIs</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-800 border-slate-700 grid w-full grid-cols-2">
          <TabsTrigger 
            value="platforms" 
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            Social Platforms
          </TabsTrigger>
          <TabsTrigger 
            value="media-apis" 
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            Media APIs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platforms" className="mt-8">
          <PlatformGrid />
        </TabsContent>

        <TabsContent value="media-apis" className="mt-8">
          <MediaApiSetup />
        </TabsContent>
      </Tabs>
    </div>
  );
};
