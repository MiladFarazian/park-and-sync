import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Car, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMode } from '@/contexts/ModeContext';

const CTASection = () => {
  const navigate = useNavigate();
  const { setMode } = useMode();
  
  return (
    <section className="py-20 lg:py-28">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Driver CTA */}
          <div className="relative overflow-hidden rounded-3xl bg-primary p-8 lg:p-12 text-primary-foreground">
            <div className="relative z-10">
              <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center mb-6">
                <Car className="h-7 w-7" />
              </div>
              <h3 className="text-2xl lg:text-3xl font-bold mb-4">
                Find your perfect spot
              </h3>
              <p className="text-primary-foreground/80 mb-8 max-w-md">
                Search thousands of parking spots near your destination. Book in seconds and save money.
              </p>
              <Button 
                variant="secondary" 
                size="lg" 
                className="font-semibold"
                onClick={() => navigate('/explore')}
              >
                Search Parking
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
            <div className="absolute right-0 bottom-0 opacity-10">
              <Car className="h-64 w-64" />
            </div>
          </div>

          {/* Host CTA */}
          <div className="relative overflow-hidden rounded-3xl bg-accent p-8 lg:p-12 text-accent-foreground">
            <div className="relative z-10">
              <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center mb-6">
                <Home className="h-7 w-7" />
              </div>
              <h3 className="text-2xl lg:text-3xl font-bold mb-4">
                Earn money with your space
              </h3>
              <p className="text-accent-foreground/80 mb-8 max-w-md">
                Turn your empty driveway or parking space into extra income. List for free and start earning.
              </p>
              <Button 
                variant="secondary" 
                size="lg" 
                className="font-semibold"
                onClick={() => {
                  navigate('/list-spot', { replace: true });
                  setMode('host', false);
                }}
              >
                List Your Spot
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
            <div className="absolute right-0 bottom-0 opacity-10">
              <Home className="h-64 w-64" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;