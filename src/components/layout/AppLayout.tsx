import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomNavigation from './BottomNavigation';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import parkzyLogo from '@/assets/parkzy-logo.png';
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
      <div className="hidden md:flex h-screen flex-col">
        <SidebarProvider>
          <div className="flex flex-1 w-full overflow-hidden">
            <AppSidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              {!isProfilePage && <header className="flex-shrink-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger />
                    <img src={parkzyLogo} alt="Parkzy" className="h-8" />
                    <ModeSwitcher />
                  </div>
                  <div className="flex items-center gap-2">
                    <NotificationBell />
                    <Button variant="ghost" size="icon" onClick={() => navigate('/messages')}>
                      <MessageSquare className="h-5 w-5" />
                    </Button>
                  </div>
                </header>}
              <main className="flex-1 overflow-y-auto">
                <div className="container mx-auto p-6 h-full">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </SidebarProvider>
      </div>

      {/* Mobile Layout with Bottom Navigation */}
      <div className="md:hidden flex flex-col h-screen">
        {!isProfilePage && <header className="flex-shrink-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-3">
              <img src={parkzyLogo} alt="Parkzy" className="h-8" />
              <ModeSwitcher />
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </header>}
        <main className="flex-1 overflow-hidden bg-background">
          <div className="h-full overflow-y-auto pb-16">
            {children}
          </div>
        </main>
        <BottomNavigation />
      </div>
    </>;
};
export default AppLayout;