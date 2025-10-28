import React from 'react';
import { Home, Calendar, MessageCircle, User, List } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useMode } from '@/contexts/ModeContext';

const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode } = useMode();

  const tabs = mode === 'host' 
    ? [
        { id: 'home', label: 'Home', icon: Home, path: '/dashboard' },
        { id: 'listings', label: 'Listings', icon: List, path: '/add-spot' },
        { id: 'reservations', label: 'Reservations', icon: Calendar, path: '/activity' },
        { id: 'messages', label: 'Messages', icon: MessageCircle, path: '/messages' },
        { id: 'account', label: 'Account', icon: User, path: '/profile' },
      ]
    : [
        { id: 'home', label: 'Home', icon: Home, path: '/' },
        { id: 'reservations', label: 'Reservations', icon: Calendar, path: '/activity' },
        { id: 'messages', label: 'Messages', icon: MessageCircle, path: '/messages' },
        { id: 'account', label: 'Account', icon: User, path: '/profile' },
      ];

  return (
    <div className="fixed bottom-6 left-0 right-0 bg-background border-t border-border z-50 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto pb-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.path;
          
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex flex-col items-center gap-1 pt-4 pb-2 px-2 rounded-md transition-colors",
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