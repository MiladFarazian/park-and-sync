import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, Calendar, MapPin, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMode } from '@/contexts/ModeContext';
import { toast } from 'sonner';
import { ActiveBookingBanner } from '@/components/booking/ActiveBookingBanner';
import EarningsAnalytics from '@/components/host/EarningsAnalytics';
import RecentReviews from '@/components/host/RecentReviews';
import UpcomingReservationsWidget from '@/components/host/UpcomingReservationsWidget';

const HostHome = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { setMode } = useMode();
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalBookings: 0,
    activeListings: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchHostStats();
    } else if (!authLoading) {
      setLoading(false);
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
          activeListings: 0,
        });
        setLoading(false);
        return;
      }

      // Fetch completed bookings for earnings
      const { data: completedBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('host_earnings, total_amount, status')
        .in('spot_id', spotIds)
        .eq('status', 'completed');

      if (bookingsError) throw bookingsError;

      // Calculate total earnings using host_earnings field if available, otherwise use total_amount
      const totalEarnings = completedBookings?.reduce((sum, b) => {
        const earnings = b.host_earnings ? Number(b.host_earnings) : Number(b.total_amount);
        return sum + earnings;
      }, 0) || 0;

      setStats({
        totalEarnings,
        totalBookings: completedBookings?.length || 0,
        activeListings: spotsData?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching host stats:', error);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
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
        <div className="grid grid-cols-1 gap-4">
          <Card className="p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-9 w-32 mt-2" />
              <Skeleton className="h-4 w-28" />
            </div>
          </Card>
          
          <Card className="p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-9 w-16 mt-2" />
              <Skeleton className="h-4 w-24" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-9 w-12 mt-2" />
              <Skeleton className="h-4 w-28" />
            </div>
          </Card>
        </div>

        {/* Earnings Analytics Skeleton */}
        <Card className="p-6">
          <Skeleton className="h-6 w-40 mb-4" />
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Skeleton className="h-16 rounded" />
            <Skeleton className="h-16 rounded" />
            <Skeleton className="h-16 rounded" />
          </div>
          <Skeleton className="h-48 w-full rounded" />
        </Card>

        {/* Quick Actions Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 pb-4">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-2xl font-bold">Host Dashboard</h1>
        <p className="text-muted-foreground">Your hosting overview</p>
      </div>

      <ActiveBookingBanner />

      {/* Upcoming Reservations Widget */}
      <UpcomingReservationsWidget />
      <div className="grid grid-cols-1 gap-4 animate-fade-in">
        <Card className="p-6 bg-primary text-primary-foreground">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              <span className="text-sm opacity-90">Total Earnings</span>
            </div>
            <div>
              <p className="text-3xl font-bold">${stats.totalEarnings.toFixed(2)}</p>
              <p className="text-sm opacity-75">Lifetime earnings</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Completed Bookings</span>
            </div>
            <div>
              <p className="text-3xl font-bold">{stats.totalBookings}</p>
              <p className="text-sm text-muted-foreground">Total bookings</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Active Listings</span>
            </div>
            <div>
              <p className="text-3xl font-bold">{stats.activeListings}</p>
              <p className="text-sm text-muted-foreground">Published spots</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Earnings Analytics */}
      <div className="animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
        <EarningsAnalytics />
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
