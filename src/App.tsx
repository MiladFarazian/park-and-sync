import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "./components/layout/AppLayout";
import Home from "./pages/Home";
import Explore from "./pages/Explore";

import ListSpot from "./pages/ListSpot";
import Activity from "./pages/Activity";
import Dashboard from "./pages/Dashboard";
import HostHome from "./pages/HostHome";
import Messages from "./pages/Messages";
import SearchResults from "./pages/SearchResults";
import SpotDetail from "./pages/SpotDetail";
import Booking from "./pages/Booking";
import BookingConfirmation from "./pages/BookingConfirmation";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import EmailConfirmation from "./pages/EmailConfirmation";
import NotFound from "./pages/NotFound";
import PersonalInformation from "./pages/PersonalInformation";
import ManageAccount from "./pages/ManageAccount";
import MyVehicles from "./pages/MyVehicles";
import AddVehicle from "./pages/AddVehicle";
import PaymentMethods from "./pages/PaymentMethods";
import Notifications from "./pages/Notifications";
import PrivacySecurity from "./pages/PrivacySecurity";
import EditSpotAvailability from "./pages/EditSpotAvailability";
import EditSpot from "./pages/EditSpot";
import { AuthProvider } from "./contexts/AuthContext";
import { ModeProvider } from "./contexts/ModeContext";

const queryClient = new QueryClient();

const App = () => {
  // Environment verification for debugging cross-build issues
  useEffect(() => {
    console.log('[ENV] VITE_SUPABASE_URL =', import.meta.env.VITE_SUPABASE_URL);
    console.log('[ENV] VITE_SUPABASE_ANON_KEY set?', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
    console.log('[ENV] Current URL:', window.location.origin);
  }, []);

  // CRITICAL: Keep Realtime socket authorized after token refresh/sign-in
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      supabase.realtime.setAuth(session?.access_token ?? '');
      console.log('[realtime-auth] Updated socket token:', session?.access_token ? 'present' : 'none');
    });

    // Set initial auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabase.realtime.setAuth(session?.access_token ?? '');
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ModeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/email-confirmation" element={<EmailConfirmation />} />
            <Route path="/search-results" element={<SearchResults />} />
            <Route path="/spot/:id" element={<SpotDetail />} />
            <Route path="/book/:spotId" element={<Booking />} />
            <Route path="/booking-confirmation/:bookingId" element={<BookingConfirmation />} />
            <Route path="/personal-information" element={<PersonalInformation />} />
            <Route path="/manage-account" element={<ManageAccount />} />
            <Route path="/my-vehicles" element={<MyVehicles />} />
            <Route path="/add-vehicle" element={<AddVehicle />} />
            <Route path="/payment-methods" element={<PaymentMethods />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/privacy-security" element={<PrivacySecurity />} />
            <Route path="/*" element={
              <AppLayout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/explore" element={<Explore />} />
                  <Route path="/list-spot" element={<ListSpot />} />
              <Route path="/edit-availability/:spotId" element={<EditSpotAvailability />} />
              <Route path="/edit-spot/:spotId" element={<EditSpot />} />
                  <Route path="/activity" element={<Activity />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/host-home" element={<HostHome />} />
                  <Route path="/messages" element={<Messages />} />
                  <Route path="/profile" element={<Profile />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AppLayout>
            } />
          </Routes>
    </BrowserRouter>
  </TooltipProvider>
  </ModeProvider>
  </AuthProvider>
  </QueryClientProvider>
  );
};

export default App;
