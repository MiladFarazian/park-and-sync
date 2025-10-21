import React from 'react';
import { Home, Compass, Plus, Activity, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    { id: 'home', label: 'Home', icon: Home, path: '/' },
    { id: 'explore', label: 'Explore', icon: Compass, path: '/explore' },
    { id: 'add', label: 'Host', icon: Plus, path: '/add-spot' },
    { id: 'activity', label: 'Activity', icon: Activity, path: '/activity' },
    { id: 'profile', label: 'Profile', icon: User, path: '/profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.path;
          
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-md transition-colors",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNavigation;