import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export function useFavoriteSpots() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Fetch user's favorite spots
  const fetchFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      setIsInitialized(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('favorite_spots')
        .select('spot_id')
        .eq('user_id', user.id);

      if (error) throw error;
      setFavorites(data?.map(f => f.spot_id) || []);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setIsInitialized(true);
    }
  }, [user]);

  useEffect(() => {
    setIsInitialized(false);
    fetchFavorites();
  }, [fetchFavorites]);

  // Check if a spot is favorited
  const isFavorite = useCallback((spotId: string) => {
    return favorites.includes(spotId);
  }, [favorites]);

  // Toggle favorite status
  const toggleFavorite = useCallback(async (spotId: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save spots to your favorites.",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    const wasFavorited = favorites.includes(spotId);

    // Optimistic update
    if (wasFavorited) {
      setFavorites(prev => prev.filter(id => id !== spotId));
    } else {
      setFavorites(prev => [...prev, spotId]);
    }

    try {
      if (wasFavorited) {
        const { error } = await supabase
          .from('favorite_spots')
          .delete()
          .eq('user_id', user.id)
          .eq('spot_id', spotId);

        if (error) throw error;
        
        toast({
          title: "Removed from favorites",
          description: "Spot has been removed from your saved list."
        });
      } else {
        const { error } = await supabase
          .from('favorite_spots')
          .insert({ user_id: user.id, spot_id: spotId });

        if (error) throw error;
        
        toast({
          title: "Saved to favorites",
          description: "Spot has been added to your saved list."
        });
      }
      return true;
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Revert optimistic update
      if (wasFavorited) {
        setFavorites(prev => [...prev, spotId]);
      } else {
        setFavorites(prev => prev.filter(id => id !== spotId));
      }
      toast({
        title: "Error",
        description: "Could not update favorites. Please try again.",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, favorites]);

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    isLoading,
    isInitialized,
    refetch: fetchFavorites
  };
}
