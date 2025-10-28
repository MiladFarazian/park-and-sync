import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AvailabilityManager, AvailabilityRule } from '@/components/availability/AvailabilityManager';

const EditSpotAvailability = () => {
  const navigate = useNavigate();
  const { spotId } = useParams<{ spotId: string }>();
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [spotTitle, setSpotTitle] = useState('');

  useEffect(() => {
    const fetchAvailability = async () => {
      if (!spotId) return;

      try {
        // Fetch spot details
        const { data: spotData, error: spotError } = await supabase
          .from('spots')
          .select('title, host_id')
          .eq('id', spotId)
          .single();

        if (spotError) throw spotError;

        // Verify ownership
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || spotData.host_id !== user.id) {
          toast.error('You do not have permission to edit this spot');
          navigate('/dashboard');
          return;
        }

        setSpotTitle(spotData.title);

        // Fetch existing availability rules
        const { data: rulesData, error: rulesError } = await supabase
          .from('availability_rules')
          .select('*')
          .eq('spot_id', spotId);

        if (rulesError) throw rulesError;

        if (rulesData) {
          setAvailabilityRules(rulesData.map(rule => ({
            day_of_week: rule.day_of_week,
            start_time: rule.start_time,
            end_time: rule.end_time,
            is_available: rule.is_available ?? true,
          })));
        }
      } catch (error) {
        console.error('Error fetching availability:', error);
        toast.error('Failed to load availability');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAvailability();
  }, [spotId, navigate]);

  const handleSave = async () => {
    if (!spotId || isSaving) return;

    try {
      setIsSaving(true);

      // Delete existing rules
      const { error: deleteError } = await supabase
        .from('availability_rules')
        .delete()
        .eq('spot_id', spotId);

      if (deleteError) throw deleteError;

      // Insert new rules
      if (availabilityRules.length > 0) {
        const rulesWithSpotId = availabilityRules.map(rule => ({
          spot_id: spotId,
          day_of_week: rule.day_of_week,
          start_time: rule.start_time,
          end_time: rule.end_time,
          is_available: rule.is_available,
        }));

        const { error: insertError } = await supabase
          .from('availability_rules')
          .insert(rulesWithSpotId);

        if (insertError) throw insertError;
      }

      toast.success('Availability updated successfully');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving availability:', error);
      toast.error('Failed to save availability');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="p-4 space-y-6 max-w-2xl mx-auto">
          <p className="text-center text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Edit Availability</h1>
            <p className="text-sm text-muted-foreground">{spotTitle}</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Availability Schedule</h2>
              <p className="text-sm text-muted-foreground">
                Set when your parking spot is available for booking
              </p>
            </div>

            <AvailabilityManager
              initialRules={availabilityRules}
              onChange={setAvailabilityRules}
            />

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => navigate('/dashboard')}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EditSpotAvailability;
