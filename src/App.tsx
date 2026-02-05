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
import HostEarningsHistory from "./pages/HostEarningsHistory";
import SpotEarningsHistory from "./pages/SpotEarningsHistory";
import Messages from "./pages/Messages";
import SearchResults from "./pages/SearchResults";
import SpotDetail from "./pages/SpotDetail";
import Booking from "./pages/Booking";
import BookingConfirmation from "./pages/BookingConfirmation";
import HostBookingConfirmation from "./pages/HostBookingConfirmation";
import BookingDeclined from "./pages/BookingDeclined";
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
import Privacy from "./pages/Privacy";
import Docs from "./pages/Docs";
import Terms from "./pages/Terms";
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
import SavedSpots from "./pages/SavedSpots";
import DebugEmailVerification from "./pages/DebugEmailVerification";
import { AuthProvider } from "./contexts/AuthContext";
import { ModeProvider } from "./contexts/ModeContext";
import { MessagesProvider } from "./contexts/MessagesContext";
import { SupportRedirect } from "./components/auth/SupportRedirect";
import RequireHostMode from "./components/auth/RequireHostMode";
import { useOrientationLock } from "./hooks/useOrientationLock";
import { useNativePush } from "./hooks/useNativePush";
import { useDeepLinks } from "./hooks/useDeepLinks";
import ErrorBoundary from "./components/ErrorBoundary";
import { initSentry } from "./lib/sentry";

// Component to initialize native push notifications
// Must be inside AuthProvider and BrowserRouter to access auth context and navigation
const NativePushInitializer = () => {
  useNativePush();
  return null;
};

// Component to handle deep links (email verification, password reset, etc.)
// Must be inside BrowserRouter to access navigation
const DeepLinkHandler = () => {
  useDeepLinks();
  return null;
};

// Initialize Sentry for error tracking
initSentry();

// Optimized QueryClient for better performance
// - staleTime: Data is "fresh" for 30s, won't refetch during navigation
// - gcTime: Keep unused data in cache for 10 minutes
// - refetchOnWindowFocus: Only refetch stale data when user returns to app
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds - data stays fresh, no refetch on navigate
      gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache for quick return visits
      refetchOnWindowFocus: 'always', // Refresh when app comes to foreground
      refetchOnReconnect: true,
      retry: 2, // Retry failed requests twice
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
  },
});

const App = () => {
  // Lock orientation to portrait on mobile devices
  useOrientationLock();

  // Environment verification for debugging - ONLY in development
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[ENV] VITE_SUPABASE_URL =', import.meta.env.VITE_SUPABASE_URL);
      console.log('[ENV] VITE_SUPABASE_ANON_KEY set?', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
      console.log('[ENV] Current URL:', window.location.origin);
    }
  }, []);

  // CRITICAL: Keep Realtime socket authorized after token refresh/sign-in
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      supabase.realtime.setAuth(session?.access_token ?? '');
      if (import.meta.env.DEV) {
        console.log('[realtime-auth] Updated socket token:', session?.access_token ? 'present' : 'none');
      }
    });

    // Set initial auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabase.realtime.setAuth(session?.access_token ?? '');
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ModeProvider>
          <MessagesProvider>
            <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
            <NativePushInitializer />
            <DeepLinkHandler />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/email-confirmation" element={<EmailConfirmation />} />
              <Route path="/checkout-success" element={<CheckoutSuccess />} />
              <Route path="/embedded-checkout/:bookingId" element={<EmbeddedCheckout />} />
              <Route path="/search-results" element={<SearchResults />} />
              <Route path="/spot/:id" element={<div className="h-screen overflow-y-auto bg-background"><SpotDetail /></div>} />
              <Route path="/guest-booking/:bookingId" element={<GuestBookingDetail />} />
              {/* Debug route only available in development */}
              {import.meta.env.DEV && (
                <Route path="/debug/email-verification" element={<DebugEmailVerification />} />
              )}
              <Route path="/personal-information" element={<PersonalInformation />} />
            <Route path="/my-vehicles" element={<MyVehicles />} />
            <Route path="/add-vehicle" element={<AddVehicle />} />
            <Route path="/edit-vehicle/:id" element={<EditVehicle />} />
            <Route path="/payment-methods" element={<PaymentMethods />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/privacy-security" element={<PrivacySecurity />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/docs" element={<Docs />} />
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
                    <Route path="/host-earnings-history" element={<RequireHostMode><HostEarningsHistory /></RequireHostMode>} />
                    <Route path="/spot-earnings/:spotId" element={<RequireHostMode><SpotEarningsHistory /></RequireHostMode>} />
                    <Route path="/manage-availability" element={<RequireHostMode><ManageAvailability /></RequireHostMode>} />
                    <Route path="/messages" element={<Messages />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/saved-spots" element={<SavedSpots />} />
                    <Route path="/reviews" element={<Reviews />} />
                    <Route path="/manage-account" element={<ManageAccount />} />
                    <Route path="/book/:spotId" element={<Booking />} />
                    <Route path="/booking/:bookingId" element={<BookingDetail />} />
                    <Route path="/booking-confirmation/:bookingId" element={<BookingConfirmation />} />
                    <Route path="/booking-declined/:bookingId" element={<BookingDeclined />} />
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
  </ErrorBoundary>
  );
};

export default App;
