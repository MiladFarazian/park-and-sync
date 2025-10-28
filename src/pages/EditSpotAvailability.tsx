import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AvailabilityManager, AvailabilityRule } from '@/components/availability/AvailabilityManager';
import { DateOverrideManager, DateOverride } from '@/components/availability/DateOverrideManager';

const EditSpotAvailability = () => {
  const navigate = useNavigate();
  const { spotId } = useParams<{ spotId: string }>();
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([]);
  const [dateOverrides, setDateOverrides] = useState<DateOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [spotTitle, setSpotTitle] = useState('');
  const [activeTab, setActiveTab] = useState('weekly');

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

        // Fetch existing date overrides
        const { data: overridesData, error: overridesError } = await supabase
          .from('calendar_overrides')
          .select('*')
          .eq('spot_id', spotId)
          .gte('override_date', new Date().toISOString().split('T')[0]);

        if (overridesError) throw overridesError;

        if (overridesData) {
          setDateOverrides(overridesData.map(override => ({
            id: override.id,
            override_date: override.override_date,
            start_time: override.start_time || undefined,
            end_time: override.end_time || undefined,
            is_available: override.is_available,
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

      // Save weekly rules
      const { error: deleteRulesError } = await supabase
        .from('availability_rules')
        .delete()
        .eq('spot_id', spotId);

      if (deleteRulesError) throw deleteRulesError;

      // Only insert available rules
      const availableRules = availabilityRules.filter(r => r.is_available);
      if (availableRules.length > 0) {
        const rulesWithSpotId = availableRules.map(rule => ({
          spot_id: spotId,
          day_of_week: rule.day_of_week,
          start_time: rule.start_time,
          end_time: rule.end_time,
          is_available: rule.is_available,
        }));

        const { error: insertRulesError } = await supabase
          .from('availability_rules')
          .insert(rulesWithSpotId);

        if (insertRulesError) throw insertRulesError;
      }

      // Save date overrides
      const { error: deleteOverridesError } = await supabase
        .from('calendar_overrides')
        .delete()
        .eq('spot_id', spotId)
        .gte('override_date', new Date().toISOString().split('T')[0]);

      if (deleteOverridesError) throw deleteOverridesError;

      if (dateOverrides.length > 0) {
        const overridesWithSpotId = dateOverrides.map(override => ({
          spot_id: spotId,
          override_date: override.override_date,
          start_time: override.start_time || null,
          end_time: override.end_time || null,
          is_available: override.is_available,
          reason: null,
        }));

        const { error: insertOverridesError } = await supabase
          .from('calendar_overrides')
          .insert(overridesWithSpotId);

        if (insertOverridesError) throw insertOverridesError;
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
            <h1 className="text-2xl font-bold">Manage Schedule</h1>
            <p className="text-sm text-muted-foreground">{spotTitle}</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="weekly" className="gap-2">
                  <Clock className="h-4 w-4" />
                  Weekly Schedule
                </TabsTrigger>
                <TabsTrigger value="dates" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Date Override
                </TabsTrigger>
              </TabsList>

              <TabsContent value="weekly" className="space-y-4">
                <div className="mb-4">
                  <h3 className="font-semibold mb-1">Recurring Weekly Schedule</h3>
                  <p className="text-sm text-muted-foreground">
                    Set your availability windows for each day. Drag sliders to adjust hours.
                  </p>
                </div>
                <AvailabilityManager
                  initialRules={availabilityRules}
                  onChange={setAvailabilityRules}
                />
              </TabsContent>

              <TabsContent value="dates" className="space-y-4">
                <div className="mb-4">
                  <h3 className="font-semibold mb-1">Date Override</h3>
                  <p className="text-sm text-muted-foreground">
                    Override your weekly schedule for specific dates
                  </p>
                </div>
                <DateOverrideManager
                  initialOverrides={dateOverrides}
                  onChange={setDateOverrides}
                />
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 mt-6 pt-6 border-t">
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
