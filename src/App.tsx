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
import EmbeddedCheckout from "./pages/EmbeddedCheckout";

import ListSpot from "./pages/ListSpot";
import Activity from "./pages/Activity";
import Dashboard from "./pages/Dashboard";
import HostHome from "./pages/HostHome";
import HostCalendar from "./pages/HostCalendar";
import Messages from "./pages/Messages";
import SearchResults from "./pages/SearchResults";
import SpotDetail from "./pages/SpotDetail";
import Booking from "./pages/Booking";
import BookingConfirmation from "./pages/BookingConfirmation";
import HostBookingConfirmation from "./pages/HostBookingConfirmation";
import BookingDetail from "./pages/BookingDetail";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import EmailConfirmation from "./pages/EmailConfirmation";
import NotFound from "./pages/NotFound";
import PersonalInformation from "./pages/PersonalInformation";
import ManageAccount from "./pages/ManageAccount";
import MyVehicles from "./pages/MyVehicles";
import AddVehicle from "./pages/AddVehicle";
import EditVehicle from "./pages/EditVehicle";
import PaymentMethods from "./pages/PaymentMethods";
import Notifications from "./pages/Notifications";
import PrivacySecurity from "./pages/PrivacySecurity";
import EditSpotAvailability from "./pages/EditSpotAvailability";
import EditSpot from "./pages/EditSpot";
import Reviews from "./pages/Reviews";
import AdminDashboard from "./pages/AdminDashboard";
import ManageAvailability from "./pages/ManageAvailability";
import SupportHome from "./pages/SupportHome";
import SupportMessages from "./pages/SupportMessages";
import SupportReservations from "./pages/SupportReservations";
import SupportAccount from "./pages/SupportAccount";
import SupportUserDetail from "./pages/SupportUserDetail";
import GuestBookingDetail from "./pages/GuestBookingDetail";
import { AuthProvider } from "./contexts/AuthContext";
import { ModeProvider } from "./contexts/ModeContext";
import { MessagesProvider } from "./contexts/MessagesContext";
import { SupportRedirect } from "./components/auth/SupportRedirect";
import RequireHostMode from "./components/auth/RequireHostMode";

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
        <MessagesProvider>
          <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/email-confirmation" element={<EmailConfirmation />} />
            <Route path="/checkout-success" element={<CheckoutSuccess />} />
            <Route path="/embedded-checkout/:bookingId" element={<EmbeddedCheckout />} />
            <Route path="/search-results" element={<SearchResults />} />
            <Route path="/spot/:id" element={<div className="h-screen overflow-y-auto bg-background"><SpotDetail /></div>} />
            <Route path="/guest-booking/:bookingId" element={<GuestBookingDetail />} />
            <Route path="/personal-information" element={<PersonalInformation />} />
            <Route path="/my-vehicles" element={<MyVehicles />} />
            <Route path="/add-vehicle" element={<AddVehicle />} />
            <Route path="/edit-vehicle/:id" element={<EditVehicle />} />
            <Route path="/payment-methods" element={<PaymentMethods />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/privacy-security" element={<PrivacySecurity />} />
            <Route path="/*" element={
              <SupportRedirect>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/explore" element={<Explore />} />
                    <Route path="/list-spot" element={<RequireHostMode><ListSpot /></RequireHostMode>} />
                    <Route path="/edit-availability/:spotId" element={<RequireHostMode><EditSpotAvailability /></RequireHostMode>} />
                    <Route path="/edit-spot/:spotId" element={<RequireHostMode><EditSpot /></RequireHostMode>} />
                    <Route path="/activity" element={<Activity />} />
                    <Route path="/dashboard" element={<RequireHostMode><Dashboard /></RequireHostMode>} />
                    <Route path="/host-home" element={<RequireHostMode><HostHome /></RequireHostMode>} />
                    <Route path="/host-calendar" element={<RequireHostMode><HostCalendar /></RequireHostMode>} />
                    <Route path="/manage-availability" element={<RequireHostMode><ManageAvailability /></RequireHostMode>} />
                    <Route path="/messages" element={<Messages />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/reviews" element={<Reviews />} />
                    <Route path="/manage-account" element={<ManageAccount />} />
                    <Route path="/book/:spotId" element={<Booking />} />
                    <Route path="/booking/:bookingId" element={<BookingDetail />} />
                    <Route path="/booking-confirmation/:bookingId" element={<BookingConfirmation />} />
                    <Route path="/host-booking-confirmation/:bookingId" element={<RequireHostMode><HostBookingConfirmation /></RequireHostMode>} />
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/support-home" element={<SupportHome />} />
                    <Route path="/support-messages" element={<SupportMessages />} />
                    <Route path="/support-reservations" element={<SupportReservations />} />
                    <Route path="/support-account" element={<SupportAccount />} />
                    <Route path="/support-user/:userId" element={<SupportUserDetail />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AppLayout>
              </SupportRedirect>
            } />
          </Routes>
    </BrowserRouter>
          </TooltipProvider>
        </MessagesProvider>
      </ModeProvider>
    </AuthProvider>
  </QueryClientProvider>
  );
};

export default App;
