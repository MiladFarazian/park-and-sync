import React from 'react';
import BottomNavigation from './BottomNavigation';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import parkwayLogo from '@/assets/parkway-logo.png';
import parkwayIcon from '@/assets/parkway-icon.png';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <>
      {/* Desktop Layout with Sidebar */}
      <div className="hidden md:block">
        <SidebarProvider>
          <div className="flex min-h-screen w-full">
            <AppSidebar />
            <main className="flex-1">
              <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background px-4">
                <div className="flex items-center gap-3">
                  <SidebarTrigger />
                  <img src={parkwayLogo} alt="Parkway" className="h-8" />
                </div>
              </header>
              <div className="container mx-auto p-6">
                {children}
              </div>
            </main>
          </div>
        </SidebarProvider>
      </div>

      {/* Mobile Layout with Bottom Navigation */}
      <div className="md:hidden">
        <div className="min-h-screen bg-background pb-16">
          <header className="sticky top-0 z-10 flex h-16 items-center justify-center border-b bg-background px-4">
            <img src={parkwayLogo} alt="Parkway" className="h-8" />
          </header>
          <div className="max-w-md mx-auto">
            {children}
          </div>
          <BottomNavigation />
        </div>
      </div>
    </>
  );
};

export default AppLayout;