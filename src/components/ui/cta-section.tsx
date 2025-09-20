import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const CTASection = () => {
  return (
    <section className="py-24 bg-gradient-hero">
      <div className="container mx-auto px-6 text-center">
        <div className="max-w-3xl mx-auto space-y-8">
          <h2 className="text-4xl lg:text-5xl font-bold">
            Ready to Transform Your
            <span className="block bg-gradient-primary bg-clip-text text-transparent">
              Parking Experience?
            </span>
          </h2>
          
          <p className="text-xl text-muted-foreground">
            Join thousands of users who've discovered smarter, more affordable parking solutions.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" size="lg" className="text-lg">
              Get Started Today
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button variant="outline" size="lg" className="text-lg">
              Learn More
            </Button>
          </div>

          <div className="pt-8 border-t border-border/20">
            <p className="text-sm text-muted-foreground">
              Connect to Supabase to enable full functionality including user accounts, 
              real-time booking, payments, and more.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;