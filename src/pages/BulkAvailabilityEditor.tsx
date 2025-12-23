import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { DateOverrideManager, DateOverride } from '@/components/availability/DateOverrideManager';

interface Spot {
  id: string;
  title: string;
  hourly_rate: number;
}

const BulkAvailabilityEditor = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  
  const spotIds = searchParams.get('spots')?.split(',') || [];
  const dateParam = searchParams.get('date');
  
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dateOverrides, setDateOverrides] = useState<DateOverride[]>([]);
  const [showSpotList, setShowSpotList] = useState(false);

  // Calculate average rate for the DateOverrideManager
  const averageRate = spots.length > 0 
    ? spots.reduce((sum, s) => sum + s.hourly_rate, 0) / spots.length 
    : 5;

  useEffect(() => {
    if (user && spotIds.length > 0) {
      fetchSpots();
    } else if (spotIds.length === 0) {
      navigate('/manage-availability');
    }
  }, [user, spotIds.length]);

  const fetchSpots = async () => {
    try {
      const { data, error } = await supabase
        .from('spots')
        .select('id, title, hourly_rate')
        .in('id', spotIds)
        .eq('host_id', user?.id);

      if (error) throw error;
      setSpots(data || []);
    } catch (error) {
      console.error('Error fetching spots:', error);
      toast({
        title: 'Error',
        description: 'Failed to load spots',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (spots.length === 0) return;
    
    setIsSaving(true);
    try {
      // For each spot, delete existing overrides and insert new ones
      for (const spot of spots) {
        // Delete existing overrides for dates that are being updated
        const datesToUpdate = dateOverrides.map(o => o.override_date);
        
        if (datesToUpdate.length > 0) {
          const { error: deleteError } = await supabase
            .from('calendar_overrides')
            .delete()
            .eq('spot_id', spot.id)
            .in('override_date', datesToUpdate);

          if (deleteError) throw deleteError;
        }

        // Insert new overrides
        if (dateOverrides.length > 0) {
          const overridesToInsert = dateOverrides.map(override => ({
            spot_id: spot.id,
            override_date: override.override_date,
            start_time: override.start_time || null,
            end_time: override.end_time || null,
            is_available: override.is_available,
            custom_rate: override.custom_rate || null
          }));

          const { error: insertError } = await supabase
            .from('calendar_overrides')
            .insert(overridesToInsert);

          if (insertError) throw insertError;
        }
      }

      toast({
        title: 'Success',
        description: `Availability updated for ${spots.length} spot${spots.length > 1 ? 's' : ''}`
      });
      
      navigate('/host-calendar');
    } catch (error) {
      console.error('Error saving overrides:', error);
      toast({
        title: 'Error',
        description: 'Failed to save availability changes',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Bulk Availability</h1>
              <button 
                className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => setShowSpotList(!showSpotList)}
              >
                Applying to {spots.length} spot{spots.length > 1 ? 's' : ''}
                {showSpotList ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save All
            </Button>
          </div>
        </div>
        
        {/* Expandable spot list */}
        {showSpotList && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
            <div className="space-y-1">
              {spots.map(spot => (
                <div key={spot.id} className="text-sm flex justify-between">
                  <span>{spot.title}</span>
                  <span className="text-muted-foreground">${spot.hourly_rate}/hr</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Info Banner */}
        <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Bulk editing mode</p>
              <p className="text-blue-700 dark:text-blue-300">
                Changes made here will apply to all {spots.length} selected spot{spots.length > 1 ? 's' : ''}. 
                Weekly schedules must be managed individually per spot.
              </p>
            </div>
          </div>
        </Card>

        {/* Date Override Manager */}
        <DateOverrideManager
          initialOverrides={dateOverrides}
          onChange={setDateOverrides}
          baseRate={averageRate}
        />
      </div>
    </div>
  );
};

export default BulkAvailabilityEditor;
