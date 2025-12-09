import React from 'react';
import { MapPin, Clock, Shield, DollarSign, Smartphone, Users } from 'lucide-react';

const FeaturesSection = () => {
  const features = [
    {
      icon: MapPin,
      title: "Smart Location Search",
      description: "Find parking spots near your destination with real-time availability and pricing.",
    },
    {
      icon: Clock,
      title: "Instant Booking",
      description: "Reserve your spot in seconds with our streamlined booking system.",
    },
    {
      icon: Shield,
      title: "Secure Transactions",
      description: "Protected payments with insurance coverage and dispute resolution.",
    },
    {
      icon: DollarSign,
      title: "Competitive Pricing",
      description: "Market-driven rates that save you money compared to traditional parking.",
    },
    {
      icon: Smartphone,
      title: "Mobile Experience",
      description: "Seamless check-in/out process with photo verification and GPS tracking.",
    },
    {
      icon: Users,
      title: "Trusted Community",
      description: "Verified hosts and renters with reviews and ratings for peace of mind.",
    },
  ];

  return (
    <section className="py-20 lg:py-28 bg-muted/30">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">
            Why choose Parkzy?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience the future of parking with features designed for both drivers and hosts.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
          {features.map((feature, index) => (
            <div 
              key={index} 
              className="flex gap-4 p-6 rounded-2xl bg-background border hover:shadow-lg transition-all duration-300"
            >
              <div className="flex-shrink-0">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;