import React from 'react';
import { Home, Calendar, MessageCircle, User, List } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useMode } from '@/contexts/ModeContext';
import { useMessages } from '@/contexts/MessagesContext';
import { Badge } from '@/components/ui/badge';
const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    mode
  } = useMode();
  const {
    totalUnreadCount
  } = useMessages();
  const tabs = mode === 'host' ? [{
    id: 'home',
    label: 'Home',
    icon: Home,
    path: '/host-home'
  }, {
    id: 'listings',
    label: 'Listings',
    icon: List,
    path: '/dashboard'
  }, {
    id: 'reservations',
    label: 'Reservations',
    icon: Calendar,
    path: '/activity'
  }, {
    id: 'messages',
    label: 'Messages',
    icon: MessageCircle,
    path: '/messages'
  }, {
    id: 'account',
    label: 'Account',
    icon: User,
    path: '/profile'
  }] : [{
    id: 'home',
    label: 'Home',
    icon: Home,
    path: '/'
  }, {
    id: 'reservations',
    label: 'Reservations',
    icon: Calendar,
    path: '/activity'
  }, {
    id: 'messages',
    label: 'Messages',
    icon: MessageCircle,
    path: '/messages'
  }, {
    id: 'account',
    label: 'Account',
    icon: User,
    path: '/profile'
  }];
  return <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-md pb-8 mx-0 px-6">
        {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = location.pathname === tab.path;
        return <button key={tab.id} onClick={() => navigate(tab.path)} className={cn("flex flex-col items-center gap-1 pt-4 pb-2 px-2 rounded-md transition-colors relative", isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
              <div className="relative">
                <Icon className="h-5 w-5" />
                {tab.id === 'messages' && totalUnreadCount > 0 && <Badge variant="destructive" className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                    {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                  </Badge>}
              </div>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>;
      })}
      </div>
    </div>;
};
export default BottomNavigation;