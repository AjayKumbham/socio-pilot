
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { NotificationCenter } from './NotificationCenter';
import { BarChart3, Calendar, FileText, LayoutDashboard } from 'lucide-react';

interface HeaderProps {
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

export const Header = ({ activeTab, setActiveTab }: HeaderProps) => {
  const { user, signOut } = useAuth();

  if (!user) return null;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'schedules', label: 'Schedules', icon: Calendar },
    { id: 'content', label: 'Content', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <header className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold text-white">Content Autopilot</h1>
            
            {/* Navigation Tabs */}
            <nav className="hidden md:flex space-x-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Button
                    key={tab.id}
                    variant={activeTab === tab.id ? "default" : "ghost"}
                    onClick={() => setActiveTab?.(tab.id)}
                    className={`flex items-center space-x-2 ${
                      activeTab === tab.id
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "text-gray-300 hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </Button>
                );
              })}
            </nav>
          </div>
          
          <div className="flex items-center space-x-4">
            <NotificationCenter />
            <div className="text-sm text-gray-300">
              {user.email}
            </div>
            <Button 
              variant="outline" 
              onClick={signOut}
              className="border-slate-600 text-gray-300 hover:bg-slate-800"
            >
              Sign Out
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden pb-3">
          <nav className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab?.(tab.id)}
                  className={`flex items-center space-x-1 whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "text-gray-300 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs">{tab.label}</span>
                </Button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
