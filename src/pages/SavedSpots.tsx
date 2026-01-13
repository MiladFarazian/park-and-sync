import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFavoriteSpots } from '@/hooks/useFavoriteSpots';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Heart, MapPin, Star, Zap, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SavedSpot {
  id: string;
  title: string;
  address: string;
  hourly_rate: number;
  has_ev_charging: boolean;
  primary_image?: string;
  host_rating?: number;
}

export default function SavedSpots() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { favorites, toggleFavorite, isLoading: isFavoriteLoading } = useFavoriteSpots();
  const [spots, setSpots] = useState<SavedSpot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSavedSpots = async () => {
      if (!user || favorites.length === 0) {
        setSpots([]);
        setIsLoading(false);
        return;
      }

      try {
        const { data: spotsData, error: spotsError } = await supabase
          .from('spots')
          .select(`
            id,
            title,
            address,
            hourly_rate,
            has_ev_charging,
            host_id
          `)
          .in('id', favorites)
          .eq('status', 'active');

        if (spotsError) throw spotsError;

        // Get primary photos for each spot
        const spotIds = spotsData?.map(s => s.id) || [];
        const { data: photosData } = await supabase
          .from('spot_photos')
          .select('spot_id, url')
          .in('spot_id', spotIds)
          .eq('is_primary', true);

        // Get host ratings
        const hostIds = [...new Set(spotsData?.map(s => s.host_id) || [])];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, rating')
          .in('user_id', hostIds);

        const photoMap = new Map(photosData?.map(p => [p.spot_id, p.url]));
        const ratingMap = new Map(profilesData?.map(p => [p.user_id, p.rating]));

        const enrichedSpots: SavedSpot[] = (spotsData || []).map(spot => ({
          id: spot.id,
          title: spot.title,
          address: spot.address,
          hourly_rate: spot.hourly_rate,
          has_ev_charging: spot.has_ev_charging || false,
          primary_image: photoMap.get(spot.id),
          host_rating: ratingMap.get(spot.host_id) || undefined
        }));

        setSpots(enrichedSpots);
      } catch (error) {
        console.error('Error fetching saved spots:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSavedSpots();
  }, [user, favorites]);

  const handleRemove = async (spotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleFavorite(spotId);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">Saved Spots</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-8 text-center mt-20">
          <Heart className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Sign in to see saved spots</h2>
          <p className="text-muted-foreground mb-6">
            Create an account or sign in to save your favorite parking spots.
          </p>
          <Button onClick={() => navigate('/auth')}>Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Saved Spots</h1>
          {spots.length > 0 && (
            <span className="text-sm text-muted-foreground">({spots.length})</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-0">
                  <div className="flex gap-4 p-4">
                    <Skeleton className="w-24 h-24 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : spots.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center mt-20">
            <Heart className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No saved spots yet</h2>
            <p className="text-muted-foreground mb-6">
              Browse parking spots and tap the heart icon to save them here.
            </p>
            <Button onClick={() => navigate('/explore')}>Explore Spots</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {spots.map((spot) => (
              <Card 
                key={spot.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/spot/${spot.id}`)}
              >
                <CardContent className="p-0">
                  <div className="flex gap-4 p-4">
                    {/* Image */}
                    <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                      {spot.primary_image ? (
                        <img 
                          src={spot.primary_image} 
                          alt={spot.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <MapPin className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold truncate">{spot.title}</h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={(e) => handleRemove(spot.id, e)}
                          disabled={isFavoriteLoading}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                      
                      <p className="text-sm text-muted-foreground truncate mt-1">
                        {spot.address}
                      </p>
                      
                      <div className="flex items-center gap-3 mt-2">
                        <span className="font-semibold text-primary">
                          ${spot.hourly_rate.toFixed(2)}/hr
                        </span>
                        
                        {spot.host_rating && spot.host_rating > 0 && (
                          <div className="flex items-center gap-1 text-sm">
                            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                            <span>{spot.host_rating.toFixed(1)}</span>
                          </div>
                        )}
                        
                        {spot.has_ev_charging && (
                          <div className="flex items-center gap-1 text-sm text-green-600">
                            <Zap className="h-3.5 w-3.5" />
                            <span>EV</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
