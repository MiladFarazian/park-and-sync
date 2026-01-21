import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, ChevronRight, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getHostNetEarnings } from '@/lib/hostEarnings';

interface SpotEarnings {
  id: string;
  title: string;
  address: string;
  totalEarnings: number;
  bookingCount: number;
  photoUrl: string | null;
}

const EarningsBySpot = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [spots, setSpots] = useState<SpotEarnings[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSpotEarnings();
    }
  }, [user]);

  const fetchSpotEarnings = async () => {
    try {
      setLoading(true);

      // Fetch all spots with their photos
      const { data: spotsData, error: spotsError } = await supabase
        .from('spots')
        .select(`
          id,
          title,
          address,
          spot_photos(url, is_primary, sort_order)
        `)
        .eq('host_id', user?.id);

      if (spotsError) throw spotsError;

      if (!spotsData || spotsData.length === 0) {
        setSpots([]);
        setLoading(false);
        return;
      }

      // Fetch bookings for all spots
      const spotIds = spotsData.map(s => s.id);
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('spot_id, host_earnings, hourly_rate, start_at, end_at, status, extension_charges')
        .in('spot_id', spotIds)
        .in('status', ['completed', 'active', 'paid']);

      if (bookingsError) throw bookingsError;

      // Calculate earnings per spot
      const spotEarnings: SpotEarnings[] = spotsData.map(spot => {
        const spotBookings = bookingsData?.filter(b => b.spot_id === spot.id) || [];
        const totalEarnings = spotBookings.reduce((sum, b) => sum + getHostNetEarnings(b), 0);

        // Get primary photo or first photo
        const photos = spot.spot_photos || [];
        const primaryPhoto = photos.find((p: any) => p.is_primary);
        const fallbackPhoto = [...photos].sort((a: any, b: any) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0)
        )[0];
        const photoUrl = primaryPhoto?.url || fallbackPhoto?.url || null;

        return {
          id: spot.id,
          title: spot.title || 'Untitled Spot',
          address: spot.address || '',
          totalEarnings,
          bookingCount: spotBookings.length,
          photoUrl,
        };
      });

      // Sort by earnings descending
      spotEarnings.sort((a, b) => b.totalEarnings - a.totalEarnings);
      setSpots(spotEarnings);
    } catch (error) {
      console.error('Error fetching spot earnings:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  }

  if (spots.length === 0) {
    return null;
  }

  const displayedSpots = expanded ? spots : spots.slice(0, 3);

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-primary" />
        Earnings by Spot
      </h3>
      <div className="space-y-2">
        {displayedSpots.map(spot => (
          <div
            key={spot.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
            onClick={() => navigate(`/edit-spot/${spot.id}`)}
          >
            {/* Thumbnail */}
            {spot.photoUrl ? (
              <img
                src={spot.photoUrl}
                alt={spot.title}
                className="h-12 w-12 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5 text-muted-foreground" />
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{spot.title}</p>
              <p className="text-xs text-muted-foreground truncate">{spot.address}</p>
              <p className="text-xs text-muted-foreground">
                {spot.bookingCount} booking{spot.bookingCount !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Earnings */}
            <div className="text-right shrink-0">
              <p className="font-bold text-primary">${spot.totalEarnings.toFixed(2)}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        ))}
      </div>

      {spots.length > 3 && (
        <button
          className="w-full mt-3 text-sm text-primary hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `Show all ${spots.length} spots`}
        </button>
      )}
    </Card>
  );
};

export default EarningsBySpot;
