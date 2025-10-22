import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  amenities: z.array(z.string()),
  photos: z.array(z.any()).optional(),
});

type FormData = z.infer<typeof formSchema>;

const amenitiesList = [
  { id: 'covered', label: 'Covered', icon: Shield },
  { id: 'security', label: 'Security Camera', icon: Camera },
  { id: '24-7', label: '24/7 Access', icon: Clock },
  { id: 'ev', label: 'EV Charging', icon: Zap },
  { id: 'easy', label: 'Easy Access', icon: Car },
  { id: 'lit', label: 'Well Lit', icon: Lightbulb },
];

const ListSpot = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      address: '',
      hourlyRate: '',
      description: '',
      amenities: [],
    },
  });

  const formData = watch();

  const toggleAmenity = (amenityId: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenityId)
        ? prev.filter((id) => id !== amenityId)
        : [...prev, amenityId]
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos([...photos, ...Array.from(e.target.files)]);
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please log in to list a spot');
        return;
      }

      // Create the spot
      const { data: spotData, error: spotError } = await supabase
        .from('spots')
        .insert({
          host_id: user.id,
          title: data.title,
          address: data.address,
          hourly_rate: parseFloat(data.hourlyRate),
          description: data.description,
          latitude: 34.0522, // Default LA coordinates - would use geocoding in production
          longitude: -118.2437,
          location: `POINT(-118.2437 34.0522)`, // Default LA - would use geocoding
          status: 'pending_approval',
          is_covered: selectedAmenities.includes('covered'),
          is_secure: selectedAmenities.includes('security'),
          has_ev_charging: selectedAmenities.includes('ev'),
          size_constraints: ['compact', 'midsize'] // Default values
        })
        .select()
        .single();

      if (spotError) throw spotError;

      // TODO: Handle photo uploads to storage
      // For now, just show success
      
      toast.success('Parking spot submitted for review!');
      navigate('/add-spot');
    } catch (error) {
      console.error('Error submitting spot:', error);
      toast.error('Failed to submit listing');
    }
  };

  const canProceed = () => {
    if (currentStep === 1) {
      return formData.title && formData.address && formData.hourlyRate && !errors.title && !errors.address && !errors.hourlyRate;
    }
    if (currentStep === 2) {
      return formData.description && formData.description.length >= 20;
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (currentStep === 1) {
                navigate('/add-spot');
              } else {
                setCurrentStep(currentStep - 1);
              }
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">List Your Spot</h1>
            <p className="text-sm text-muted-foreground">
              Step {currentStep} of 5
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <Card>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Basic Information</h2>
                  <p className="text-sm text-muted-foreground">
                    Tell us about your parking spot
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
                      <p className="text-sm text-destructive mt-1">{errors.title.message}</p>
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
                      <p className="text-sm text-destructive mt-1">{errors.address.message}</p>
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
                      <p className="text-sm text-destructive mt-1">{errors.hourlyRate.message}</p>
                    )}
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full"
                  onClick={() => setCurrentStep(2)}
                  disabled={!canProceed()}
                >
                  Next
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Description */}
          {currentStep === 2 && (
            <Card>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Description</h2>
                  <p className="text-sm text-muted-foreground">
                    Describe your parking spot to attract renters
                  </p>
                </div>

                <div className="space-y-4">
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
                      <p className="text-sm text-destructive mt-1">{errors.description.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.description?.length || 0} / 20 minimum characters
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCurrentStep(1)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => setCurrentStep(3)}
                    disabled={!canProceed()}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Amenities */}
          {currentStep === 3 && (
            <Card>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Amenities</h2>
                  <p className="text-sm text-muted-foreground">
                    Select all amenities that apply to your spot
                  </p>
                </div>

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

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCurrentStep(2)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => setCurrentStep(4)}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Photos */}
          {currentStep === 4 && (
            <Card>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Photos</h2>
                  <p className="text-sm text-muted-foreground">
                    Add photos to showcase your parking spot
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="photo-upload"
                    className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <Camera className="h-12 w-12 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium">Add Photo</p>
                    <p className="text-xs text-muted-foreground mt-1">Click to upload images</p>
                  </label>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </div>

                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                        <img
                          src={URL.createObjectURL(photo)}
                          alt={`Upload ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCurrentStep(3)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => setCurrentStep(5)}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Review */}
          {currentStep === 5 && (
            <Card>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Review Your Listing</h2>
                  <p className="text-sm text-muted-foreground">
                    Review all details before submitting
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="font-semibold text-sm mb-3">Basic Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Title:</span>
                        <span className="font-medium">{formData.title}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Address:</span>
                        <span className="font-medium">{formData.address}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Hourly Rate:</span>
                        <span className="font-medium">${formData.hourlyRate}/hr</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="font-semibold text-sm mb-3">Description</h3>
                    <p className="text-sm text-muted-foreground">{formData.description}</p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="font-semibold text-sm mb-3">Amenities</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedAmenities.map((id) => {
                        const amenity = amenitiesList.find((a) => a.id === id);
                        return (
                          <span
                            key={id}
                            className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full"
                          >
                            {amenity?.label}
                          </span>
                        );
                      })}
                      {selectedAmenities.length === 0 && (
                        <span className="text-sm text-muted-foreground">No amenities selected</span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="font-semibold text-sm mb-3">Photos</h3>
                    {photos.length > 0 ? (
                      <div className="grid grid-cols-4 gap-2">
                        {photos.map((photo, index) => (
                          <div key={index} className="aspect-square rounded overflow-hidden bg-muted">
                            <img
                              src={URL.createObjectURL(photo)}
                              alt={`Upload ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No photos uploaded</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCurrentStep(4)}
                  >
                    Back
                  </Button>
                  <Button type="submit" className="flex-1">
                    Submit Listing
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </form>
      </div>
    </div>
  );
};

export default ListSpot;
