import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            Why Choose Our Platform?
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Experience the future of parking with features designed for both hosts and renters.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 p-3 bg-gradient-primary rounded-full w-fit">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;