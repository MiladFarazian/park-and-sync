import React, { useState, useEffect } from 'react';
import { Plus, Star, MapPin, Edit, TrendingUp, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatAvailability } from '@/lib/formatAvailability';
import { ActiveBookingBanner } from '@/components/booking/ActiveBookingBanner';

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('listings');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [listings, setListings] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalBookings: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchHostData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const handleToggleStatus = async (spotId: string, currentStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // Determine new status based on current status
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      
      const { error } = await supabase
        .from('spots')
        .update({ status: newStatus })
        .eq('id', spotId);

      if (error) throw error;

      toast.success(`Spot ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
      
      // Update local state
      setListings(prev => prev.map(spot => 
        spot.id === spotId ? { ...spot, status: newStatus } : spot
      ));
    } catch (error: any) {
      console.error('Error toggling spot status:', error);
      toast.error('Failed to update spot status');
    }
  };

  const fetchHostData = async () => {
    try {
      setLoading(true);

      // Fetch spots
      const { data: spotsData, error: spotsError } = await supabase
        .from('spots')
        .select(`
          id,
          title,
          address,
          hourly_rate,
          status,
          spot_photos (
            url,
            is_primary
          ),
          availability_rules (
            day_of_week,
            start_time,
            end_time,
            is_available
          )
        `)
        .eq('host_id', user?.id)
        .order('created_at', { ascending: false });

      if (spotsError) throw spotsError;

      // Fetch bookings for each spot to calculate earnings
      const spotsWithEarnings = await Promise.all(
        (spotsData || []).map(async (spot) => {
          const { data: bookings } = await supabase
            .from('bookings')
            .select('total_amount, status')
            .eq('spot_id', spot.id)
            .eq('status', 'completed');

          const earnings = bookings?.reduce((sum, b) => sum + Number(b.total_amount), 0) || 0;
          const primaryPhoto = spot.spot_photos?.find((p: any) => p.is_primary) || spot.spot_photos?.[0];

          return {
            ...spot,
            earnings,
            image: primaryPhoto?.url || '/placeholder.svg',
            reviews: 0,
            rating: 0,
          };
        })
      );

      setListings(spotsWithEarnings);

      // Calculate total stats
      const totalEarnings = spotsWithEarnings.reduce((sum, spot) => sum + spot.earnings, 0);
      const { data: allBookings } = await supabase
        .from('bookings')
        .select('id')
        .in('spot_id', spotsWithEarnings.map(s => s.id))
        .eq('status', 'completed');

      setStats({
        totalEarnings,
        totalBookings: allBookings?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching host data:', error);
      toast.error('Failed to load listings');
    } finally {
      setLoading(false);
    }
  };

  const ListingCard = ({ listing }: { listing: any }) => (
    <Card 
      className="p-0 overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
      onClick={() => navigate(`/spot/${listing.id}`)}
    >
      <div className="relative h-48 w-full bg-muted">
        <img 
          src={listing.image} 
          alt={listing.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-3 right-3">
          <Badge 
            className={
              listing.status === 'active' 
                ? "bg-green-500 text-white hover:bg-green-600"
                : listing.status === 'inactive'
                ? "bg-gray-500 text-white hover:bg-gray-600"
                : "bg-yellow-500 text-white hover:bg-yellow-600"
            }
          >
            {listing.status === 'active' ? 'Active' : listing.status === 'inactive' ? 'Inactive' : listing.status}
          </Badge>
        </div>
        <div className="absolute bottom-3 left-3">
          <Badge variant="secondary" className="text-sm px-2.5 py-1 font-semibold">
            ${listing.hourly_rate}/hr
          </Badge>
        </div>
      </div>
      
      <div className="p-4 space-y-3">
        <div>
          <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-1">{listing.address}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">{formatAvailability(listing.availability_rules)}</span>
        </div>
        
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-muted-foreground">Total Earnings</p>
              <p className="font-bold text-xl text-primary">${listing.earnings.toFixed(2)}</p>
            </div>
          </div>
          
          {(listing.status === 'active' || listing.status === 'inactive') && (
            <div 
              className="flex items-center justify-between p-3 mb-3 bg-muted rounded-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <Label htmlFor={`toggle-${listing.id}`} className="text-sm font-medium cursor-pointer">
                {listing.status === 'active' ? 'Spot is Active' : 'Spot is Inactive'}
              </Label>
              <Switch
                id={`toggle-${listing.id}`}
                checked={listing.status === 'active'}
                onCheckedChange={() => handleToggleStatus(listing.id, listing.status, { stopPropagation: () => {} } as React.MouseEvent)}
              />
            </div>
          )}
          
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => navigate(`/edit-availability/${listing.id}`)}
            >
              <Clock className="h-4 w-4 mr-1.5" />
              Schedule
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => navigate(`/edit-spot/${listing.id}`)}
            >
              <Edit className="h-4 w-4 mr-1.5" />
              Edit
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );

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

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <h2 className="text-2xl font-bold mb-2">Sign In Required</h2>
          <p className="text-muted-foreground mb-6">
            Please sign in to access your host dashboard and manage your listings.
          </p>
          <Button 
            onClick={() => navigate('/auth')}
            className="w-full"
          >
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <ActiveBookingBanner />
      
      {/* Header with Add Button */}
      <div className="pt-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">My Listings</h1>
          <p className="text-muted-foreground">Manage your parking spots</p>
        </div>
        <Button 
          className="bg-primary text-primary-foreground"
          onClick={() => navigate('/list-spot')}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Spot
        </Button>
      </div>

      {/* Listings Grid */}
      {listings.length === 0 ? (
        <Card className="p-6 text-center">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground mb-4">No listings yet</p>
          <Button onClick={() => navigate('/list-spot')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Spot
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
