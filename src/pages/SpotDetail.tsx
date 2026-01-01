import React, { useState, useEffect } from 'react';
import { ArrowLeft, Heart, Share, Star, MapPin, Calendar, Navigation, MessageCircle, Phone, Camera, Clock, Shield, Zap, Loader2, Pencil, ChevronLeft, ChevronRight, Flag, BoltIcon, Accessibility, User, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatAvailability } from '@/lib/formatAvailability';
import { useMode } from '@/contexts/ModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { calculateDriverPrice } from '@/lib/pricing';

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
  const { mode, setMode } = useMode();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [spot, setSpot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDirections, setShowDirections] = useState(false);
  const [isOwnSpot, setIsOwnSpot] = useState(false);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [userBooking, setUserBooking] = useState<{ id: string; start_at: string; end_at: string; status: string } | null>(null);
  const [guestBookingModalOpen, setGuestBookingModalOpen] = useState(false);

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => 
      prev === 0 ? (spot?.images?.length || 1) - 1 : prev - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => 
      prev === (spot?.images?.length || 1) - 1 ? 0 : prev + 1
    );
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      handleNextImage();
    }
    if (isRightSwipe) {
      handlePrevImage();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevImage();
      } else if (e.key === 'ArrowRight') {
        handleNextImage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [spot]);

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareData = {
      title: spot?.title || 'Parking Spot',
      text: `Check out this parking spot: ${spot?.title} - $${spot?.hourlyRate}/hour`,
      url: shareUrl,
    };

    try {
      // Check if Web Share API is available (mobile devices)
      if (navigator.share && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast.success('Shared successfully');
      } else {
        // Fallback: Copy to clipboard
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link copied to clipboard');
      }
    } catch (error: any) {
      // User cancelled share or clipboard failed
      if (error.name !== 'AbortError') {
        toast.error('Failed to share');
      }
    }
  };

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
  }, [id, user]);

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

  const handleSwitchToDriverMode = () => {
    setMode('driver');
    toast.success('Switched to Driver Mode');
  };

  const handleBookNow = () => {
    if (mode === 'host') {
      handleSwitchToDriverMode();
      return;
    }
    if (isOwnSpot) {
      toast.error("You cannot book your own spot");
      return;
    }
    
    // If user is not authenticated, show guest booking modal
    if (!user) {
      setGuestBookingModalOpen(true);
      return;
    }
    
    // Get start/end times from URL params if they exist
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    
    navigate(`/book/${spot.id}${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const handleGuestBooking = () => {
    setGuestBookingModalOpen(false);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    params.set('guest', 'true');
    
    navigate(`/book/${spot.id}?${params.toString()}`);
  };

  const handleLoginToBook = () => {
    setGuestBookingModalOpen(false);
    // Store the return URL so user comes back after login
    const returnUrl = `/spot/${id}${window.location.search}`;
    navigate(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`);
  };

  const handleMessageHost = () => {
    if (!user) {
      toast.error('Please sign in to message the host');
      return;
    }
    if (isOwnSpot) {
      toast.error("You cannot message yourself");
      return;
    }
    setMessageDialogOpen(true);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) {
      toast.error('Please enter a message');
      return;
    }
    if (!user || !spot?.host_id) {
      return;
    }

    setSendingMessage(true);
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          recipient_id: spot.host_id,
          message: messageText.trim(),
          delivered_at: new Date().toISOString()
        });

      if (error) throw error;

      toast.success('Message sent to host');
      setMessageText('');
      setMessageDialogOpen(false);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleEditSpot = () => {
    if (!id) return;
    
    // If in driver mode but it's our spot, switch to host mode first
    if (mode === 'driver') {
      setMode('host');
    }
    
    navigate(`/edit-spot/${id}`);
  };

  const handleReportSpot = () => {
    if (!user) {
      toast.error('Please sign in to report a listing');
      return;
    }
    if (isOwnSpot) {
      toast.error("You cannot report your own spot");
      return;
    }
    setReportDialogOpen(true);
  };

  const handleSubmitReport = async () => {
    if (!reportReason) {
      toast.error('Please select a reason for reporting');
      return;
    }
    if (!user || !spot?.id) return;

    setSubmittingReport(true);
    try {
      const { data: reportData, error } = await supabase
        .from('spot_reports')
        .insert({
          spot_id: spot.id,
          reporter_id: user.id,
          reason: reportReason,
          details: reportDetails.trim() || null
        })
        .select('id')
        .single();

      if (error) throw error;

      // Send notification email to admin (fire and forget)
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('user_id', user.id)
        .single();

      supabase.functions.invoke('send-report-notification', {
        body: {
          reportId: reportData.id,
          spotId: spot.id,
          spotTitle: spot.title,
          spotAddress: spot.address,
          reporterName: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Anonymous' : 'Anonymous',
          reporterEmail: profile?.email || null,
          reason: reportReason,
          details: reportDetails.trim() || null
        }
      }).catch(err => console.error('Failed to send report notification:', err));

      toast.success('Report submitted. We will review it shortly.');
      setReportReason('');
      setReportDetails('');
      setReportDialogOpen(false);
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Failed to submit report');
    } finally {
      setSubmittingReport(false);
    }
  };

  const fetchSpotDetails = async () => {
    try {
      setLoading(true);
      console.log('[SpotDetail] Fetching spot:', id);
      
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
          ),
          availability_rules (
            day_of_week,
            start_time,
            end_time,
            is_available
          )
        `)
        .eq('id', id)
        .single();

      console.log('[SpotDetail] Fetch result:', { 
        id, 
        hasData: !!spotData, 
        hasError: !!spotError,
        errorCode: spotError?.code,
        errorMessage: spotError?.message,
        spotStatus: spotData?.status
      });

      if (spotError) {
        console.error('[SpotDetail] RLS/Permission error:', spotError);
        if (spotError.code === 'PGRST116' || spotError.message?.includes('not found')) {
          setError('This parking spot is not available');
        } else if (spotError.code === 'PGRST301' || spotError.message?.includes('permission')) {
          setError('You do not have permission to view this spot');
        } else {
          setError('Unable to load parking spot details');
        }
        return;
      }

      if (!spotData) {
        console.error('[SpotDetail] No spot data returned for ID:', id);
        setError('Parking spot not found');
        return;
      }

      if (spotData.status !== 'active') {
        console.warn('[SpotDetail] Spot is not active:', { id, status: spotData.status });
        setError('This spot is not currently active and cannot be booked');
        return;
      }

      const photos = Array.isArray(spotData.spot_photos) ? spotData.spot_photos : [];
      const transformedImages = photos.length > 0 
        ? photos.sort((a, b) => a.sort_order - b.sort_order).map(photo => imageMap[photo.url] || photo.url)
        : ['/placeholder.svg'];

      const transformedData = {
        ...spotData,
        id: spotData.id,
        title: spotData.title,
        address: spotData.address,
        hourlyRate: Number(spotData.hourly_rate),
        dailyRate: spotData.daily_rate ? Number(spotData.daily_rate) : null,
        rating: Number(spotData.profiles?.rating || 0),
        reviewCount: Number(spotData.profiles?.review_count || 0),
        images: transformedImages,
        availability_rules: spotData.availability_rules || [],
        host_id: spotData.host_id,
        amenities: [
          ...(spotData.is_covered ? [{ icon: Shield, title: 'Covered Parking', subtitle: 'Protected from weather' }] : []),
          ...(spotData.is_secure ? [{ icon: Camera, title: 'Security', subtitle: 'Monitored parking area' }] : []),
          ...(spotData.has_ev_charging ? [{ icon: Zap, title: 'EV Charging', subtitle: 'Electric vehicle charging available' }] : []),
          ...(spotData.is_ada_accessible ? [{ icon: Accessibility, title: 'ADA Accessible', subtitle: 'Wheelchair accessible parking' }] : []),
          { icon: Clock, title: 'Easy Access', subtitle: 'Convenient location' }
        ],
        rules: spotData.host_rules ? spotData.host_rules.split('.').filter((r: string) => r.trim()) : ['Follow parking guidelines'],
        host: {
          name: spotData.profiles ? `${spotData.profiles.first_name || 'Host'} ${(spotData.profiles.last_name || '').charAt(0)}.` : 'Host',
          avatar: spotData.profiles?.avatar_url || '/placeholder.svg',
          responseTime: 'Usually responds within a few hours'
        },
        reviewsList: []
      };

      setSpot(transformedData);
      
      // Fetch reviews for this specific spot (pass host_id to avoid race condition)
      fetchSpotReviews(spotData.id, spotData.host_id);
      
      // Check if user owns this spot
      if (user && transformedData.host_id) {
        const isOwner = user.id === transformedData.host_id;
        console.log('[SpotDetail] Ownership check:', {
          userId: user.id,
          hostId: transformedData.host_id,
          isOwner
        });
        setIsOwnSpot(isOwner);
        
        // Check if user has an existing active or paid booking for this spot
        // that OVERLAPS with the requested time range (from URL params)
        if (!isOwner) {
          const requestedStart = searchParams.get('start');
          const requestedEnd = searchParams.get('end');
          
          // Only check for overlapping bookings if we have requested times
          // If no times specified, check for any current/future booking
          const now = new Date().toISOString();
          
          let query = supabase
            .from('bookings')
            .select('id, start_at, end_at, status')
            .eq('spot_id', spotData.id)
            .eq('renter_id', user.id)
            .in('status', ['paid', 'active']);
          
          if (requestedStart && requestedEnd) {
            // Check for overlapping bookings: existing.start < requested.end AND existing.end > requested.start
            query = query
              .lt('start_at', requestedEnd)
              .gt('end_at', requestedStart);
          } else {
            // No specific time requested, check for any booking that hasn't ended
            query = query.gte('end_at', now);
          }
          
          const { data: existingBooking } = await query
            .order('start_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          
          if (existingBooking) {
            setUserBooking(existingBooking);
          }
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchSpotReviews = async (spotId: string, hostId: string) => {
    setReviewsLoading(true);
    try {
      // Get reviews for bookings of this specific spot
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          reviewer:reviewer_id (
            first_name,
            last_name,
            avatar_url
          ),
          booking:booking_id (
            spot_id
          )
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Filter to only reviews for this spot where the driver reviewed the host
      // (reviewee_id should be the host, not the driver)
      const spotReviews = (data || []).filter(
        review => review.booking?.spot_id === spotId && review.reviewee_id === hostId
      );
      
      setReviews(spotReviews);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setReviewsLoading(false);
    }
  };

  // Calculate rating distribution for histogram
  const getRatingDistribution = () => {
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(review => {
      if (review.rating >= 1 && review.rating <= 5) {
        distribution[review.rating as keyof typeof distribution]++;
      }
    });
    return distribution;
  };

  const getAverageRating = () => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / reviews.length).toFixed(1);
  };

  if (loading) {
    return (
      <div className="bg-background flex items-center justify-center py-24">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading parking spot...</p>
        </div>
      </div>
    );
  }

  if (error || !spot) {
    return (
      <div className="bg-background flex items-center justify-center py-24">
        <div className="text-center space-y-4">
          <p className="text-red-500">{error || 'Spot not found'}</p>
          <Button onClick={() => navigate('/')}>Back to Search</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background pb-32 min-h-screen overflow-y-auto">
      {/* Image Gallery */}
      <div 
        className="relative h-80 select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img 
          src={spot.images[currentImageIndex]} 
          alt={spot.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        
        <div className="absolute top-4 left-4 right-4 flex justify-between z-10">
          <Button variant="secondary" size="sm" onClick={() => navigate(backUrl)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex gap-2">
            {isOwnSpot && (
              <Button variant="secondary" size="sm" onClick={handleEditSpot}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button variant="secondary" size="sm">
              <Heart className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={handleShare}>
              <Share className="h-4 w-4" />
            </Button>
            {!isOwnSpot && (
              <Button variant="secondary" size="sm" onClick={handleReportSpot}>
                <Flag className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {spot.images.length > 1 && (
          <>
            {/* Navigation Arrows */}
            <button
              onClick={handlePrevImage}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all hover:scale-110 z-10"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={handleNextImage}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all hover:scale-110 z-10"
              aria-label="Next image"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            {/* Dot Indicators */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
              {spot.images.map((_: any, index: number) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentImageIndex 
                      ? 'bg-white w-6' 
                      : 'bg-white/50 hover:bg-white/75'
                  }`}
                  aria-label={`Go to image ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}

        <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
          <Camera className="h-3 w-3 inline mr-1" />
          {spot.images.length} photo{spot.images.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div>
          {/* Category & Price Header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex flex-col gap-2">
              {spot.category && (
                <span className="inline-flex items-center gap-2.5 px-4 py-2 bg-primary/10 text-primary rounded-full text-base font-semibold">
                  {spot.category === 'Residential Driveway' && <span className="text-lg">🏠</span>}
                  {spot.category === 'Apartment / Condo Lot' && <span className="text-lg">🏢</span>}
                  {spot.category === 'Commercial Lot' && <span className="text-lg">🅿️</span>}
                  {spot.category === 'Garage' && <span className="text-lg">🚗</span>}
                  {spot.category === 'Street Parking' && <span className="text-lg">🛣️</span>}
                  {spot.category === 'Event / Venue Lot' && <span className="text-lg">🎭</span>}
                  {spot.category}
                </span>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {spot.instant_book !== false ? (
                      <Badge variant="secondary" className="w-fit text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 cursor-help">
                        <BoltIcon className="h-3 w-3 mr-1" />
                        Instant Book
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="w-fit text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 cursor-help">
                        <Clock className="h-3 w-3 mr-1" />
                        Requires Confirmation
                      </Badge>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[280px] p-3">
                    {spot.instant_book !== false ? (
                      <p className="text-sm">Book now, park now. Your reservation is confirmed the moment you complete payment.</p>
                    ) : (
                      <p className="text-sm">Your request will be sent to the host for approval. They have 90 minutes to respond. Your card won't be charged until they confirm.</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">${calculateDriverPrice(spot.hourlyRate).toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">per hour</p>
            </div>
          </div>
          
          <div className="flex items-start gap-2 text-muted-foreground mb-4">
            <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>{spot.address}</p>
          </div>

          <div className="flex gap-3 mb-6">
            {isOwnSpot ? (
              <Button className="flex-1" onClick={handleEditSpot}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Spot
              </Button>
            ) : userBooking ? (
              <Button className="flex-1" variant="secondary" onClick={() => navigate(`/booking/${userBooking.id}`)}>
                <Calendar className="h-4 w-4 mr-2" />
                View Booking
              </Button>
            ) : mode === 'host' ? (
              <Button className="flex-1" variant="outline" onClick={handleBookNow}>
                <Calendar className="h-4 w-4 mr-2" />
                Switch to Driver Mode to Book
              </Button>
            ) : (
              <Button className="flex-1" onClick={handleBookNow}>
                <Calendar className="h-4 w-4 mr-2" />
                Book Now
              </Button>
            )}
            <Button variant="outline" className="flex-1" onClick={handleDirections}>
              <Navigation className="h-4 w-4 mr-2" />
              Directions
            </Button>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-3">Availability</h2>
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-primary" />
              <p className="font-medium">{formatAvailability(spot.availability_rules)}</p>
            </div>
            {spot.availability_rules && spot.availability_rules.length > 0 && (
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                {(() => {
                  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                  const availableDays = spot.availability_rules
                    .filter((r: any) => r.is_available)
                    .reduce((acc: any, rule: any) => {
                      if (!acc[rule.day_of_week]) {
                        acc[rule.day_of_week] = [];
                      }
                      acc[rule.day_of_week].push(rule);
                      return acc;
                    }, {});
                  
                  return Object.entries(availableDays).map(([day, rules]: [string, any]) => {
                    const dayIndex = parseInt(day);
                    const timeRanges = rules.map((r: any) => {
                      const formatTime = (time: string) => {
                        const [hours, minutes] = time.split(':');
                        const hour = parseInt(hours);
                        const ampm = hour >= 12 ? 'PM' : 'AM';
                        const displayHour = hour % 12 || 12;
                        return `${displayHour}:${minutes}${ampm}`;
                      };
                      return `${formatTime(r.start_time)}–${formatTime(r.end_time)}`;
                    }).join(', ');
                    
                    return (
                      <div key={day} className="flex justify-between">
                        <span className="font-medium">{DAYS[dayIndex]}</span>
                        <span>{timeRanges}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
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
            {!isOwnSpot && (
              <Button variant="outline" size="sm" onClick={handleMessageHost}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Message
              </Button>
            )}
          </div>
        </div>

        {/* Report Listing Option (Non-owners Only) */}
        {!isOwnSpot && (
          <div className="flex justify-center py-2">
            <button
              onClick={handleReportSpot}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Flag className="h-4 w-4" />
              Report Listing
            </button>
          </div>
        )}

        {/* Reviews Section */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Reviews</h2>
          
          {reviewsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : reviews.length === 0 ? (
            <Card className="p-6 text-center">
              <Star className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No reviews yet</p>
              <p className="text-sm text-muted-foreground mt-1">Be the first to book and review this spot!</p>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Rating Summary with Histogram */}
              <Card className="p-5">
                <div className="flex items-start gap-6">
                  {/* Average Rating */}
                  <div className="text-center">
                    <p className="text-4xl font-bold text-primary">{getAverageRating()}</p>
                    <div className="flex justify-center gap-0.5 my-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= Math.round(Number(getAverageRating()))
                              ? 'fill-primary text-primary'
                              : 'text-muted-foreground/30'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
                  </div>
                  
                  {/* Histogram */}
                  <div className="flex-1 space-y-1.5">
                    {[5, 4, 3, 2, 1].map((rating) => {
                      const count = getRatingDistribution()[rating as keyof ReturnType<typeof getRatingDistribution>];
                      const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                      
                      return (
                        <div key={rating} className="flex items-center gap-2">
                          <span className="text-xs font-medium w-3">{rating}</span>
                          <Star className="h-3 w-3 fill-primary text-primary" />
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>

              {/* Filter Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={ratingFilter === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRatingFilter(null)}
                  className="h-8"
                >
                  All
                </Button>
                {[5, 4, 3, 2, 1].map((rating) => (
                  <Button
                    key={rating}
                    variant={ratingFilter === rating ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRatingFilter(rating)}
                    className="h-8 gap-1"
                  >
                    {rating}
                    <Star className="h-3 w-3 fill-current" />
                  </Button>
                ))}
              </div>

              {/* Review List */}
              <div className="space-y-4">
                {reviews.filter((review) => ratingFilter === null || review.rating === ratingFilter).length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No {ratingFilter}-star reviews yet
                  </p>
                ) : (
                  reviews
                    .filter((review) => ratingFilter === null || review.rating === ratingFilter)
                    .map((review) => (
                      <Card key={review.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={review.reviewer?.avatar_url} />
                            <AvatarFallback>
                              {review.reviewer?.first_name?.[0] || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="font-medium truncate">
                                {review.reviewer?.first_name 
                                  ? `${review.reviewer.first_name} ${review.reviewer.last_name?.[0] || ''}.`
                                  : 'Anonymous'}
                              </p>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {new Date(review.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </span>
                            </div>
                            <div className="flex gap-0.5 mb-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-3.5 w-3.5 ${
                                    star <= review.rating
                                      ? 'fill-primary text-primary'
                                      : 'text-muted-foreground/30'
                                  }`}
                                />
                              ))}
                            </div>
                            {review.comment && (
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {review.comment}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-bold">${calculateDriverPrice(spot.hourlyRate).toFixed(2)} / hour</p>
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium">
                {reviews.length > 0 ? `${getAverageRating()} (${reviews.length})` : 'New'}
              </span>
            </div>
          </div>
          {isOwnSpot ? (
            <Button size="lg" variant="outline" disabled>
              You're the host
            </Button>
          ) : userBooking ? (
            <Button size="lg" variant="secondary" onClick={() => navigate(`/booking/${userBooking.id}`)}>
              View Booking
            </Button>
          ) : mode === 'host' ? (
            <Button size="lg" variant="outline" onClick={handleBookNow}>
              Switch to Driver Mode
            </Button>
          ) : (
            <Button size="lg" onClick={handleBookNow}>
              Book Now
            </Button>
          )}
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
          </div>
        </SheetContent>
      </Sheet>

      {/* Message Host Dialog */}
      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message {spot?.host.name}</DialogTitle>
            <DialogDescription>
              Send a message to the host about this parking spot
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              placeholder="Type your message here..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={5}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setMessageDialogOpen(false)}
                disabled={sendingMessage}
              >
                Cancel
              </Button>
              <Button onClick={handleSendMessage} disabled={sendingMessage}>
                {sendingMessage ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Message'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Report Listing Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Listing</DialogTitle>
            <DialogDescription>
              Help us keep Parkzy safe by reporting inappropriate listings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <RadioGroup value={reportReason} onValueChange={setReportReason}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="inaccurate_info" id="inaccurate_info" />
                <Label htmlFor="inaccurate_info">Inaccurate information</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="misleading_photos" id="misleading_photos" />
                <Label htmlFor="misleading_photos">Misleading photos</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="scam" id="scam" />
                <Label htmlFor="scam">Suspected scam or fraud</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="unsafe" id="unsafe" />
                <Label htmlFor="unsafe">Unsafe location</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="unavailable" id="unavailable" />
                <Label htmlFor="unavailable">Spot doesn't exist or unavailable</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other">Other</Label>
              </div>
            </RadioGroup>
            <Textarea
              placeholder="Additional details (optional)"
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setReportDialogOpen(false);
                  setReportReason('');
                  setReportDetails('');
                }}
                disabled={submittingReport}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmitReport} 
                disabled={submittingReport || !reportReason}
                variant="destructive"
              >
                {submittingReport ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Report'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Guest Booking Modal */}
      <Dialog open={guestBookingModalOpen} onOpenChange={setGuestBookingModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How would you like to book?</DialogTitle>
            <DialogDescription>
              Choose to continue as a guest or sign in for faster checkout
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button
              onClick={handleGuestBooking}
              className="w-full h-14 justify-start gap-3"
              size="lg"
            >
              <User className="h-5 w-5" />
              <div className="flex flex-col items-start">
                <span className="font-medium">Continue as Guest</span>
                <span className="text-xs opacity-80">No account required</span>
              </div>
            </Button>
            <Button
              onClick={handleLoginToBook}
              variant="outline"
              className="w-full h-14 justify-start gap-3"
              size="lg"
            >
              <LogIn className="h-5 w-5" />
              <div className="flex flex-col items-start">
                <span className="font-medium">Log in or Sign up</span>
                <span className="text-xs text-muted-foreground">Faster checkout & manage bookings</span>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SpotDetail;
