import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Shield, Calendar, ChevronRight } from 'lucide-react';
import { MobileTimePicker } from '@/components/booking/MobileTimePicker';
import { useNavigate } from 'react-router-dom';
import { format, addHours } from 'date-fns';
import heroImage from '@/assets/hero-parking.jpg';
import LocationSearchInput from '@/components/ui/location-search-input';

const HeroSection = () => {
  const navigate = useNavigate();
  const [searchLocation, setSearchLocation] = useState('');
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(false);
  const [startTime, setStartTime] = useState<Date>(addHours(new Date(), 1));
  const [endTime, setEndTime] = useState<Date>(addHours(new Date(), 3));
  const [mobileStartPickerOpen, setMobileStartPickerOpen] = useState(false);
  const [mobileEndPickerOpen, setMobileEndPickerOpen] = useState(false);

  const handleSelectLocation = (location: { lat: number; lng: number; name: string }) => {
    setSearchCoords({ lat: location.lat, lng: location.lng });
    const isCurrentLoc = location.name === 'Current location' || location.name === 'Current Location';
    setSearchLocation(isCurrentLoc ? 'Current Location' : location.name);
    setIsUsingCurrentLocation(isCurrentLoc);
  };

  const handleClearLocation = () => {
    setSearchCoords(null);
    setSearchLocation('');
    setIsUsingCurrentLocation(false);
  };

  const handleSearch = () => {
    if (searchCoords) {
      navigate(`/explore?lat=${searchCoords.lat}&lng=${searchCoords.lng}&start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=${encodeURIComponent(searchLocation || 'Current location')}`);
    } else if (searchLocation.trim()) {
      navigate(`/explore?start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=${encodeURIComponent(searchLocation)}`);
    } else {
      navigate(`/explore?lat=34.0224&lng=-118.2851&start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=University Park, Los Angeles`);
    }
  };

  const handleStartTimeChange = (date: Date) => {
    setStartTime(date);
    if (endTime <= date) {
      setEndTime(new Date(date.getTime() + 2 * 60 * 60 * 1000));
    }
  };

  const handleEndTimeChange = (date: Date) => {
    if (date > startTime) {
      setEndTime(date);
    }
  };

  return (
    <section className="relative min-h-[calc(100vh-64px)] flex items-center bg-background">
      <div className="container mx-auto px-6 py-12 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Content */}
          <div className="space-y-8 lg:space-y-10">
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
                Parking, for the people
                <span className="block text-foreground">wherever you go</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg">
                Book affordable parking near your destination in seconds. Compare prices and reserve your spot today.
              </p>
            </div>

            {/* Search Box - SpotHero Style */}
            <div className="bg-card border rounded-2xl p-6 space-y-4 shadow-lg">
              {/* Location Input */}
              <LocationSearchInput
                value={searchLocation}
                onChange={setSearchLocation}
                onSelectLocation={handleSelectLocation}
                onClear={handleClearLocation}
                isUsingCurrentLocation={isUsingCurrentLocation}
                placeholder="Where are you going?"
                inputClassName="h-14 text-base border-muted bg-muted/30 rounded-xl"
              />

              {/* Time Selection */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMobileStartPickerOpen(true)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-muted bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-medium">Start time</div>
                    <div className="text-sm font-semibold truncate">
                      {format(startTime, 'MMM d, h:mm a')}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setMobileEndPickerOpen(true)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-muted bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-medium">End time</div>
                    <div className="text-sm font-semibold truncate">
                      {format(endTime, 'MMM d, h:mm a')}
                    </div>
                  </div>
                </button>
              </div>

              {/* Search Button */}
              <Button
                onClick={handleSearch}
                size="lg"
                className="w-full h-14 text-base font-semibold rounded-xl"
              >
                Find Parking Spots
              </Button>
            </div>

            {/* List Your Spot CTA */}
            <button
              onClick={() => navigate('/list-spot')}
              className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-medium"
            >
              <span>Earn money by listing your parking spot</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Right: Hero Image */}
          <div className="relative hidden lg:block">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl">
              <img
                src={heroImage}
                alt="Modern parking spot in urban setting"
                className="w-full h-[560px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>

            {/* Floating Stats Card */}
            <div className="absolute -bottom-6 -left-6 bg-card border rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">10+</p>
                  <p className="text-sm text-muted-foreground">Secure bookings</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Benefits Row - Desktop */}
        <div className="hidden lg:grid grid-cols-3 gap-8 mt-20 pt-12 border-t">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Book Instantly</p>
              <p className="text-sm text-muted-foreground">Real-time availability updates</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Secure Payment</p>
              <p className="text-sm text-muted-foreground">Protected transactions</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Perfect Location</p>
              <p className="text-sm text-muted-foreground">Near your destination</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Time Pickers */}
      {mobileStartPickerOpen && (
        <MobileTimePicker
          isOpen={mobileStartPickerOpen}
          onClose={() => setMobileStartPickerOpen(false)}
          onConfirm={(date) => {
            handleStartTimeChange(date);
            setMobileStartPickerOpen(false);
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
    </section>
  );
};

export default HeroSection;
