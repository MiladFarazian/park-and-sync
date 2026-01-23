import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MobileTimePicker } from '@/components/booking/MobileTimePicker';
import { format } from 'date-fns';
import { CalendarIcon, Clock, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Star, MapPin, Loader2, Plus, Activity, Zap, AlertCircle, Footprints, BatteryCharging } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMode } from '@/contexts/ModeContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import Index from './Index';
import LocationSearchInput from '@/components/ui/location-search-input';
import { calculateDriverPrice } from '@/lib/pricing';
import { ActiveBookingBanner } from '@/components/booking/ActiveBookingBanner';
import FixLocationDialog from '@/components/location/FixLocationDialog';
import EmailVerificationBanner from '@/components/auth/EmailVerificationBanner';
import { evChargerTypes } from '@/lib/evChargerTypes';

const Home = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, setMode } = useMode();
  const { user, isEmailVerified } = useAuth();
  const [parkingSpots, setParkingSpots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // currentLocation = driver's actual GPS location (used for "Nearby Spots")
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  // searchLocation = location selected for search (can differ from currentLocation)
  const [searchLocation, setSearchLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationResolved, setLocationResolved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(false);
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000));
  const [mobileStartPickerOpen, setMobileStartPickerOpen] = useState(false);
  const [mobileEndPickerOpen, setMobileEndPickerOpen] = useState(false);
  const [locationErrorCode, setLocationErrorCode] = useState<number | null>(null);
  const [showFixLocationDialog, setShowFixLocationDialog] = useState(false);
  const [needsEvCharging, setNeedsEvCharging] = useState(false);
  const [selectedChargerType, setSelectedChargerType] = useState<string | null>(null);
  const [showChargerTypes, setShowChargerTypes] = useState(false);

  // Prevent duplicate location application + rate-limited spam calls
  const lastAppliedLocationKeyRef = useRef<string | null>(null);
  const lastNearbySearchKeyRef = useRef<string | null>(null);
  const lastNearbySearchAtRef = useRef<number>(0);
  const isFetchingNearbyRef = useRef(false);
  const lastRateLimitToastAtRef = useRef<number>(0);

  // Redirect to host-home if mode is host (prevents mode/content mismatch on app launch)
  // Skip redirect if coming from logo click (mode was just switched to driver)
  useEffect(() => {
    const fromLogoClick = (location.state as { fromLogoClick?: boolean })?.fromLogoClick;
    if (mode === 'host' && !fromLogoClick) {
      navigate('/host-home', { replace: true });
    }
  }, [mode, navigate, location.state]);

  const handleStartTimeChange = (date: Date) => {
    setStartTime(date);
    if (endTime <= date) {
      setEndTime(new Date(date.getTime() + 2 * 60 * 60 * 1000));
    }
  };

  const handleEndTimeChange = (date: Date) => {
    if (date > startTime) {
      setEndTime(date);
    } else {
      toast.error('End time must be after start time');
    }
  };

  useEffect(() => {
    // Skip location detection if we're in host mode (will redirect)
    if (mode === 'host') return;
    // Get user's location
    const cachedRaw = localStorage.getItem('parkzy:lastLocation');
    const cached = cachedRaw
      ? (JSON.parse(cachedRaw) as { lat: number; lng: number; ts?: number })
      : null;

    const applyLocation = (loc: { lat: number; lng: number }) => {
      // De-dupe location updates (quick geolocation + GPS fix can both succeed)
      const key = `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)}`;
      if (lastAppliedLocationKeyRef.current === key) return;
      lastAppliedLocationKeyRef.current = key;

      setCurrentLocation(loc);
      setSearchLocation(loc);
      setSearchQuery('');
      setLocationResolved(true);
      // Don't auto-set isUsingCurrentLocation - keep search bar blank
    };

    const useDefaultLocation = () => {
      setCurrentLocation({ lat: 34.0224, lng: -118.2851 });
      setSearchLocation({ lat: 34.0224, lng: -118.2851 });
      setSearchQuery('University Park, Los Angeles');
      setLocationResolved(true);
      setIsUsingCurrentLocation(false);
    };

    // If we have a last-known location, use it immediately so we never "snap" to University Park
    if (cached?.lat && cached?.lng) {
      applyLocation({ lat: cached.lat, lng: cached.lng });
    }

    if (!navigator.geolocation) {
      if (!cached) useDefaultLocation();
      return;
    }

    const logGeoError = (label: string, error: GeolocationPositionError) => {
      console.log(label, { code: error.code, message: error.message });
    };

    const save = (loc: { lat: number; lng: number }) => {
      localStorage.setItem('parkzy:lastLocation', JSON.stringify({ ...loc, ts: Date.now() }));
    };

    const onSuccess = (position: GeolocationPosition) => {
      const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
      applyLocation(loc);
      save(loc);
    };

    // 1) Fast, low-power attempt (often cached) so we don't block UX
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (error) => {
        logGeoError('Location quick attempt failed', error);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 4000,
      }
    );

    // 2) Then try for a real GPS fix (this is the accurate one)
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (error) => {
        logGeoError('Location GPS attempt failed', error);
        setLocationErrorCode(error.code);

        // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        if (error.code === 1) {
          if (cached) {
            toast('Location permission denied — using last known location', {
              action: {
                label: 'Fix',
                onClick: () => setShowFixLocationDialog(true),
              },
            });
            return;
          }
          toast.error('Location permission denied — showing default area', {
            action: {
              label: 'Fix',
              onClick: () => setShowFixLocationDialog(true),
            },
          });
          useDefaultLocation();
          return;
        }

        // If we already had cached/quick location, keep it; don't jump to default.
        if (cached) {
          toast('Could not get a GPS fix — using last known location', {
            action: {
              label: 'Fix',
              onClick: () => setShowFixLocationDialog(true),
            },
          });
          return;
        }

        // Last resort: try one more time without GPS but longer timeout
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (error2) => {
            logGeoError('Location fallback attempt failed', error2);
            setLocationErrorCode(error2.code);
            toast.error('Could not access your location — showing default area', {
              action: {
                label: 'Fix',
                onClick: () => setShowFixLocationDialog(true),
              },
            });
            useDefaultLocation();
          },
          {
            enableHighAccuracy: false,
            maximumAge: 60000,
            timeout: 15000,
          }
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      }
    );
  }, [mode]);

  useEffect(() => {
    // Skip fetching if we're in host mode (will redirect)
    if (mode === 'host') return;
    if (locationResolved && currentLocation) {
      fetchNearbySpots();
    }
  }, [locationResolved, currentLocation, mode]);

  const fetchNearbySpots = async () => {
    if (!currentLocation) return;

    const nowMs = Date.now();
    const locationKey = `${currentLocation.lat.toFixed(4)},${currentLocation.lng.toFixed(4)}`;

    // Prevent duplicate calls during rapid location updates / rerenders
    if (isFetchingNearbyRef.current) return;
    if (lastNearbySearchKeyRef.current === locationKey && nowMs - lastNearbySearchAtRef.current < 30_000) {
      return;
    }

    isFetchingNearbyRef.current = true;
    lastNearbySearchKeyRef.current = locationKey;
    lastNearbySearchAtRef.current = nowMs;

    try {
      setLoading(true);
      const today = new Date().toISOString();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase.functions.invoke('search-spots', {
        body: {
          latitude: currentLocation.lat,
          longitude: currentLocation.lng,
          radius: 5000,
          start_time: today,
          end_time: tomorrow,
        },
      });

      if (error) {
        console.error('Search error:', error);
        if (error.message?.includes('429') || error.message?.includes('Too many requests')) {
          // Avoid toast spam
          if (nowMs - lastRateLimitToastAtRef.current > 5000) {
            lastRateLimitToastAtRef.current = nowMs;
            toast.error('Too many requests. Please wait a moment and try again.', { duration: 5000 });
          }
        }
        return;
      }

      const transformedSpots =
        data.spots?.map((spot: any) => {
          const distanceMiles = spot.distance ? spot.distance / 1609.34 : null;
          const walkTime = distanceMiles ? Math.round(distanceMiles * 20) : null; // ~3mph walking speed
          return {
            id: spot.id,
            title: spot.title,
            category: spot.category,
            address: spot.address,
            hourlyRate: parseFloat(spot.hourly_rate),
            evChargingPremium: spot.ev_charging_premium_per_hour || 0,
            hasEvCharging: spot.has_ev_charging,
            evChargerType: spot.ev_charger_type,
            rating: spot.spot_rating || 0,
            reviews: spot.spot_review_count || 0,
            lat: parseFloat(spot.latitude),
            lng: parseFloat(spot.longitude),
            imageUrl:
              spot.spot_photos?.find((photo: any) => photo.is_primary)?.url ||
              spot.spot_photos?.[0]?.url,
            distanceMiles,
            walkTime,
            amenities: [
              ...(spot.has_ev_charging ? ['EV Charging'] : []),
              ...(spot.is_covered ? ['Covered'] : []),
              ...(spot.is_secure ? ['Security Camera'] : []),
              ...(spot.is_ada_accessible ? ['ADA Accessible'] : []),
            ],
            hostId: spot.host_id,
          };
        }) || [];

      setParkingSpots(transformedSpots);
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      isFetchingNearbyRef.current = false;
      setLoading(false);
    }
  };

  const handleSelectLocation = (location: { lat: number; lng: number; name: string }) => {
    setSearchLocation({ lat: location.lat, lng: location.lng });
    setSearchQuery(location.name);
    setIsUsingCurrentLocation(location.name === 'Current location');
  };

  const handleClearLocation = () => {
    setSearchQuery('');
    setIsUsingCurrentLocation(false);
  };

  const SpotCard = ({ spot, showEvPrice }: { spot: any; showEvPrice?: boolean }) => {
    const basePrice = calculateDriverPrice(spot.hourlyRate);
    const evPremium = spot.evChargingPremium || 0;
    const showCombinedPrice = showEvPrice && spot.hasEvCharging && evPremium > 0;
    const displayPrice = showCombinedPrice ? basePrice + evPremium : basePrice;
    
    return (
      <Card
        className="p-4 cursor-pointer transition-all hover:shadow-md"
        onClick={() => navigate(`/spot/${spot.id}?from=home`)}
      >
        <div className="flex gap-3">
          <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
            {spot.imageUrl ? (
              <img
                src={spot.imageUrl}
                alt={spot.title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted" />
            )}
          </div>

            <div className="flex-1 space-y-1.5 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {spot.category && (
                  <span className="text-sm font-semibold text-foreground truncate">
                    {spot.category}
                  </span>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-primary text-lg">${displayPrice.toFixed(2)}/hr</p>
                {showCombinedPrice && (
                  <p className="text-xs text-muted-foreground flex items-center justify-end gap-0.5">
                    <Zap className="h-3 w-3 text-green-600" />
                    incl. charging
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <span className="leading-tight line-clamp-1">{spot.address}</span>
            </div>

            {spot.distanceMiles && (
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span className="font-semibold text-foreground">{spot.distanceMiles.toFixed(1)} mi</span>
                </div>
                {spot.walkTime && (
                  <div className="flex items-center gap-1">
                    <Footprints className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold text-foreground">{spot.walkTime} min walk</span>
                  </div>
                )}
              </div>
            )}


            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                <span className="font-medium text-sm">{spot.rating}</span>
                <span className="text-muted-foreground text-sm">({spot.reviews})</span>
              </div>
            </div>

            {spot.amenities && spot.amenities.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {spot.amenities.slice(0, 3).map((amenity: string, index: number) => (
                  <Badge key={index} variant="outline" className="text-xs px-1.5 py-0.5">
                    {amenity}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const handleSearch = () => {
    if (!searchQuery.trim() && !isUsingCurrentLocation) {
      toast.error('Please enter a location');
      return;
    }

    if (!startTime || !endTime) {
      toast.error('Please select start and end times');
      return;
    }

    if (needsEvCharging && !selectedChargerType) {
      toast.error('Please select a charger type');
      return;
    }

    if (searchLocation) {
      let url = `/explore?lat=${searchLocation.lat}&lng=${searchLocation.lng}&start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=${encodeURIComponent(searchQuery || 'Current location')}`;
      
      if (needsEvCharging && selectedChargerType) {
        url += `&ev=true&chargerType=${encodeURIComponent(selectedChargerType)}`;
      }
      
      navigate(url);
    }
  };

  const quickActions = [
    {
      icon: Zap,
      label: 'Instant Book',
      onClick: () => {
        const now = new Date();
        const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        if (searchLocation) {
          navigate(
            `/explore?lat=${searchLocation.lat}&lng=${searchLocation.lng}&start=${now.toISOString()}&end=${twoHoursLater.toISOString()}`
          );
        } else {
          navigate('/explore');
        }
      },
    },
    {
      icon: Plus,
      label: 'List Your Spot',
      onClick: () => {
        setMode('host');
        navigate('/dashboard');
      },
    },
    {
      icon: Activity,
      label: 'My Bookings',
      onClick: () => navigate('/activity'),
    },
  ];

  // Redirect to host-home if in host mode - return null to prevent flash
  // But allow rendering if we came from logo click (mode was just switched)
  const fromLogoClick = (location.state as { fromLogoClick?: boolean })?.fromLogoClick;
  if (mode === 'host' && !fromLogoClick) {
    return null;
  }

  // Show desktop landing page on non-mobile
  if (!isMobile) {
    return <Index />;
  }

  return (
    <div className="bg-background">
      <div className="p-4 space-y-6">
        {/* Email Verification Banner */}
        {user && !isEmailVerified && (
          <EmailVerificationBanner />
        )}
        
        {/* Search Card */}
        <Card className="p-6 space-y-4">
          <LocationSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            onSelectLocation={handleSelectLocation}
            onClear={handleClearLocation}
            isUsingCurrentLocation={isUsingCurrentLocation}
            placeholder="Where do you need parking?"
            inputClassName="h-12 text-base"
            showPopularPOIs
          />

          {/* Location error banner */}
          {!isUsingCurrentLocation && locationErrorCode && (
            <button
              onClick={() => setShowFixLocationDialog(true)}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-left transition-colors hover:bg-yellow-500/20"
            >
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                  Location access issue
                </p>
                <p className="text-xs text-yellow-600/80 dark:text-yellow-500/80">
                  Tap here to fix and use your current location
                </p>
              </div>
            </button>
          )}

          <div>
            <p className="font-semibold mb-4">When do you need parking?</p>

            <div className="space-y-3">
              {/* Start Time */}
              <button
                type="button"
                onClick={() => setMobileStartPickerOpen(true)}
                onMouseDown={e => e.preventDefault()}
                className="w-full flex items-center gap-3 p-3 rounded-lg border bg-background active:bg-accent transition-colors text-left touch-scroll-safe"
              >
                <CalendarIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Start Time</div>
                  <div className="text-sm font-medium truncate">
                    {format(startTime, 'MMM d, yyyy')} · {format(startTime, 'h:mm a')}
                  </div>
                </div>
              </button>

              {/* End Time */}
              <button
                type="button"
                onClick={() => setMobileEndPickerOpen(true)}
                onMouseDown={e => e.preventDefault()}
                className="w-full flex items-center gap-3 p-3 rounded-lg border bg-background active:bg-accent transition-colors text-left touch-scroll-safe"
              >
                <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">End Time</div>
                  <div className="text-sm font-medium truncate">
                    {format(endTime, 'MMM d, yyyy')} · {format(endTime, 'h:mm a')}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* EV Charging Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BatteryCharging className="h-5 w-5 text-green-600" />
                <Label htmlFor="ev-charging" className="font-semibold cursor-pointer">
                  I need EV charging
                </Label>
              </div>
              <Switch
                id="ev-charging"
                checked={needsEvCharging}
                onCheckedChange={(checked) => {
                  setNeedsEvCharging(checked);
                  if (checked) {
                    setShowChargerTypes(true);
                  } else {
                    setSelectedChargerType(null);
                    setShowChargerTypes(false);
                  }
                }}
              />
            </div>

            {/* Charger Type Selector */}
            {needsEvCharging && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowChargerTypes(!showChargerTypes)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border bg-background"
                >
                  <span className="text-sm">
                    {selectedChargerType 
                      ? evChargerTypes.find(c => c.id === selectedChargerType)?.name 
                      : 'Select charger type'}
                  </span>
                  {showChargerTypes ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {showChargerTypes && (
                  <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                    {evChargerTypes.map((charger) => (
                      <button
                        key={charger.id}
                        type="button"
                        onClick={() => {
                          setSelectedChargerType(charger.id);
                          setShowChargerTypes(false);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                          selectedChargerType === charger.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background hover:bg-accent'
                        }`}
                      >
                        <img 
                          src={charger.iconPath} 
                          alt={charger.name}
                          className="w-8 h-8"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{charger.name}</div>
                          <div className="text-xs text-muted-foreground">{charger.chargingSpeed}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button onClick={handleSearch} className="w-full h-12 text-base" size="lg">
            <Search className="mr-2 h-5 w-5" />
            Find Parking
          </Button>
        </Card>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-3">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Card
                  key={index}
                  className="p-2 cursor-pointer hover:shadow-md transition-all"
                  onClick={action.onClick}
                >
                  <div className="flex flex-col items-center text-center space-y-1">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium">{action.label}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Active Booking Banner */}
        <ActiveBookingBanner />

        {/* Nearby Spots */}
        {!locationResolved ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <MapPin className="h-8 w-8 animate-pulse mx-auto text-primary" />
              <p className="text-muted-foreground">Detecting your location...</p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p className="text-muted-foreground">Finding nearby spots...</p>
            </div>
          </div>
        ) : parkingSpots.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">No parking spots found nearby</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Nearby Spots</h2>
            {parkingSpots.map((spot) => (
              <SpotCard key={spot.id} spot={spot} showEvPrice={needsEvCharging} />
            ))}
          </div>
        )}
      </div>

      {/* Mobile Time Pickers */}
      {mobileStartPickerOpen && (
        <MobileTimePicker
          isOpen={mobileStartPickerOpen}
          onClose={() => setMobileStartPickerOpen(false)}
          onConfirm={(date) => {
            handleStartTimeChange(date);
            setMobileStartPickerOpen(false);
            // Automatically open end time picker after selecting start time
            setTimeout(() => setMobileEndPickerOpen(true), 100);
          }}
          mode="start"
          initialValue={startTime}
        />
      )}

      {mobileEndPickerOpen && (
        <MobileTimePicker
          isOpen={mobileEndPickerOpen}
          onClose={() => setMobileEndPickerOpen(false)}
          onConfirm={(date) => {
            handleEndTimeChange(date);
            setMobileEndPickerOpen(false);
          }}
          mode="end"
          startTime={startTime}
          initialValue={endTime}
        />
      )}

      {/* Fix Location Dialog */}
      <FixLocationDialog
        open={showFixLocationDialog}
        onOpenChange={setShowFixLocationDialog}
        errorCode={locationErrorCode}
        onRetry={() => {
          // Trigger refetch of nearby spots
          if (currentLocation) {
            fetchNearbySpots();
          }
        }}
        onSuccess={(coords) => {
          setCurrentLocation(coords);
          setSearchLocation(coords);
          setSearchQuery('');
          setIsUsingCurrentLocation(true);
          setLocationErrorCode(null);
        }}
      />
    </div>
  );
};

export default Home;
