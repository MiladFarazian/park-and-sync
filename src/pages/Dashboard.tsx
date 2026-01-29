import React, { useState, useEffect } from 'react';
import { Plus, Star, MapPin, Edit, TrendingUp, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from '@/components/ui/pagination';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatAvailability } from '@/lib/formatAvailability';
import { ActiveBookingBanner } from '@/components/booking/ActiveBookingBanner';
import { getHostNetEarnings } from '@/lib/hostEarnings';
import { PLACEHOLDER_IMAGE } from '@/lib/constants';
import { usePagination, getPaginationRange } from '@/hooks/usePagination';
import { logger } from '@/lib/logger';

const log = logger.scope('Dashboard');

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
  const [totalListings, setTotalListings] = useState(0);

  const PAGE_SIZE = 6;
  const pagination = usePagination({ pageSize: PAGE_SIZE });

  useEffect(() => {
    if (user) {
      fetchHostData();
    } else {
      setLoading(false);
    }
  }, [user, pagination.currentPage]);

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
      log.error('Error toggling spot status:', error);
      toast.error('Failed to update spot status');
    }
  };

  const fetchHostData = async () => {
    try {
      setLoading(true);

      // First, get total count for pagination
      const { count, error: countError } = await supabase
        .from('spots')
        .select('id', { count: 'exact', head: true })
        .eq('host_id', user?.id);

      if (countError) {
        log.error('Error getting count:', countError);
      } else {
        setTotalListings(count || 0);
        pagination.setTotalItems(count || 0);
      }

      // Fetch paginated spots
      const { from, to } = getPaginationRange(pagination.currentPage, PAGE_SIZE);

      const { data: spotsData, error: spotsError } = await supabase
        .from('spots')
        .select(`
          id,
          title,
          category,
          address,
          hourly_rate,
          status,
          quantity,
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
        .order('created_at', { ascending: false })
        .range(from, to);

      if (spotsError) throw spotsError;

      const spotIds = (spotsData || []).map(s => s.id);

      // Fetch all completed bookings for all spots in a single query (fixes N+1)
      const { data: allBookings } = spotIds.length > 0
        ? await supabase
            .from('bookings')
            .select('id, spot_id, host_earnings, hourly_rate, start_at, end_at, status, extension_charges')
            .in('spot_id', spotIds)
            .in('status', ['completed', 'active', 'paid'])
        : { data: [] };

      // Group bookings by spot_id for efficient lookup
      const bookingsBySpot = (allBookings || []).reduce((acc, booking) => {
        if (!acc[booking.spot_id]) {
          acc[booking.spot_id] = [];
        }
        acc[booking.spot_id].push(booking);
        return acc;
      }, {} as Record<string, typeof allBookings>);

      // Map spots with their earnings (no additional queries needed)
      const spotsWithEarnings = (spotsData || []).map((spot) => {
        const spotBookings = bookingsBySpot[spot.id] || [];
        const earnings = spotBookings.reduce((sum, b) => sum + getHostNetEarnings(b), 0);
        const primaryPhoto = spot.spot_photos?.find((p: any) => p.is_primary) || spot.spot_photos?.[0];

        return {
          ...spot,
          earnings,
          image: primaryPhoto?.url || PLACEHOLDER_IMAGE,
          reviews: 0,
          rating: 0,
        };
      });

      setListings(spotsWithEarnings);

      // Calculate total stats from already-fetched data
      const totalEarnings = spotsWithEarnings.reduce((sum, spot) => sum + spot.earnings, 0);

      setStats({
        totalEarnings,
        totalBookings: allBookings?.length || 0,
      });
    } catch (error) {
      log.error('Error fetching host data:', error);
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
          <div className="flex items-center gap-2 mb-2">
            {listing.category && (
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                {listing.category}
              </Badge>
            )}
            {listing.quantity > 1 && (
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                {listing.quantity} spots
              </Badge>
            )}
          </div>
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

  const ListingCardSkeleton = () => (
    <Card className="p-0 overflow-hidden">
      <Skeleton className="h-48 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <div>
          <Skeleton className="h-5 w-24 mb-2" />
          <div className="flex items-start gap-1.5">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="pt-2 border-t">
          <div className="mb-3">
            <Skeleton className="h-3 w-20 mb-1" />
            <Skeleton className="h-7 w-24" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg mb-3" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded" />
            <Skeleton className="h-9 flex-1 rounded" />
          </div>
        </div>
      </div>
    </Card>
  );

  if (loading) {
    return (
      <div className="p-4 space-y-6">
        {/* Header */}
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

        {/* Listing Cards Skeleton */}
        <div className="grid gap-4">
          <ListingCardSkeleton />
          <ListingCardSkeleton />
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
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
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
        <Card className="p-6 text-center animate-fade-in">
          <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground mb-4">No listings yet</p>
          <Button onClick={() => navigate('/list-spot')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Spot
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing, index) => (
              <div
                key={listing.id}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'both' }}
              >
                <ListingCard listing={listing} />
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {pagination.startIndex + 1} to {Math.min(pagination.endIndex + 1, totalListings)} of {totalListings} listings
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => pagination.previousPage()}
                      className={!pagination.hasPreviousPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>

                  {pagination.getPageRange()[0] > 1 && (
                    <>
                      <PaginationItem>
                        <PaginationLink onClick={() => pagination.setPage(1)} className="cursor-pointer">
                          1
                        </PaginationLink>
                      </PaginationItem>
                      {pagination.getPageRange()[0] > 2 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                    </>
                  )}

                  {pagination.getPageRange().map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => pagination.setPage(page)}
                        isActive={page === pagination.currentPage}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}

                  {pagination.getPageRange()[pagination.getPageRange().length - 1] < pagination.totalPages && (
                    <>
                      {pagination.getPageRange()[pagination.getPageRange().length - 1] < pagination.totalPages - 1 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationLink onClick={() => pagination.setPage(pagination.totalPages)} className="cursor-pointer">
                          {pagination.totalPages}
                        </PaginationLink>
                      </PaginationItem>
                    </>
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => pagination.nextPage()}
                      className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
