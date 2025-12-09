import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Shield, DollarSign, Search, Calendar, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MobileTimePicker } from '@/components/booking/MobileTimePicker';
import { useNavigate } from 'react-router-dom';
import { format, addHours } from 'date-fns';
import heroImage from '@/assets/hero-parking.jpg';

// LA neighborhoods for autofill
const laNeighborhoods = [
  'University Park, Los Angeles',
  'Downtown Los Angeles',
  'West Hollywood',
  'Santa Monica',
  'Beverly Hills',
  'Venice',
  'Manhattan Beach',
  'Hermosa Beach',
  'Redondo Beach',
  'El Segundo',
  'Culver City',
  'Marina del Rey',
  'Playa del Rey',
  'Westwood',
  'Brentwood',
  'Pacific Palisades',
  'Malibu',
  'Hollywood',
  'West Adams',
  'Mid-City',
  'Koreatown',
  'Los Feliz',
  'Silver Lake',
  'Echo Park',
  'East Los Angeles',
  'Boyle Heights',
  'South Park',
  'Arts District',
  'Little Tokyo',
  'Chinatown',
  'Griffith Park',
  'Atwater Village',
  'Glendale',
  'Pasadena',
  'Burbank',
  'North Hollywood',
  'Studio City',
  'Sherman Oaks',
  'Encino',
  'Tarzana',
  'Woodland Hills'
];

const HeroSection = () => {
  const navigate = useNavigate();
  const [searchLocation, setSearchLocation] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<Date>(addHours(new Date(), 1));
  const [endTime, setEndTime] = useState<Date>(addHours(new Date(), 3));
  const [mobileStartPickerOpen, setMobileStartPickerOpen] = useState(false);
  const [mobileEndPickerOpen, setMobileEndPickerOpen] = useState(false);

  const handleSearch = () => {
    if (!searchLocation.trim()) {
      navigate(`/explore?lat=34.0224&lng=-118.2851&start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=University Park, Los Angeles`);
    } else {
      navigate(`/explore?start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=${encodeURIComponent(searchLocation)}`);
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
                Parking made easy,
                <span className="block text-foreground">wherever you go</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg">
                Book affordable parking near your destination in seconds. Compare prices and reserve your spot today.
              </p>
            </div>

            {/* Search Box - SpotHero Style */}
            <div className="bg-card border rounded-2xl p-6 space-y-4 shadow-lg">
              {/* Location Input with Autofill */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none z-10" />
                <Input
                  value={searchLocation}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchLocation(value);
                    if (value.length > 0) {
                      const filtered = laNeighborhoods.filter(neighborhood =>
                        neighborhood.toLowerCase().includes(value.toLowerCase())
                      );
                      setFilteredSuggestions(filtered);
                      setShowSuggestions(true);
                    } else {
                      setShowSuggestions(false);
                    }
                  }}
                  onFocus={() => {
                    if (searchLocation.length > 0) {
                      const filtered = laNeighborhoods.filter(neighborhood =>
                        neighborhood.toLowerCase().includes(searchLocation.toLowerCase())
                      );
                      setFilteredSuggestions(filtered);
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Where are you going?"
                  className="pl-12 h-14 text-base border-muted bg-muted/30 rounded-xl"
                />
                
                {/* Suggestions Dropdown */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredSuggestions.slice(0, 8).map((suggestion, index) => (
                      <button
                        key={index}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchLocation(suggestion);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0 focus:outline-none focus:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{suggestion}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
              <Button onClick={handleSearch} size="lg" className="w-full h-14 text-base font-semibold rounded-xl">
                Find Parking Spots
              </Button>
            </div>

            {/* List Your Spot CTA */}
            <button 
              onClick={() => navigate('/list-spot')}
              className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-medium"
            >
              <DollarSign className="h-5 w-5" />
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
                  <p className="text-2xl font-bold">10K+</p>
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