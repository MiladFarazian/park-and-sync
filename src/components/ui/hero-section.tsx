import React from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Clock, Shield, DollarSign } from 'lucide-react';
import heroImage from '@/assets/hero-parking.jpg';

const HeroSection = () => {
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

            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="hero" size="lg" className="text-lg">
                Find Parking
                <MapPin className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg" className="text-lg">
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
    </section>
  );
};

export default HeroSection;