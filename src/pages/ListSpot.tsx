import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Shield, Clock, Zap, Car, Lightbulb, Camera, MapPin, DollarSign, Star, ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AvailabilityManager, AvailabilityRule } from '@/components/availability/AvailabilityManager';
import { compressImage } from '@/lib/compressImage';

const formSchema = z.object({
  title: z.string()
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(100, 'Title must be less than 100 characters'),
  address: z.string()
    .trim()
    .min(5, 'Address is required')
    .max(500, 'Address must be less than 500 characters'),
  hourlyRate: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: 'Hourly rate must be a positive number',
  }),
  description: z.string()
    .trim()
    .min(20, 'Description must be at least 20 characters')
    .max(2000, 'Description must be less than 2000 characters'),
  parkingInstructions: z.string()
    .trim()
    .min(10, 'Parking instructions must be at least 10 characters')
    .max(1000, 'Instructions must be less than 1000 characters'),
  amenities: z.array(z.string()),
  photos: z.array(z.any()).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AddressSuggestion {
  name: string;
  place_formatted: string;
  full_address: string;
  mapbox_id: string;
}

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
  const [primaryIndex, setPrimaryIndex] = useState<number>(0);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availabilityRules, setAvailabilityRules] = useState<any[]>([]);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [addressCoordinates, setAddressCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [addressValidationError, setAddressValidationError] = useState<string>('');
  const [addressConfirmedFromSuggestion, setAddressConfirmedFromSuggestion] = useState(false);
  const sessionTokenRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (error) throw error;
        if (data?.token) {
          setMapboxToken(data.token);
        }
      } catch (error) {
        console.error('Error fetching Mapbox token:', error);
      }
    };
    fetchMapboxToken();
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      address: '',
      hourlyRate: '',
      description: '',
      parkingInstructions: '',
      amenities: [],
    },
  });

  const formData = watch();
  const addressValue = watch('address');

  const toggleAmenity = (amenityId: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenityId)
        ? prev.filter((id) => id !== amenityId)
        : [...prev, amenityId]
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setPhotos([...photos, ...newFiles]);
      // Set first photo as primary if no photos exist yet
      if (photos.length === 0 && newFiles.length > 0) {
        setPrimaryIndex(0);
      }
    }
  };

  const setPrimary = (index: number) => {
    setPrimaryIndex(index);
  };

  const movePhoto = (index: number, direction: 'left' | 'right') => {
    const newPhotos = [...photos];
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= photos.length) return;
    
    [newPhotos[index], newPhotos[newIndex]] = [newPhotos[newIndex], newPhotos[index]];
    
    // Update primary index if needed
    if (primaryIndex === index) {
      setPrimaryIndex(newIndex);
    } else if (primaryIndex === newIndex) {
      setPrimaryIndex(index);
    }
    
    setPhotos(newPhotos);
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    
    // Adjust primary index
    if (primaryIndex === index) {
      setPrimaryIndex(0);
    } else if (primaryIndex > index) {
      setPrimaryIndex(primaryIndex - 1);
    }
  };

  const searchAddresses = async (query: string) => {
    if (!mapboxToken || query.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    try {
      setLoadingSuggestions(true);
      
      // Southern California center (Downtown LA)
      const socal_center = { lat: 34.0522, lng: -118.2437 };
      
      const url = `https://api.mapbox.com/search/searchbox/v1/suggest?` +
        `q=${encodeURIComponent(query)}` +
        `&access_token=${mapboxToken}` +
        `&session_token=${sessionTokenRef.current}` +
        `&limit=8` +
        `&types=poi,address,place` +
        `&proximity=${socal_center.lng},${socal_center.lat}` +
        `&country=US` +
        `&bbox=-119.5,32.5,-117.0,34.8`;
      
      console.log('[ListSpot Search Box API] Calling suggest');
      
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('Address search failed');
      
      const data = await response.json();
      
      console.log('[ListSpot Search Box API] Response:', data);
      
      if (data.suggestions && data.suggestions.length > 0) {
        setAddressSuggestions(data.suggestions);
      } else {
        setAddressSuggestions([]);
      }
    } catch (error) {
      console.error('[ListSpot Search Box API] Error:', error);
      setAddressSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAddressChange = (value: string) => {
    setValue('address', value);
    setAddressCoordinates(null);
    setAddressValidationError('');
    setAddressConfirmedFromSuggestion(false); // Reset confirmation on manual edit
    
    if (value.length >= 3) {
      setShowSuggestions(true);
      searchAddresses(value);
    } else {
      setShowSuggestions(false);
      setAddressSuggestions([]);
    }
  };

  const handleSuggestionSelect = async (suggestion: AddressSuggestion) => {
    if (!mapboxToken || !suggestion.mapbox_id) return;
    
    try {
      const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(suggestion.mapbox_id)}?access_token=${mapboxToken}&session_token=${sessionTokenRef.current}`;
      
      console.log('[ListSpot Search Box API] Retrieving full details');
      
      const response = await fetch(retrieveUrl);
      const data = await response.json();
      
      console.log('[ListSpot Search Box API] Retrieve response:', data);
      
      if (data?.features?.[0]?.geometry?.coordinates) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        const fullAddress = suggestion.full_address || suggestion.name || suggestion.place_formatted;
        
        setValue('address', fullAddress);
        setAddressCoordinates({ lat, lng });
        setAddressValidationError(''); // Clear any validation errors
        setAddressConfirmedFromSuggestion(true); // Mark as confirmed from suggestion
        setShowSuggestions(false);
        setAddressSuggestions([]);
        
        console.log('[ListSpot] Selected coordinates:', { lat, lng });
        
        // Regenerate session token for next search session
        sessionTokenRef.current = crypto.randomUUID();
        console.log('[ListSpot Search Box API] Session token regenerated');
      }
    } catch (error) {
      console.error('[ListSpot Search Box API] Retrieve error:', error);
      toast.error('Failed to select address. Please try again.');
    }
  };

  const validateAddressBeforeSubmit = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      setIsValidatingAddress(true);
      
      // Only accept addresses that were explicitly selected from suggestions
      if (addressCoordinates && addressConfirmedFromSuggestion) {
        console.log('[ListSpot] Address confirmed from suggestion:', addressCoordinates);
        setAddressValidationError('');
        return addressCoordinates;
      }
      
      // Reject any free-typed addresses that weren't selected from dropdown
      setAddressValidationError(
        'Please select a valid address from the suggestions dropdown. Manual entries are not allowed.'
      );
      return null;
    } catch (error) {
      console.error('[ListSpot] Error validating address:', error);
      setAddressValidationError('Unable to validate address. Please select from the suggested addresses below.');
      return null;
    } finally {
      setIsValidatingAddress(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    if (isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please log in to list a spot');
        return;
      }

      // Validate and geocode the address to get coordinates
      const coordinates = await validateAddressBeforeSubmit(data.address);
      
      if (!coordinates) {
        toast.error(addressValidationError || 'Could not validate address. Please enter a valid address or select from suggestions.');
        return;
      }

      // Create the spot with proper coordinates
      const { data: spotData, error: spotError } = await supabase
        .from('spots')
        .insert({
          host_id: user.id,
          title: data.title,
          address: data.address,
          hourly_rate: parseFloat(data.hourlyRate),
          description: data.description,
          access_notes: data.parkingInstructions,
          latitude: coordinates.lat,
          longitude: coordinates.lng,
          location: `POINT(${coordinates.lng} ${coordinates.lat})`,
          status: 'pending_approval',
          is_covered: selectedAmenities.includes('covered'),
          is_secure: selectedAmenities.includes('security'),
          has_ev_charging: selectedAmenities.includes('ev'),
          size_constraints: ['compact', 'midsize'] // Default values
        })
        .select()
        .single();

      if (spotError) throw spotError;

      // Insert availability rules
      if (availabilityRules.length > 0 && spotData) {
        const rulesWithSpotId = availabilityRules.map(rule => ({
          spot_id: spotData.id,
          day_of_week: rule.day_of_week,
          start_time: rule.start_time,
          end_time: rule.end_time,
          is_available: rule.is_available,
        }));

        const { error: rulesError } = await supabase
          .from('availability_rules')
          .insert(rulesWithSpotId);

        if (rulesError) {
          console.error('Error inserting availability rules:', rulesError);
          toast.error('Spot created but availability rules failed to save');
        }
      }

      // Upload photos to storage and database
      if (photos.length > 0 && spotData) {
        toast.info('Uploading photos...');
        
        let uploadFailed = false;
        for (let i = 0; i < photos.length; i++) {
          const file = photos[i];
          
          try {
            const compressedFile = await compressImage(file);
            const fileExt = compressedFile.name.split('.').pop();
            const filePath = `${spotData.id}/${crypto.randomUUID()}.${fileExt}`;

            // Upload to storage
            const { error: uploadError } = await supabase.storage
              .from('spot-photos')
              .upload(filePath, compressedFile);

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
              .from('spot-photos')
              .getPublicUrl(filePath);

            // Save to database
            const { error: dbError } = await supabase
              .from('spot_photos')
              .insert({
                spot_id: spotData.id,
                url: publicUrl,
                is_primary: i === primaryIndex,
                sort_order: i,
              });

            if (dbError) throw dbError;
          } catch (photoError) {
            console.error('Error uploading photo:', photoError);
            uploadFailed = true;
          }
        }

        if (uploadFailed) {
          toast.warning('Spot created but some photos failed to upload');
        }
      }
      
      toast.success('Parking spot submitted for review!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error submitting spot:', error);
      toast.error('Failed to submit listing');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    if (currentStep === 1) {
      return formData.title && 
             formData.address && 
             formData.hourlyRate && 
             !!addressCoordinates &&
             addressConfirmedFromSuggestion &&
             !errors.title && 
             !errors.address && 
             !errors.hourlyRate &&
             !addressValidationError &&
             !isValidatingAddress;
    }
    if (currentStep === 2) {
      return formData.description && formData.description.length >= 20 && 
             formData.parkingInstructions && formData.parkingInstructions.length >= 10;
    }
    return true;
  };

  const handleStep1Next = async () => {
    const address = formData.address?.trim();
    if (!address) {
      setAddressValidationError('Please enter an address');
      return;
    }

    if (!addressCoordinates || !addressConfirmedFromSuggestion) {
      setAddressValidationError('Please select a valid address from the suggestions dropdown.');
      toast.error('Address Not Confirmed', {
        description: 'Please select an address from the dropdown suggestions',
      });
      return;
    }

    const coords = await validateAddressBeforeSubmit(address);
    if (coords) {
      setCurrentStep(2);
    } else {
      toast.error('Invalid Address', {
        description: addressValidationError || 'Please select a valid address from the suggestions',
      });
    }
  };

  return (
    <div className="bg-background">
      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (currentStep === 1) {
                navigate('/dashboard');
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
              Step {currentStep} of 6
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

                  <div className="relative">
                    <Label htmlFor="address">Address</Label>
                    <div className="relative mt-1.5">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground z-10" />
                      <Input
                        id="address"
                        placeholder="Start typing your address..."
                        value={addressValue || ''}
                        onChange={(e) => handleAddressChange(e.target.value)}
                        onFocus={() => {
                          if (addressValue && addressValue.length >= 3) {
                            if (addressSuggestions.length > 0) {
                              setShowSuggestions(true);
                            } else {
                              searchAddresses(addressValue);
                            }
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => setShowSuggestions(false), 200);
                        }}
                        className="pl-10"
                        autoComplete="off"
                      />
                      {(loadingSuggestions || isValidatingAddress) && (
                        <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground z-10" />
                      )}
                    </div>
                    
                    {showSuggestions && addressSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {addressSuggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleSuggestionSelect(suggestion)}
                            className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0 focus:outline-none focus:bg-muted/50"
                          >
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">{suggestion.name}</div>
                                <div className="text-xs text-muted-foreground">{suggestion.place_formatted}</div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    
                    <p className="text-sm text-muted-foreground mt-2">
                      Start typing and select an address from the dropdown. Manual entries without selecting a suggestion are not allowed.
                    </p>
                    
                    {errors.address && (
                      <p className="text-sm text-destructive mt-1">{errors.address.message}</p>
                    )}
                    {addressValidationError && (
                      <p className="text-sm text-destructive mt-1">{addressValidationError}</p>
                    )}
                    {addressCoordinates && addressConfirmedFromSuggestion && !addressValidationError && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-1">✓ Address confirmed</p>
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
                  onClick={handleStep1Next}
                  disabled={!canProceed() || isValidatingAddress}
                >
                  {isValidatingAddress ? 'Validating Address...' : 'Next'}
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
                      placeholder="Describe your parking spot, nearby landmarks, and any important details..."
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

                  <div>
                    <Label htmlFor="parkingInstructions">Parking Instructions</Label>
                    <Textarea
                      id="parkingInstructions"
                      placeholder="How should renters access your spot? Include gate codes, entry instructions, or any special directions..."
                      rows={5}
                      {...register('parkingInstructions')}
                      className="mt-1.5 resize-none"
                    />
                    {errors.parkingInstructions && (
                      <p className="text-sm text-destructive mt-1">{errors.parkingInstructions.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.parkingInstructions?.length || 0} / 10 minimum characters
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

          {/* Step 4: Availability */}
          {currentStep === 4 && (
            <Card>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Availability</h2>
                  <p className="text-sm text-muted-foreground">
                    Set when your parking spot is available
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

          {/* Step 5: Photos */}
          {currentStep === 5 && (
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
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {photos.length} photo{photos.length > 1 ? 's' : ''} • Will be uploaded on submit
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {photos.map((photo, index) => (
                        <TooltipProvider key={index}>
                          <div className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                            <img
                              src={URL.createObjectURL(photo)}
                              alt={`Upload ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            
                            {/* Order number badge */}
                            <Badge 
                              variant="secondary" 
                              className="absolute top-2 left-2 text-xs font-semibold"
                            >
                              #{index + 1}
                            </Badge>
                            
                            {/* Primary star badge */}
                            {primaryIndex === index && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge 
                                    className="absolute top-2 right-2 bg-primary text-primary-foreground"
                                  >
                                    <Star className="h-3 w-3 fill-current" />
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>Primary Photo</TooltipContent>
                              </Tooltip>
                            )}
                            
                            {/* Controls overlay */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                              <div className="flex gap-2">
                                {primaryIndex !== index && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => setPrimary(index)}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Star className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Set as Primary</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => removePhoto(index)}
                                      className="h-8 w-8 p-0"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Remove</TooltipContent>
                                </Tooltip>
                              </div>
                              
                              <div className="flex gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => movePhoto(index, 'left')}
                                      disabled={index === 0}
                                      className="h-8 w-8 p-0"
                                    >
                                      <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Move Left</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => movePhoto(index, 'right')}
                                      disabled={index === photos.length - 1}
                                      className="h-8 w-8 p-0"
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Move Right</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          </div>
                        </TooltipProvider>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCurrentStep(4)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => setCurrentStep(6)}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 6: Review */}
          {currentStep === 6 && (
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
                    <h3 className="font-semibold text-sm mb-3">Parking Instructions</h3>
                    <p className="text-sm text-muted-foreground">{formData.parkingInstructions}</p>
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

                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="font-semibold text-sm mb-3">Availability</h3>
                    {availabilityRules.length > 0 ? (
                      <div className="space-y-1 text-sm">
                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => {
                          const dayRules = availabilityRules.filter(r => r.day_of_week === index);
                          if (dayRules.length === 0) return null;
                          return (
                            <div key={index} className="flex justify-between">
                              <span className="text-muted-foreground">{day}:</span>
                              <span className="font-medium">
                                {dayRules.map(r => `${r.start_time}-${r.end_time}`).join(', ')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No availability set</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCurrentStep(5)}
                  >
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Submit Listing'}
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
