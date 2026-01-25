import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, Calendar, MapPin, Car, ChevronRight, Wallet, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMode } from '@/contexts/ModeContext';
import { toast } from 'sonner';
import RecentReviews from '@/components/host/RecentReviews';
import UpcomingReservationsWidget from '@/components/host/UpcomingReservationsWidget';
import QuickAvailabilityActions from '@/components/host/QuickAvailabilityActions';
import EarningsBySpot from '@/components/host/EarningsBySpot';
import { getHostNetEarnings } from '@/lib/hostEarnings';
import { format } from 'date-fns';

interface StripeBalanceData {
  connected: boolean;
  available_balance: number;
  pending_balance: number;
  next_payout_date: string | null;
  next_payout_amount: number | null;
  last_payout_status: string | null;
  last_payout_amount: number | null;
  last_payout_date: string | null;
}

const HostHome = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { setMode } = useMode();
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalBookings: 0,
  });
  const [stripeBalance, setStripeBalance] = useState<StripeBalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stripeLoading, setStripeLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchHostStats();
      fetchStripeBalance();
    } else if (!authLoading) {
      setLoading(false);
      setStripeLoading(false);
    }
  }, [user, authLoading]);

  const fetchHostStats = async () => {
    try {
      setLoading(true);

      // Fetch spots count
      const { data: spotsData, error: spotsError } = await supabase
        .from('spots')
        .select('id')
        .eq('host_id', user?.id);

      if (spotsError) throw spotsError;

      const spotIds = spotsData?.map(s => s.id) || [];

      // If no spots, set stats to zero
      if (spotIds.length === 0) {
        setStats({
          totalEarnings: 0,
          totalBookings: 0,
        });
        setLoading(false);
        return;
      }

      // Fetch bookings for earnings (completed, active, paid - matching earnings history page)
      const { data: completedBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('host_earnings, hourly_rate, start_at, end_at, status, extension_charges')
        .in('spot_id', spotIds)
        .in('status', ['completed', 'active', 'paid']);

      if (bookingsError) throw bookingsError;

      // Calculate total earnings using host_earnings field (net earnings after platform fee)
      const totalEarnings = completedBookings?.reduce((sum, b) => sum + getHostNetEarnings(b), 0) || 0;

      setStats({
        totalEarnings,
        totalBookings: completedBookings?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching host stats:', error);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchStripeBalance = async () => {
    try {
      setStripeLoading(true);
      const { data, error } = await supabase.functions.invoke('get-stripe-connect-balance');

      if (error) {
        console.error('Error fetching Stripe balance:', error);
        setStripeBalance(null);
      } else {
        setStripeBalance(data);
      }
    } catch (error) {
      console.error('Error fetching Stripe balance:', error);
      setStripeBalance(null);
    } finally {
      setStripeLoading(false);
    }
  };

  const getPayoutStatusIcon = (status: string | null) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
      case 'canceled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
      case 'in_transit':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getPayoutStatusBadge = (status: string | null) => {
    switch (status) {
      case 'paid':
        return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">Paid</Badge>;
      case 'failed':
        return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">Failed</Badge>;
      case 'canceled':
        return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">Canceled</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">Pending</Badge>;
      case 'in_transit':
        return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">In Transit</Badge>;
      default:
        return null;
    }
  };

  if (authLoading) {
    return (
      <div className="p-4 space-y-6">
        <div className="pt-4">
          <h1 className="text-2xl font-bold">Host Dashboard</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-4 space-y-6 pb-4">
        <div className="pt-4">
          <h1 className="text-2xl font-bold">Host Dashboard</h1>
          <p className="text-muted-foreground">You need to be logged in to access this page</p>
        </div>
        <Card className="p-6">
          <div className="space-y-4 text-center">
            <p className="text-muted-foreground">Please sign in to view your host dashboard and manage your listings.</p>
            <Button onClick={() => navigate('/auth')}>
              Sign In / Sign Up
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 space-y-6 pb-4">
        {/* Header */}
        <div className="pt-4">
          <h1 className="text-2xl font-bold">Host Dashboard</h1>
          <p className="text-muted-foreground">Your hosting overview</p>
        </div>

        {/* Stats Cards Skeleton */}
        <div className="space-y-4">
          <Card className="p-6">
            <Skeleton className="h-9 w-32 mb-2" />
            <Skeleton className="h-4 w-28" />
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-7 w-20" />
            </Card>
            <Card className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-7 w-20" />
            </Card>
          </div>
        </div>

        {/* Payout Info Skeleton */}
        <Card className="p-4">
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 pb-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-2xl font-bold">Host Dashboard</h1>
        <p className="text-muted-foreground">Your hosting overview</p>
      </div>

      {/* Upcoming Reservations Widget */}
      <UpcomingReservationsWidget />

      {/* Quick Availability Actions */}
      <div className="animate-fade-in">
        <QuickAvailabilityActions />
      </div>

      {/* Total Earnings Card - Primary CTA */}
      <Card
        className="p-6 bg-primary text-primary-foreground cursor-pointer hover:opacity-90 transition-opacity animate-fade-in"
        onClick={() => navigate('/host-earnings-history')}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              <span className="text-sm opacity-90">All-Time Earnings</span>
            </div>
            <div>
              <p className="text-3xl font-bold">${stats.totalEarnings.toFixed(2)}</p>
              <p className="text-sm opacity-75">{stats.totalBookings} total booking{stats.totalBookings !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 opacity-75" />
        </div>
      </Card>

      {/* Stripe Balance Section */}
      <div className="space-y-3 animate-fade-in" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          Payout Information
        </h2>

        {stripeLoading ? (
          <Card className="p-4">
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </Card>
        ) : stripeBalance?.connected ? (
          <>
            {/* Available & Pending Balance */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Available Balance</p>
                <p className="text-2xl font-bold text-green-600">${stripeBalance.available_balance.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Ready for payout</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Pending Balance</p>
                <p className="text-2xl font-bold text-yellow-600">${stripeBalance.pending_balance.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Processing</p>
              </Card>
            </div>

            {/* Next Payout */}
            {stripeBalance.next_payout_date && (
              <Card className="p-4 bg-primary/5 border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Next Payout</p>
                    <p className="font-semibold">
                      {format(new Date(stripeBalance.next_payout_date), 'EEEE, MMM d')}
                    </p>
                  </div>
                  {stripeBalance.next_payout_amount && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-1">Amount</p>
                      <p className="text-xl font-bold text-primary">
                        ${stripeBalance.next_payout_amount.toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Last Payout Status */}
            {stripeBalance.last_payout_status && (
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getPayoutStatusIcon(stripeBalance.last_payout_status)}
                    <div>
                      <p className="text-xs text-muted-foreground">Last Payout</p>
                      <p className="text-sm font-medium">
                        {stripeBalance.last_payout_date
                          ? format(new Date(stripeBalance.last_payout_date), 'MMM d, yyyy')
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {stripeBalance.last_payout_amount && (
                      <span className="font-semibold">${stripeBalance.last_payout_amount.toFixed(2)}</span>
                    )}
                    {getPayoutStatusBadge(stripeBalance.last_payout_status)}
                  </div>
                </div>
              </Card>
            )}
          </>
        ) : (
          <Card className="p-4 border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-yellow-800 dark:text-yellow-300">Stripe Not Connected</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  Connect your Stripe account to receive payouts.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Earnings by Spot */}
      <div className="animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
        <EarningsBySpot />
      </div>

      {/* Recent Reviews */}
      <div className="animate-fade-in" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
        <RecentReviews />
      </div>

      {/* Quick Actions */}
      <div className="space-y-3 animate-fade-in" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
        <h2 className="text-lg font-semibold">Quick Actions</h2>
        <Button
          className="w-full"
          onClick={() => navigate('/list-spot')}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Spot
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate('/dashboard')}
        >
          <MapPin className="h-4 w-4 mr-2" />
          View All Listings
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setMode('driver');
            navigate('/');
          }}
        >
          <Car className="h-4 w-4 mr-2" />
          Find Parking
        </Button>
      </div>
    </div>
  );
};

export default HostHome;
