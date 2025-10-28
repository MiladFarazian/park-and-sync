import React, { useState, useEffect } from 'react';
import { Plus, Star, MapPin, Edit, Eye, TrendingUp, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
    }
  }, [user]);

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

  const formatAvailability = (rules: any[]) => {
    if (!rules || rules.length === 0) return 'No schedule set';
    
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const availableDays = [...new Set(rules.filter(r => r.is_available).map(r => r.day_of_week))];
    
    if (availableDays.length === 0) return 'Unavailable';
    if (availableDays.length === 7) return 'Available 24/7';
    
    return availableDays.map(d => DAYS[d]).join(', ');
  };

  const ListingCard = ({ listing }: { listing: any }) => (
    <Card className="p-4">
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 relative">
          <img 
            src={listing.image} 
            alt={listing.title}
            className="w-full h-full object-cover rounded-lg"
          />
          <div className="absolute top-1 left-1">
            <Badge variant="secondary" className="text-xs px-1.5 py-0.5">${listing.hourly_rate}/hr</Badge>
          </div>
        </div>
        
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-semibold text-base leading-tight">{listing.title}</h3>
            <Badge className={listing.status === 'active' ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"} variant="secondary">
              {listing.status === 'active' ? 'Active' : listing.status}
            </Badge>
          </div>
          
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{listing.address}</span>
          </div>
          
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{formatAvailability(listing.availability_rules)}</span>
          </div>
          
          <div className="flex items-center justify-between pt-1">
            <p className="font-bold text-lg">${listing.earnings.toFixed(2)}</p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs px-2 py-1"
                onClick={() => navigate(`/edit-availability/${listing.id}`)}
              >
                <Clock className="h-3 w-3 mr-1" />
                Schedule
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs px-2 py-1"
                onClick={() => navigate(`/edit-spot/${listing.id}`)}
              >
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs px-2 py-1"
                onClick={() => navigate(`/spot/${listing.id}`)}
              >
                <Eye className="h-3 w-3 mr-1" />
                View
              </Button>
            </div>
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

  return (
    <div className="p-4 space-y-6">
      {/* Header with Add Button */}
      <div className="pt-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Host Dashboard</h1>
          <p className="text-muted-foreground">Manage your listings</p>
        </div>
        <Button 
          className="bg-primary text-primary-foreground"
          onClick={() => navigate('/list-spot')}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Spot
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 bg-primary text-primary-foreground">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm opacity-90">Earnings</span>
            </div>
            <div>
              <p className="text-2xl font-bold">${stats.totalEarnings.toFixed(2)}</p>
              <p className="text-sm opacity-75">Total earned</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-4 bg-primary text-primary-foreground">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="text-sm opacity-90">Bookings</span>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalBookings}</p>
              <p className="text-sm opacity-75">Completed</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="listings">Listings ({listings.length})</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
        </TabsList>
        
        <TabsContent value="listings" className="space-y-3 mt-6">
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
            listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))
          )}
        </TabsContent>
        
        <TabsContent value="requests" className="space-y-3 mt-6">
          <Card className="p-6 text-center">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No pending requests</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
