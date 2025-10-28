import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const HostHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalBookings: 0,
    activeListings: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchHostStats();
    }
  }, [user]);

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

      // Fetch completed bookings for earnings
      const { data: completedBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('total_amount')
        .in('spot_id', spotIds)
        .eq('status', 'completed');

      if (bookingsError) throw bookingsError;

      const totalEarnings = completedBookings?.reduce((sum, b) => sum + Number(b.total_amount), 0) || 0;

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

  if (loading) {
    return (
      <div className="p-4 space-y-6">
        <div className="pt-4">
          <h1 className="text-2xl font-bold">Host Dashboard</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-2xl font-bold">Host Dashboard</h1>
        <p className="text-muted-foreground">Your hosting overview</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4">
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

      {/* Quick Actions */}
      <div className="space-y-3">
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
      </div>
    </div>
  );
};

export default HostHome;
