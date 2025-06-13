
import { useState } from 'react';
import { Header } from '@/components/Header';
import { PlatformGrid } from '@/components/PlatformGrid';
import { AISettings } from '@/components/AISettings';
import { ScheduleOverview } from '@/components/ScheduleOverview';
import { ScheduleManager } from '@/components/ScheduleManager';
import { Analytics } from '@/components/Analytics';
import { ContentPreview } from '@/components/ContentPreview';
import { AutoStatusBanner } from '@/components/AutoStatusBanner';
import { MediaApiDashboard } from '@/components/MediaApiDashboard';

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="container mx-auto px-6 py-8">
        <AutoStatusBanner />
        
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">
                Autonomous Content Publisher
              </h1>
              <p className="text-gray-300 text-lg">
                AI-powered multi-platform content generation and scheduling
              </p>
            </div>
            
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <PlatformGrid />
                <MediaApiDashboard />
              </div>
              <div className="space-y-6">
                <AISettings />
                <ScheduleOverview />
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'content' && <ContentPreview />}
        {activeTab === 'schedules' && (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">
                Posting Schedules
              </h1>
              <p className="text-gray-300 text-lg">
                Manage your weekly posting schedules across all platforms
              </p>
            </div>
            <ScheduleManager />
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
