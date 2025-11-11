import { Home, Calendar, MessageCircle, User, List } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useMode } from '@/contexts/ModeContext';
import { useMessages } from '@/hooks/useMessages';
import { Badge } from '@/components/ui/badge';

export function AppSidebar() {
  const { open } = useSidebar();
  const { mode } = useMode();
  const { totalUnreadCount } = useMessages();

  const menuItems = mode === 'host' 
    ? [
        { title: 'Home', url: '/host-home', icon: Home },
        { title: 'Listings', url: '/dashboard', icon: List },
        { title: 'Reservations', url: '/activity', icon: Calendar },
        { title: 'Messages', url: '/messages', icon: MessageCircle, showBadge: true },
        { title: 'Account', url: '/profile', icon: User },
      ]
    : [
        { title: 'Home', url: '/', icon: Home },
        { title: 'Reservations', url: '/activity', icon: Calendar },
        { title: 'Messages', url: '/messages', icon: MessageCircle, showBadge: true },
        { title: 'Account', url: '/profile', icon: User },
      ];

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className={({ isActive }) =>
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-muted/50'
                      }
                    >
                      <div className="relative">
                        <item.icon className="h-5 w-5" />
                        {item.showBadge && totalUnreadCount > 0 && (
                          <Badge 
                            variant="destructive" 
                            className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                          >
                            {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                          </Badge>
                        )}
                      </div>
                      {open && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
