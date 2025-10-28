import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Shield, Clock, Zap, Car, Lightbulb, Camera, MapPin, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const formSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  address: z.string().min(5, 'Address is required'),
  hourlyRate: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'Hourly rate must be a positive number',
  }),
  description: z.string().min(20, 'Description must be at least 20 characters'),
});

const amenitiesList = [
  { id: 'covered', label: 'Covered', icon: Shield, dbField: 'is_covered' },
  { id: 'security', label: 'Security Camera', icon: Camera, dbField: 'is_secure' },
  { id: 'ev', label: 'EV Charging', icon: Zap, dbField: 'has_ev_charging' },
];

const EditSpot = () => {
  const navigate = useNavigate();
  const { spotId } = useParams<{ spotId: string }>();
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    const fetchSpot = async () => {
      if (!spotId) return;

      try {
        const { data: spotData, error: spotError } = await supabase
          .from('spots')
          .select('*')
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

        // Populate form
        setValue('title', spotData.title);
        setValue('address', spotData.address);
        setValue('hourlyRate', spotData.hourly_rate.toString());
        setValue('description', spotData.description || '');

        // Set amenities
        const amenities = [];
        if (spotData.is_covered) amenities.push('covered');
        if (spotData.is_secure) amenities.push('security');
        if (spotData.has_ev_charging) amenities.push('ev');
        setSelectedAmenities(amenities);
      } catch (error) {
        console.error('Error fetching spot:', error);
        toast.error('Failed to load spot details');
        navigate('/dashboard');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSpot();
  }, [spotId, navigate, setValue]);

  const toggleAmenity = (amenityId: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenityId)
        ? prev.filter((id) => id !== amenityId)
        : [...prev, amenityId]
    );
  };

  const onSubmit = async (data: any) => {
    if (!spotId || isSaving) return;

    try {
      setIsSaving(true);

      const updateData = {
        title: data.title,
        address: data.address,
        hourly_rate: parseFloat(data.hourlyRate),
        description: data.description,
        is_covered: selectedAmenities.includes('covered'),
        is_secure: selectedAmenities.includes('security'),
        has_ev_charging: selectedAmenities.includes('ev'),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('spots')
        .update(updateData)
        .eq('id', spotId);

      if (error) throw error;

      toast.success('Spot updated successfully');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error updating spot:', error);
      toast.error('Failed to update spot');
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
            <h1 className="text-2xl font-bold">Edit Spot</h1>
            <p className="text-sm text-muted-foreground">Update your listing</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">Basic Information</h2>
                <p className="text-sm text-muted-foreground">
                  Update your parking spot details
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Spot Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Downtown Covered Parking"
                    {...register('title')}
                    className="mt-1.5"
                  />
                  {errors.title && (
                    <p className="text-sm text-destructive mt-1">{String(errors.title.message)}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="address">Address</Label>
                  <div className="relative mt-1.5">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="address"
                      placeholder="Enter your address"
                      {...register('address')}
                      className="pl-10"
                    />
                  </div>
                  {errors.address && (
                    <p className="text-sm text-destructive mt-1">{String(errors.address.message)}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="hourlyRate">Hourly Rate</Label>
                  <div className="relative mt-1.5">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="hourlyRate"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...register('hourlyRate')}
                      className="pl-10"
                    />
                  </div>
                  {errors.hourlyRate && (
                    <p className="text-sm text-destructive mt-1">{String(errors.hourlyRate.message)}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="description">Spot Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe your parking spot, access instructions, and any important details..."
                    rows={6}
                    {...register('description')}
                    className="mt-1.5 resize-none"
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive mt-1">{String(errors.description.message)}</p>
                  )}
                </div>

                <div>
                  <Label className="mb-3 block">Amenities</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {amenitiesList.map((amenity) => {
                      const Icon = amenity.icon;
                      const isSelected = selectedAmenities.includes(amenity.id);
                      return (
                        <button
                          key={amenity.id}
                          type="button"
                          onClick={() => toggleAmenity(amenity.id)}
                          className={`p-4 rounded-lg border-2 transition-all text-center ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border bg-background hover:border-primary/50'
                          }`}
                        >
                          <Icon className={`h-6 w-6 mx-auto mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                          <p className={`text-sm font-medium ${isSelected ? 'text-primary' : ''}`}>
                            {amenity.label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

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
                  type="submit"
                  className="flex-1"
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
};

export default EditSpot;
