import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Shield, DollarSign, Search, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { MobileTimePicker } from '@/components/booking/MobileTimePicker';
import { useNavigate } from 'react-router-dom';
import { format, addHours } from 'date-fns';
import heroImage from '@/assets/hero-parking.jpg';

const HeroSection = () => {
  const navigate = useNavigate();
  const [searchLocation, setSearchLocation] = useState('');
  const [startTime, setStartTime] = useState<Date>(addHours(new Date(), 1));
  const [endTime, setEndTime] = useState<Date>(addHours(new Date(), 3));
  const [mobileStartPickerOpen, setMobileStartPickerOpen] = useState(false);
  const [mobileEndPickerOpen, setMobileEndPickerOpen] = useState(false);

  const handleSearch = () => {
    if (!searchLocation.trim()) {
      // Default to University Park if no location entered
      navigate(`/explore?lat=34.0224&lng=-118.2851&start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=University Park, Los Angeles`);
    } else {
      // Navigate to explore page with search query
      navigate(`/explore?start=${startTime.toISOString()}&end=${endTime.toISOString()}&q=${encodeURIComponent(searchLocation)}`);
    }
  };

  const handleStartTimeChange = (date: Date) => {
    setStartTime(date);
    // If end time is before or equal to new start time, set it to 2 hours after
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
    <section className="relative min-h-screen flex items-center bg-gradient-hero">
      <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/50 to-transparent" />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold leading-tight">
                Find Parking
                <span className="block bg-gradient-primary bg-clip-text text-transparent">
                  Anywhere
                </span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg">
                Connect with local parking spot owners in your neighborhood. 
                Book instantly, park securely, earn money from your driveway.
              </p>
            </div>

            {/* Search Box */}
            <Card className="p-4 space-y-3 bg-background/95 backdrop-blur-sm">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchLocation}
                    onChange={(e) => setSearchLocation(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Where do you need parking?"
                    className="pl-10"
                  />
                </div>
                <Button onClick={handleSearch} size="lg">
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setMobileStartPickerOpen(true)}
                  className="flex-1 flex items-center gap-2 p-3 rounded-lg border bg-background hover:bg-accent transition-colors text-left"
                >
                  <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">Start</div>
                    <div className="text-sm font-medium truncate">
                      {format(startTime, 'MMM d, h:mm a')}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setMobileEndPickerOpen(true)}
                  className="flex-1 flex items-center gap-2 p-3 rounded-lg border bg-background hover:bg-accent transition-colors text-left"
                >
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">End</div>
                    <div className="text-sm font-medium truncate">
                      {format(endTime, 'MMM d, h:mm a')}
                    </div>
                  </div>
                </button>
              </div>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="outline" size="lg" className="text-lg" onClick={() => navigate('/list-spot')}>
                List Your Spot
                <DollarSign className="ml-2 h-5 w-5" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-8">
              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <Clock className="h-8 w-8 text-primary" />
                </div>
                <p className="font-semibold">Book Instantly</p>
                <p className="text-sm text-muted-foreground">Real-time availability</p>
              </div>
              
              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <p className="font-semibold">Secure Payment</p>
                <p className="text-sm text-muted-foreground">Protected transactions</p>
              </div>
              
              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <MapPin className="h-8 w-8 text-primary" />
                </div>
                <p className="font-semibold">Perfect Location</p>
                <p className="text-sm text-muted-foreground">Near your destination</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden shadow-elegant">
              <img 
                src={heroImage} 
                alt="Modern parking spot in urban setting"
                className="w-full h-[500px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" />
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