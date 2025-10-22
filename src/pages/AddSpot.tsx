import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MapPin, DollarSign, Star, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const AddSpot = () => {
  const [activeTab, setActiveTab] = useState('listings');
  const [listedSpots, setListedSpots] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchSpots();
    }
  }, [user]);

  const fetchSpots = async () => {
    try {
      setLoading(true);
      
      // Fetch active listings
      const { data: activeSpots, error: activeError } = await supabase
        .from('spots')
        .select('*')
        .eq('host_id', user?.id)
        .eq('status', 'active');

      if (activeError) throw activeError;

      // Fetch pending requests
      const { data: pendingSpots, error: pendingError } = await supabase
        .from('spots')
        .select('*')
        .eq('host_id', user?.id)
        .eq('status', 'pending_approval');

      if (pendingError) throw pendingError;

      setListedSpots(activeSpots || []);
      setPendingRequests(pendingSpots || []);
    } catch (error) {
      console.error('Error fetching spots:', error);
    } finally {
      setLoading(false);
    }
  };

  const ListingCard = ({ listing }: { listing: any }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-semibold">{listing.title}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {listing.address}
            </p>
          </div>
          <Badge variant="default">Active</Badge>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span>${listing.hourly_rate}/hr</span>
        </div>
      </CardContent>
      <div className="p-4 pt-0 flex gap-2">
        <Button variant="outline" className="flex-1">Edit</Button>
        <Button variant="default" className="flex-1" onClick={() => navigate(`/spot/${listing.id}`)}>View</Button>
      </div>
    </Card>
  );

  const RequestCard = ({ request }: { request: any }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold">{request.title}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {request.address}
            </p>
          </div>
          <Badge variant="secondary">Under Review</Badge>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <p>Loading your listings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="p-4 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">Your Listings</h1>
            <p className="text-sm text-muted-foreground">Manage your parking spots</p>
          </div>
          <Button onClick={() => navigate('/list-spot')} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Spot
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="listings">Active Listings</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="listings" className="space-y-4 mt-4">
            {listedSpots.length > 0 ? (
              listedSpots.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-semibold mb-2">No listings yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start earning by listing your parking spot
                  </p>
                  <Button onClick={() => navigate('/list-spot')}>
                    <Plus className="h-4 w-4 mr-2" />
                    List Your First Spot
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="requests" className="space-y-4 mt-4">
            {pendingRequests.length > 0 ? (
              pendingRequests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <h3 className="font-semibold mb-2">No pending requests</h3>
                  <p className="text-sm text-muted-foreground">
                    Your listing requests will appear here
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AddSpot;
