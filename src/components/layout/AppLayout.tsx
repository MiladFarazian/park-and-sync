import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomNavigation from './BottomNavigation';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import parkwayLogo from '@/assets/parkway-logo.png';
import ModeSwitcher from './ModeSwitcher';
import ModeLoadingOverlay from './ModeLoadingOverlay';
import { NotificationBell } from './NotificationBell';
interface AppLayoutProps {
  children: React.ReactNode;
}
const AppLayout = ({
  children
}: AppLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isProfilePage = location.pathname === '/profile';
  return <>
      <ModeLoadingOverlay />
      
      {/* Desktop Layout with Sidebar */}
      <div className="hidden md:block">
        <SidebarProvider>
          <div className="flex w-full">
            <AppSidebar />
            <main className="flex-1">
              {!isProfilePage && <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <img src={parkwayLogo} alt="Parkway" className="h-8" />
                    <ModeSwitcher />
                  </div>
                  <div className="flex items-center gap-2">
                    <NotificationBell />
                    <Button variant="ghost" size="icon" onClick={() => navigate('/messages')}>
                      <MessageSquare className="h-5 w-5" />
                    </Button>
                  </div>
                </header>}
              <div className="container mx-auto p-6">
                {children}
              </div>
            </main>
          </div>
        </SidebarProvider>
      </div>

      {/* Mobile Layout with Bottom Navigation */}
      <div className="md:hidden">
        {!isProfilePage && <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-3">
              <img src={parkwayLogo} alt="Parkway" className="h-8" />
              <ModeSwitcher />
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </header>}
        <div className="bg-background">
          <div className="max-w-md mx-auto">
            {children}
          </div>
          <BottomNavigation />
        </div>
      </div>
    </>;
};
export default AppLayout;