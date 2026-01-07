import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { User, Menu, MessageSquare, Calendar, Home, List, FileText, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import parkzyLogo from '@/assets/parkzy-logo.png';
import ModeSwitcher from './ModeSwitcher';
import { NotificationBell } from './NotificationBell';
import { useMode } from '@/contexts/ModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMessages } from '@/contexts/MessagesContext';
import { useSupportRole } from '@/hooks/useSupportRole';
import { Badge } from '@/components/ui/badge';

const DesktopHeader = () => {
  const navigate = useNavigate();
  const { mode, setMode } = useMode();
  const { user, signOut } = useAuth();
  const { totalUnreadCount } = useMessages();
  const { isSupport } = useSupportRole();

  const handleLogoClick = () => {
    if (isSupport) {
      navigate('/support-home');
      return;
    }
    if (mode === 'host') {
      setMode('driver');
    }
    navigate('/');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Support-specific navigation
  const supportNavItems = [
    { title: 'Dashboard', url: '/support-home', icon: Home },
    { title: 'Reservations', url: '/support-reservations', icon: FileText },
    { title: 'Messages', url: '/support-messages', icon: MessageSquare },
  ];

  const navItems = isSupport
    ? supportNavItems
    : mode === 'host' 
      ? [
          { title: 'Dashboard', url: '/host-home', icon: Home },
          { title: 'Listings', url: '/dashboard', icon: List },
          { title: 'Calendar', url: '/host-calendar', icon: Calendar },
        ]
      : [
          { title: 'Find Parking', url: '/explore', icon: null },
          { title: 'My Reservations', url: '/activity', icon: null },
        ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        {/* Left: Logo and Nav */}
        <div className="flex items-center gap-8">
          <img 
            src={parkzyLogo} 
            alt="Parkzy" 
            className="h-9 cursor-pointer" 
            onClick={handleLogoClick}
          />
          
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.title}
                to={item.url}
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                    isActive 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`
                }
              >
                {item.title}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Show mode switcher only for non-support users */}
          {!isSupport && <ModeSwitcher />}
          
          {/* Show Support badge for support users */}
          {isSupport && (
            <Badge variant="secondary" className="gap-1">
              <Headphones className="h-3 w-3" />
              Support
            </Badge>
          )}
          
          {user && !isSupport && (
            <>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate('/messages')}
                className="relative"
              >
                <MessageSquare className="h-5 w-5" />
                {totalUnreadCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
                  >
                    {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                  </Badge>
                )}
              </Button>
              
              <NotificationBell />
            </>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-full">
                {user ? (
                  <User className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {user ? (
                isSupport ? (
                  // Support user menu
                  <>
                    <DropdownMenuItem onClick={() => navigate('/support-account')}>
                      Support Account
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      Sign Out
                    </DropdownMenuItem>
                  </>
                ) : (
                  // Regular user menu
                  <>
                    <DropdownMenuItem onClick={() => navigate('/profile')}>
                      My Account
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/activity')}>
                      Reservations
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/messages')}>
                      Messages
                      {totalUnreadCount > 0 && (
                        <Badge variant="destructive" className="ml-auto">
                          {totalUnreadCount}
                        </Badge>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {mode === 'driver' ? (
                      <DropdownMenuItem onClick={() => navigate('/list-spot')}>
                        List Your Spot
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                        Manage Listings
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      Sign Out
                    </DropdownMenuItem>
                  </>
                )
              ) : (
                <>
                  <DropdownMenuItem onClick={() => navigate('/auth')}>
                    Sign In
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/auth')}>
                    Sign Up
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/list-spot')}>
                    List Your Spot
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default DesktopHeader;
