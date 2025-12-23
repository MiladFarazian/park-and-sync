import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, parseISO } from 'date-fns';

interface Spot {
  id: string;
  title: string;
  hourly_rate: number;
  address: string;
}

const ManageAvailabilitySelect = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpots, setSelectedSpots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedDate = dateParam ? parseISO(dateParam) : new Date();

  useEffect(() => {
    if (user) {
      fetchSpots();
    }
  }, [user]);

  const fetchSpots = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('spots')
        .select('id, title, hourly_rate, address')
        .eq('host_id', user.id)
        .eq('status', 'active');

      if (error) throw error;
      setSpots(data || []);
      
      // Auto-select all spots by default
      if (data && data.length > 0) {
        setSelectedSpots(data.map(s => s.id));
      }
    } catch (error) {
      console.error('Error fetching spots:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSpot = (spotId: string) => {
    setSelectedSpots(prev => 
      prev.includes(spotId) 
        ? prev.filter(id => id !== spotId)
        : [...prev, spotId]
    );
  };

  const toggleAll = () => {
    if (selectedSpots.length === spots.length) {
      setSelectedSpots([]);
    } else {
      setSelectedSpots(spots.map(s => s.id));
    }
  };

  const handleContinue = () => {
    if (selectedSpots.length === 1) {
      // Single spot - go directly to its availability page
      navigate(`/edit-spot/${selectedSpots[0]}/availability`);
    } else if (selectedSpots.length > 1) {
      // Multiple spots - go to bulk editor with spot IDs and date
      const spotIdsParam = selectedSpots.join(',');
      navigate(`/manage-availability/bulk?spots=${spotIdsParam}${dateParam ? `&date=${dateParam}` : ''}`);
    }
  };

  if (!user) {
    return (
      <div className="p-4">
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">Please sign in to manage availability.</p>
          <Button onClick={() => navigate('/auth')} className="mt-4">Sign In</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Manage Availability</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Instructions */}
      <Card className="p-4 bg-muted/50">
        <p className="text-sm text-muted-foreground">
          Select which spot's availability you want to manage. You can block dates, set custom rates, or adjust your schedule.
        </p>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : spots.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground mb-4">You don't have any active spots.</p>
          <Button onClick={() => navigate('/list-spot')}>List a Spot</Button>
        </Card>
      ) : (
        <>
          {/* Select All */}
          {spots.length > 1 && (
            <div 
              className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={toggleAll}
            >
              <Checkbox 
                checked={selectedSpots.length === spots.length}
                onCheckedChange={toggleAll}
              />
              <span className="font-medium">
                {selectedSpots.length === spots.length ? 'Deselect All' : 'Select All Spots'}
              </span>
            </div>
          )}

          {/* Spots List */}
          <div className="space-y-2">
            {spots.map(spot => (
              <Card 
                key={spot.id}
                className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => {
                  if (spots.length === 1) {
                    navigate(`/edit-spot/${spot.id}/availability`);
                  } else {
                    toggleSpot(spot.id);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  {spots.length > 1 && (
                    <Checkbox 
                      checked={selectedSpots.includes(spot.id)}
                      onCheckedChange={() => toggleSpot(spot.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{spot.title}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {spot.address}
                    </div>
                    <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                      ${spot.hourly_rate}/hr
                    </div>
                  </div>
                  {spots.length === 1 && (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Continue Button */}
          {spots.length > 1 && (
            <Button 
              className="w-full" 
              size="lg"
              disabled={selectedSpots.length === 0}
              onClick={handleContinue}
            >
              Continue with {selectedSpots.length} {selectedSpots.length === 1 ? 'Spot' : 'Spots'}
            </Button>
          )}
        </>
      )}
    </div>
  );
};

export default ManageAvailabilitySelect;