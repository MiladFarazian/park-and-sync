import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, Shield, Clock, Zap, Car, Lightbulb, Camera, MapPin, DollarSign, Star, ChevronLeft, ChevronRight, X, Loader2, CreditCard, ExternalLink, BoltIcon, Accessibility } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { WeeklyScheduleGrid, AvailabilityRule } from '@/components/availability/WeeklyScheduleGrid';
import { compressImage } from '@/lib/compressImage';
import { EVChargerTypeSelector } from '@/components/ev/EVChargerTypeSelector';
import { evChargerTypes } from '@/lib/evChargerTypes';
import { useAuth } from '@/contexts/AuthContext';
import VehicleSizeSelector from '@/components/spot/VehicleSizeSelector';
import { vehicleSizes as vehicleSizeOptions } from '@/lib/vehicleSizes';

const spotCategories = [
  'Residential Driveway',
  'Apartment / Condo Lot',
  'Commercial Lot',
  'Garage',
  'Street Parking',
  'Event / Venue Lot',
] as const;

const formSchema = z.object({
  category: z.enum(spotCategories, {
    required_error: 'Please select a category',
  }),
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
  { id: 'ada', label: 'ADA Accessible', icon: Accessibility },
];

const ListSpot = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [instantBook, setInstantBook] = useState(true); // Default to instant book
  const [photos, setPhotos] = useState<File[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState<number>(0);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availabilityRules, setAvailabilityRules] = useState<any[]>([]);
  
  // EV Charging state
  const [evChargingInstructions, setEvChargingInstructions] = useState('');
  const [evChargingPremium, setEvChargingPremium] = useState('0');
  const [evChargerType, setEvChargerType] = useState<string | null>(null);
  
  // Vehicle Size state
  const [selectedVehicleSizes, setSelectedVehicleSizes] = useState<string[]>([]);
  const [vehicleSizeError, setVehicleSizeError] = useState<string>('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [addressCoordinates, setAddressCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [addressValidationError, setAddressValidationError] = useState<string>('');
  const [addressConfirmedFromSuggestion, setAddressConfirmedFromSuggestion] = useState(false);
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  
  // Stripe Connect state
  const [isCheckingStripe, setIsCheckingStripe] = useState(true);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  // Check Stripe Connect status on mount
  useEffect(() => {
    const checkStripeStatus = async () => {
      if (!user) {
        setIsCheckingStripe(false);
        return;
      }
      
      try {
        const { data, error } = await supabase.functions.invoke('check-stripe-connect-status');
        if (error) throw error;
        
        setStripeConnected(data?.connected && data?.charges_enabled);
      } catch (error) {
        console.error('Error checking Stripe status:', error);
        setStripeConnected(false);
      } finally {
        setIsCheckingStripe(false);
      }
    };
    
    checkStripeStatus();
  }, [user]);

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
      category: undefined,
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
    
    // Validate EV charging premium if EV is enabled
    const hasEvCharging = selectedAmenities.includes('ev');
    if (hasEvCharging && (!evChargingPremium || parseFloat(evChargingPremium) <= 0)) {
      toast.error('EV charging premium must be greater than $0 when EV charging is enabled');
      return;
    }
    
    try {
      setIsSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please log in to list a spot');
        return;
      }

      // Fetch profile for email notification
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, first_name')
        .eq('user_id', user.id)
        .single();

      // Check Stripe status before final submission
      if (!stripeConnected) {
        setIsSubmitting(false);
        return; // The UI will show the Stripe setup screen
      }

      // Validate and geocode the address to get coordinates
      const coordinates = await validateAddressBeforeSubmit(data.address);
      
      if (!coordinates) {
        toast.error(addressValidationError || 'Could not validate address. Please enter a valid address or select from suggestions.');
        return;
      }

      // Create the spot with proper coordinates
      const hasEvCharging = selectedAmenities.includes('ev');
      const sizeConstraintsValue = selectedVehicleSizes.length > 0 
        ? selectedVehicleSizes 
        : ['compact', 'midsize', 'suv', 'truck'];
      
      const { data: spotData, error: spotError } = await supabase
        .from('spots')
        .insert({
          host_id: user.id,
          title: data.category,
          category: data.category,
          address: data.address,
          hourly_rate: parseFloat(data.hourlyRate),
          description: data.description,
          access_notes: data.parkingInstructions,
          latitude: coordinates.lat,
          longitude: coordinates.lng,
          location: `POINT(${coordinates.lng} ${coordinates.lat})`,
          status: 'active',
          instant_book: instantBook,
          is_covered: selectedAmenities.includes('covered'),
          is_secure: selectedAmenities.includes('security'),
          has_ev_charging: hasEvCharging,
          is_ada_accessible: selectedAmenities.includes('ada'),
          size_constraints: sizeConstraintsValue as any,
          ev_charging_instructions: hasEvCharging ? evChargingInstructions : null,
          ev_charging_premium_per_hour: hasEvCharging ? parseFloat(evChargingPremium) || 0 : 0,
          ev_charger_type: hasEvCharging ? evChargerType : null,
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
      
      // Send listing confirmation email (non-blocking)
      if (spotData && profile?.email) {
        supabase.functions.invoke('send-listing-confirmation', {
          body: {
            hostEmail: profile.email,
            hostName: profile.first_name || '',
            spotCategory: data.category,
            spotAddress: data.address,
            hourlyRate: parseFloat(data.hourlyRate),
            spotId: spotData.id,
          }
        }).catch((err) => console.error('Failed to send listing confirmation email:', err));
      }
      
      toast.success('Your parking spot is now live!');
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
      return formData.category && 
             formData.address && 
             formData.hourlyRate && 
             !!addressCoordinates &&
             addressConfirmedFromSuggestion &&
             !errors.category && 
             !errors.address && 
             !errors.hourlyRate &&
             !addressValidationError &&
             !isValidatingAddress;
    }
    if (currentStep === 2) {
      return formData.description && formData.description.length >= 20 && 
             formData.parkingInstructions && formData.parkingInstructions.length >= 10;
    }
    if (currentStep === 3) {
      // Require at least one vehicle size
      if (selectedVehicleSizes.length === 0) {
        return false;
      }
      // If EV charging is selected, require charger type and premium
      if (selectedAmenities.includes('ev')) {
        return evChargerType && evChargingPremium && parseFloat(evChargingPremium) > 0;
      }
      return true;
    }
    if (currentStep === 5) {
      // Require at least one photo
      return photos.length > 0;
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

  const handleStripeConnect = async () => {
    setIsConnectingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-connect-link');
      if (error) throw error;

      const url: string | undefined = data?.url;
      if (!url) {
        throw new Error('No Stripe onboarding URL returned');
      }

      // Import dynamically to avoid circular dependencies
      const { navigateToStripe, isStandaloneMode } = await import('@/lib/stripeSetupFlow');
      
      // Navigate to Stripe with proper PWA handling
      navigateToStripe(url, {
        returnRoute: '/list-spot',
        context: 'list_spot',
      });

      // Only show toast if not in standalone mode (they'll be redirected)
      if (!isStandaloneMode()) {
        toast.info('Complete Stripe setup in the new window, then return here and tap "I\'ve completed Stripe setup".');
      }
    } catch (error) {
      console.error('Error creating Stripe connect link:', error);
      toast.error('Failed to start Stripe setup. Please try again.');
    } finally {
      setIsConnectingStripe(false);
    }
  };

  // Helper to refresh Stripe status
  const refreshStripeStatus = async () => {
    setIsCheckingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-stripe-connect-status');
      if (error) throw error;
      setStripeConnected(data?.connected && data?.charges_enabled);
    } catch (error) {
      console.error('Error checking Stripe status:', error);
    } finally {
      setIsCheckingStripe(false);
    }
  };

  // Show Stripe Connect requirement on final step (step 6) if not set up
  const showStripeSetup = currentStep === 6 && !stripeConnected && !isCheckingStripe;

  // Swipe navigation for multi-step form
  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: () => {}, // No action on swipe left
    onSwipeRight: () => {
      if (currentStep === 1) {
        navigate('/dashboard');
      } else {
        setCurrentStep(currentStep - 1);
      }
    },
    threshold: 50,
  });

  return (
    <div 
      className="bg-background min-h-screen"
      onTouchStart={swipeHandlers.onTouchStart}
      onTouchEnd={swipeHandlers.onTouchEnd}
    >
      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Header - Hidden on Step 4 for fullscreen calendar */}
        {currentStep !== 4 && (
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
        )}

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
                    <Label htmlFor="category">Spot Type</Label>
                    <select
                      id="category"
                      {...register('category')}
                      className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select a category...</option>
                      {spotCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    {errors.category && (
                      <p className="text-sm text-destructive mt-1">{errors.category.message}</p>
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

          {/* Step 3: Amenities & Vehicle Size */}
          {currentStep === 3 && (
            <Card>
              <CardContent className="p-4 sm:p-6 space-y-6">
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
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggleAmenity(amenity.id)}
                        className={`touch-scroll-safe p-4 rounded-lg border-2 transition-colors text-center ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background'
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

                {/* EV Charging Configuration (only shown if EV amenity is selected) */}
                {selectedAmenities.includes('ev') && (
                  <Card className="p-4 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <h3 className="font-semibold text-green-800 dark:text-green-300">EV Charging Settings</h3>
                      </div>
                      
                      <EVChargerTypeSelector
                        value={evChargerType}
                        onChange={setEvChargerType}
                      />
                      
                      <div>
                        <Label htmlFor="evPremium">EV Charging Premium ($/hour) <span className="text-destructive">*</span></Label>
                        <div className="relative mt-1.5">
                          <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="evPremium"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="2.00"
                            value={evChargingPremium}
                            onChange={(e) => setEvChargingPremium(e.target.value)}
                            className={`pl-10 ${(!evChargingPremium || parseFloat(evChargingPremium) <= 0) ? 'border-destructive' : ''}`}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Required: Additional charge per hour when driver uses EV charging (must be &gt; $0)
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="evInstructions">Charging Instructions</Label>
                        <Textarea
                          id="evInstructions"
                          placeholder="e.g., Use outlet on left wall, Level 2 charger requires app, Max 2 hours charging..."
                          rows={3}
                          value={evChargingInstructions}
                          onChange={(e) => setEvChargingInstructions(e.target.value)}
                          className="mt-1.5 resize-none"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          These instructions will be shown to drivers who opt-in to EV charging
                        </p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Instant Book Toggle */}
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900">
                        <BoltIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <Label htmlFor="instant-book" className="text-base font-medium cursor-pointer">
                          Instant Book
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Allow drivers to book without your approval
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="instant-book"
                      checked={instantBook}
                      onCheckedChange={setInstantBook}
                    />
                  </div>
                </div>

                {/* Vehicle Size Section - Required */}
                <div className="border-t pt-6">
                  <h2 className="text-xl font-semibold mb-2">
                    Vehicle Sizes <span className="text-destructive">*</span>
                  </h2>
                  <VehicleSizeSelector
                    selectedSizes={selectedVehicleSizes}
                    onSizesChange={(sizes) => {
                      setSelectedVehicleSizes(sizes);
                      setVehicleSizeError(sizes.length === 0 ? 'Please select at least one vehicle size' : '');
                    }}
                    error={vehicleSizeError}
                  />
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
                    onClick={() => {
                      if (selectedVehicleSizes.length === 0) {
                        setVehicleSizeError('Please select at least one vehicle size');
                        toast.error('Please select at least one vehicle size that can fit in your spot');
                        return;
                      }
                      setCurrentStep(4);
                    }}
                    disabled={!canProceed()}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Availability - Fullscreen layout */}
          {currentStep === 4 && (
            <Card className="flex flex-col h-[calc(100vh-2rem)] overflow-hidden">
              <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
                {/* Compact header - back arrow + title + step on same line */}
                <div className="flex items-center justify-between shrink-0 mb-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setCurrentStep(3)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="text-lg font-semibold">Weekly Schedule</h2>
                  </div>
                  <span className="text-xs text-muted-foreground">Step 4 of 6</span>
                </div>

                <p className="text-xs text-muted-foreground shrink-0 mb-2">
                  Set your recurring availability. <span className="font-medium text-primary">Leave blank</span> to manage on a per-date basis after listing.
                </p>

                <div className="flex-1 min-h-0 overflow-hidden">
                  <WeeklyScheduleGrid
                    initialRules={availabilityRules}
                    onChange={setAvailabilityRules}
                    baseRate={Number(formData.hourlyRate) || 0}
                  />
                </div>

                <div className="flex gap-3 pt-3 shrink-0">
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
                  <p className="text-sm text-destructive mt-1">
                    * At least one photo is required
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
                    disabled={!canProceed()}
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
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground shrink-0">Type:</span>
                        <span className="font-medium text-right">{formData.category}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground shrink-0">Address:</span>
                        <span className="font-medium text-right">{formData.address}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground shrink-0">Hourly Rate:</span>
                        <span className="font-medium text-right">${formData.hourlyRate}/hr</span>
                      </div>
                    </div>
                  </div>

                  {selectedAmenities.includes('ev') && (
                    <div className="p-4 rounded-lg bg-muted/50">
                      <h3 className="font-semibold text-sm mb-3">EV Charging</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground shrink-0">Charger Type:</span>
                          <span className="font-medium text-right">
                            {evChargerTypes.find(t => t.id === evChargerType)?.name || 'Not specified'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground shrink-0">Charging Premium:</span>
                          <span className="font-medium text-right">${evChargingPremium}/hr</span>
                        </div>
                        {evChargingInstructions && (
                          <div className="pt-2 border-t border-border">
                            <span className="text-muted-foreground">Charging Instructions:</span>
                            <p className="font-medium mt-1">{evChargingInstructions}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="font-semibold text-sm mb-3">Description</h3>
                    <p className="text-sm text-muted-foreground">{formData.description}</p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="font-semibold text-sm mb-3">Parking Instructions</h3>
                    <p className="text-sm text-muted-foreground">{formData.parkingInstructions}</p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50">
                    <h3 className="font-semibold text-sm mb-3">Vehicle Sizes Accommodated</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedVehicleSizes.map((size) => {
                        const sizeInfo = vehicleSizeOptions.find((s) => s.value === size);
                        return (
                          <span
                            key={size}
                            className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full"
                          >
                            {sizeInfo?.shortLabel || size}
                          </span>
                        );
                      })}
                      {selectedVehicleSizes.length === 0 && (
                        <span className="text-sm text-muted-foreground">No sizes selected</span>
                      )}
                    </div>
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

                {/* Show Stripe Setup or Submit Button */}
                {showStripeSetup ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg border border-amber-500/50 bg-amber-500/10">
                      <div className="flex items-start gap-3">
                        <CreditCard className="h-5 w-5 text-amber-500 mt-0.5" />
                        <div className="space-y-2">
                          <h3 className="font-semibold text-sm">Payment Setup Required</h3>
                          <p className="text-sm text-muted-foreground">
                            Before you can submit your listing, you need to connect your Stripe account to receive payments from drivers.
                          </p>
                          <div className="text-xs text-muted-foreground space-y-1 mt-2">
                            <p>• Bank account details for payouts</p>
                            <p>• Government-issued ID for verification</p>
                            <p>• Takes about 5 minutes to complete</p>
                          </div>
                        </div>
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
                      <Button 
                        type="button"
                        onClick={handleStripeConnect} 
                        disabled={isConnectingStripe}
                        className="flex-1"
                      >
                        {isConnectingStripe ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Set Up Stripe
                          </>
                        )}
                      </Button>
                    </div>
                    
                    <Button 
                      type="button" 
                      variant="ghost" 
                      className="w-full text-sm"
                      onClick={refreshStripeStatus}
                      disabled={isCheckingStripe}
                    >
                      {isCheckingStripe ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        'I\'ve completed Stripe setup'
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setCurrentStep(5)}
                    >
                      Back
                    </Button>
                    <Button type="submit" className="flex-1" disabled={isSubmitting || isCheckingStripe}>
                      {isCheckingStripe ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Checking...
                        </>
                      ) : isSubmitting ? (
                        'Submitting...'
                      ) : (
                        'Submit Listing'
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </form>
      </div>
    </div>
  );
};

export default ListSpot;
