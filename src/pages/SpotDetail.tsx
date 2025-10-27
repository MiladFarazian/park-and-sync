import React, { useState, useEffect } from 'react';
import { ArrowLeft, Heart, Share, Star, MapPin, Calendar, Navigation, MessageCircle, Phone, Camera, Clock, Shield, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

// Import the generated images
import uscGarage from '@/assets/usc-garage.jpg';
import expositionDriveway from '@/assets/exposition-driveway.jpg';
import santaMonicaPier from '@/assets/santa-monica-pier.jpg';
import thirdStreetGarage from '@/assets/third-street-garage.jpg';
import sunsetStrip from '@/assets/sunset-strip.jpg';
import rodeoDrive from '@/assets/rodeo-drive.jpg';
import veniceBeach from '@/assets/venice-beach.jpg';
import staplesCenter from '@/assets/staples-center.jpg';
import vermontExpositionLot from '@/assets/vermont-exposition-lot.jpg';
import westAdamsMansion from '@/assets/west-adams-mansion.jpg';
import mainStreetVeniceBorder from '@/assets/main-street-venice-border.jpg';
import picoBusinessHub from '@/assets/pico-business-hub.jpg';
import smcCollegeArea from '@/assets/smc-college-area.jpg';
import wilshireOfficeComplex from '@/assets/wilshire-office-complex.jpg';
import melroseDesignDistrict from '@/assets/melrose-design-district.jpg';
import santaMonicaBlvdHub from '@/assets/santa-monica-blvd-hub.jpg';
import beverlyHillsCityHall from '@/assets/beverly-hills-city-hall.jpg';
import abbotKinneyCreative from '@/assets/abbot-kinney-creative.jpg';
import veniceCanalsHistoric from '@/assets/venice-canals-historic.jpg';
import artsDistrictLoft from '@/assets/arts-district-loft.jpg';
import grandCentralMarket from '@/assets/grand-central-market.jpg';
import littleTokyoCultural from '@/assets/little-tokyo-cultural.jpg';
import financialDistrictHighrise from '@/assets/financial-district-highrise.jpg';
import hollywoodWalkFame from '@/assets/hollywood-walk-fame.jpg';
import griffithObservatoryArea from '@/assets/griffith-observatory-area.jpg';

const SpotDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [spot, setSpot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDirections, setShowDirections] = useState(false);

  // Determine where to navigate back based on 'from' parameter
  const from = searchParams.get('from');
  const getBackUrl = () => {
    if (from === 'home') {
      return '/';
    } else if (from === 'explore') {
      const lat = searchParams.get('lat');
      const lng = searchParams.get('lng');
      const start = searchParams.get('start');
      const end = searchParams.get('end');
      const q = searchParams.get('q');
      
      const params = new URLSearchParams();
      if (lat) params.set('lat', lat);
      if (lng) params.set('lng', lng);
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      if (q) params.set('q', q);
      
      return `/explore${params.toString() ? `?${params.toString()}` : ''}`;
    }
    return '/'; // Default to home
  };
  const backUrl = getBackUrl();

  // Map of image paths
  const imageMap: { [key: string]: string } = {
    '/src/assets/usc-garage.jpg': uscGarage,
    '/src/assets/exposition-driveway.jpg': expositionDriveway,
    '/src/assets/santa-monica-pier.jpg': santaMonicaPier,
    '/src/assets/third-street-garage.jpg': thirdStreetGarage,
    '/src/assets/sunset-strip.jpg': sunsetStrip,
    '/src/assets/rodeo-drive.jpg': rodeoDrive,
    '/src/assets/venice-beach.jpg': veniceBeach,
    '/src/assets/staples-center.jpg': staplesCenter,
    '/src/assets/vermont-exposition-lot.jpg': vermontExpositionLot,
    '/src/assets/west-adams-mansion.jpg': westAdamsMansion,
    '/src/assets/main-street-venice-border.jpg': mainStreetVeniceBorder,
    '/src/assets/pico-business-hub.jpg': picoBusinessHub,
    '/src/assets/smc-college-area.jpg': smcCollegeArea,
    '/src/assets/wilshire-office-complex.jpg': wilshireOfficeComplex,
    '/src/assets/melrose-design-district.jpg': melroseDesignDistrict,
    '/src/assets/santa-monica-blvd-hub.jpg': santaMonicaBlvdHub,
    '/src/assets/beverly-hills-city-hall.jpg': beverlyHillsCityHall,
    '/src/assets/abbot-kinney-creative.jpg': abbotKinneyCreative,
    '/src/assets/venice-canals-historic.jpg': veniceCanalsHistoric,
    '/src/assets/arts-district-loft.jpg': artsDistrictLoft,
    '/src/assets/grand-central-market.jpg': grandCentralMarket,
    '/src/assets/little-tokyo-cultural.jpg': littleTokyoCultural,
    '/src/assets/financial-district-highrise.jpg': financialDistrictHighrise,
    '/src/assets/hollywood-walk-fame.jpg': hollywoodWalkFame,
    '/src/assets/griffith-observatory-area.jpg': griffithObservatoryArea
  };

  useEffect(() => {
    if (id) {
      fetchSpotDetails();
    }
  }, [id]);

  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const isIOS = () => {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  };

  const handleDirections = () => {
    if (!spot?.address) return;

    // On desktop, directly navigate to Google Maps
    if (!isMobile()) {
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(spot.address)}`;
      window.location.href = googleMapsUrl;
      return;
    }

    // On mobile, show options
    setShowDirections(true);
  };

  const openGoogleMaps = () => {
    if (!spot?.address) return;
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(spot.address)}`;
    window.location.href = googleMapsUrl;
  };

  const openAppleMaps = () => {
    if (!spot?.address) return;
    const appleMapsUrl = `http://maps.apple.com/?daddr=${encodeURIComponent(spot.address)}`;
    window.location.href = appleMapsUrl;
    setShowDirections(false);
  };

  const fetchSpotDetails = async () => {
    try {
      setLoading(true);
      const { data: spotData, error: spotError } = await supabase
        .from('spots')
        .select(`
          *,
          profiles!spots_host_id_fkey (
            first_name,
            last_name,
            rating,
            review_count,
            avatar_url
          ),
          spot_photos (
            url,
            is_primary,
            sort_order
          )
        `)
        .eq('id', id)
        .single();

      if (spotError || !spotData) {
        setError('Parking spot not found');
        return;
      }

      const photos = Array.isArray(spotData.spot_photos) ? spotData.spot_photos : [];
      const transformedImages = photos.length > 0 
        ? photos.sort((a, b) => a.sort_order - b.sort_order).map(photo => imageMap[photo.url] || photo.url)
        : ['/placeholder.svg'];

      setSpot({
        ...spotData,
        hourlyRate: Number(spotData.hourly_rate),
        dailyRate: spotData.daily_rate ? Number(spotData.daily_rate) : null,
        rating: Number(spotData.profiles?.rating || 0),
        reviewCount: Number(spotData.profiles?.review_count || 0),
        images: transformedImages,
        amenities: [
          ...(spotData.is_covered ? [{ icon: Shield, title: 'Covered Parking', subtitle: 'Protected from weather' }] : []),
          ...(spotData.is_secure ? [{ icon: Camera, title: 'Security', subtitle: 'Monitored parking area' }] : []),
          ...(spotData.has_ev_charging ? [{ icon: Zap, title: 'EV Charging', subtitle: 'Electric vehicle charging available' }] : []),
          { icon: Clock, title: 'Easy Access', subtitle: 'Convenient location' }
        ],
        rules: spotData.host_rules ? spotData.host_rules.split('.').filter((r: string) => r.trim()) : ['Follow parking guidelines'],
        host: {
          name: spotData.profiles ? `${spotData.profiles.first_name || 'Host'} ${(spotData.profiles.last_name || '').charAt(0)}.` : 'Host',
          avatar: spotData.profiles?.avatar_url || '/placeholder.svg',
          responseTime: 'Usually responds within a few hours'
        },
        reviewsList: []
      });
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading parking spot...</p>
        </div>
      </div>
    );
  }

  if (error || !spot) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-500">{error || 'Spot not found'}</p>
          <Button onClick={() => navigate('/')}>Back to Search</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Image Gallery */}
      <div className="relative h-80">
        <img 
          src={spot.images[currentImageIndex]} 
          alt={spot.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        
        <div className="absolute top-4 left-4 right-4 flex justify-between">
          <Button variant="secondary" size="sm" onClick={() => navigate(backUrl)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">
              <Heart className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm">
              <Share className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
          <Camera className="h-3 w-3 inline mr-1" />
          {spot.images.length} photos
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div>
          <div className="flex justify-between items-start mb-2">
            <h1 className="text-2xl font-bold">{spot.title}</h1>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">${spot.hourlyRate}</p>
              <p className="text-sm text-muted-foreground">per hour</p>
            </div>
          </div>
          
          <div className="flex items-start gap-2 text-muted-foreground mb-4">
            <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>{spot.address}</p>
          </div>

          <div className="flex gap-3 mb-6">
            <Button className="flex-1" onClick={() => {
              const start = searchParams.get('start');
              const end = searchParams.get('end');
              const params = new URLSearchParams();
              if (start) params.set('start', start);
              if (end) params.set('end', end);
              navigate(`/book/${id}${params.toString() ? `?${params.toString()}` : ''}`);
            }}>
              <Calendar className="h-4 w-4 mr-2" />
              Book Now
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleDirections}>
              <Navigation className="h-4 w-4 mr-2" />
              Directions
            </Button>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">What this place offers</h2>
          <div className="space-y-1">
            {spot.amenities.map((amenity: any, index: number) => (
              <div key={index} className="flex items-start gap-3 p-3">
                <div className="p-2 bg-muted rounded-lg">
                  <amenity.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{amenity.title}</p>
                  <p className="text-sm text-muted-foreground">{amenity.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">About this space</h2>
          <p className="text-muted-foreground leading-relaxed">{spot.description}</p>
          {spot.access_notes && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="font-medium mb-2">Access Instructions:</p>
              <p className="text-sm text-muted-foreground">{spot.access_notes}</p>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={spot.host.avatar} />
                <AvatarFallback>H</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{spot.host.name}</p>
                <p className="text-sm text-muted-foreground">Host</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">${spot.hourlyRate} / hour</p>
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium">{spot.rating || 'New'}</span>
            </div>
          </div>
          <Button size="lg" onClick={() => {
            const start = searchParams.get('start');
            const end = searchParams.get('end');
            const params = new URLSearchParams();
            if (start) params.set('start', start);
            if (end) params.set('end', end);
            navigate(`/book/${id}${params.toString() ? `?${params.toString()}` : ''}`);
          }}>Book Now</Button>
        </div>
      </div>

      {/* Directions Options Sheet (Mobile) */}
      <Sheet open={showDirections} onOpenChange={setShowDirections}>
        <SheetContent side="bottom" className="h-auto">
          <SheetHeader>
            <SheetTitle>Get Directions</SheetTitle>
            <SheetDescription>Choose your preferred navigation app</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 pt-4 pb-6">
            <Button 
              variant="outline" 
              className="w-full h-14 text-base justify-start"
              onClick={openGoogleMaps}
            >
              <Navigation className="h-5 w-5 mr-3" />
              Open in Google Maps
            </Button>
            {isIOS() && (
              <Button 
                variant="outline" 
                className="w-full h-14 text-base justify-start"
                onClick={openAppleMaps}
              >
                <MapPin className="h-5 w-5 mr-3" />
                Open in Apple Maps
              </Button>
            )}
            <Button 
              variant="ghost" 
              className="w-full"
              onClick={() => setShowDirections(false)}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SpotDetail;