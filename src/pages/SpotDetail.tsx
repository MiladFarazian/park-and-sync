import React, { useState } from 'react';
import { ArrowLeft, Heart, Share, Star, MapPin, Calendar, Navigation, MessageCircle, Phone, Camera, Wifi, Clock, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate, useParams } from 'react-router-dom';

const SpotDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Mock data - in a real app, this would come from an API
  const spot = {
    id: 1,
    title: 'Premium Downtown Garage',
    address: '123 Main St',
    hourlyRate: 8,
    rating: 4.9,
    reviewCount: 124,
    status: 'Available Now',
    images: ['/placeholder.svg', '/placeholder.svg', '/placeholder.svg', '/placeholder.svg'],
    amenities: [
      { icon: Shield, title: 'Covered Parking', subtitle: 'Protected from weather' },
      { icon: Camera, title: '24/7 Security', subtitle: 'Monitored by cameras' },
      { icon: Zap, title: 'EV Charging', subtitle: 'Level 2 charger available' },
      { icon: Wifi, title: 'WiFi Access', subtitle: 'Free wireless internet' },
      { icon: Clock, title: 'Instant Access', subtitle: 'Keyless entry system' }
    ],
    description: 'Secure covered parking in the heart of downtown. Perfect for business meetings, shopping, or exploring the city. Easy access with 24/7 security monitoring.',
    rules: [
      'Maximum vehicle height: 7 feet',
      'No overnight parking after 2 AM',
      'Keep spot clean and tidy',
      'Report any damages immediately'
    ],
    host: {
      name: 'Sarah M.',
      avatar: '/placeholder.svg',
      responseTime: 'Usually responds within 1 hour'
    },
    reviewsList: [
      {
        id: 1,
        user: 'John D.',
        avatar: '/placeholder.svg',
        rating: 5,
        date: '2 weeks ago',
        comment: 'Perfect location right in downtown. Easy access and very secure. Sarah was super responsive and helpful!'
      },
      {
        id: 2,
        user: 'Maria S.',
        avatar: '/placeholder.svg',
        rating: 5,
        date: '1 month ago',
        comment: 'Great covered parking spot. I felt very safe leaving my car here. Would definitely book again!'
      },
      {
        id: 3,
        user: 'Alex K.',
        avatar: '/placeholder.svg',
        rating: 4,
        date: '2 months ago',
        comment: 'Convenient location and fair price. The EV charging was a nice bonus. Easy check-in process.'
      }
    ]
  };

  const AmenityIcon = ({ icon: Icon, title, subtitle }: any) => (
    <div className="flex items-start gap-3 p-3">
      <div className="p-2 bg-muted rounded-lg">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Image Gallery */}
      <div className="relative h-80">
        <img 
          src={spot.images[currentImageIndex]} 
          alt={spot.title}
          className="w-full h-full object-cover"
        />
        
        {/* Header Controls */}
        <div className="absolute top-4 left-4 right-4 flex justify-between">
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
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

        {/* Image Counter */}
        <div className="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1">
          <Camera className="h-3 w-3" />
          {spot.images.length} photos
        </div>

        {/* Image Dots */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
          {spot.images.map((_, index) => (
            <button
              key={index}
              className={`w-2 h-2 rounded-full ${
                index === currentImageIndex ? 'bg-white' : 'bg-white/50'
              }`}
              onClick={() => setCurrentImageIndex(index)}
            />
          ))}
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Basic Info */}
        <div>
          <div className="flex justify-between items-start mb-2">
            <h1 className="text-2xl font-bold">{spot.title}</h1>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">${spot.hourlyRate}</p>
              <p className="text-sm text-muted-foreground">per hour</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 text-muted-foreground mb-2">
            <MapPin className="h-4 w-4" />
            <span>{spot.address}</span>
          </div>
          
            <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">{spot.rating}</span>
              <span className="text-muted-foreground">({spot.reviewCount} reviews)</span>
            </div>
            
            <Badge className="bg-green-100 text-green-800">
              {spot.status}
            </Badge>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mb-6">
            <Button className="flex-1" onClick={() => navigate(`/book/${spot.id}`)}>
              <Calendar className="h-4 w-4 mr-2" />
              Book Now
            </Button>
            <Button variant="outline" className="flex-1">
              <Navigation className="h-4 w-4 mr-2" />
              Get Directions
            </Button>
          </div>
        </div>

        {/* What this place offers */}
        <div>
          <h2 className="text-xl font-semibold mb-4">What this place offers</h2>
          <div className="space-y-1">
            {spot.amenities.map((amenity, index) => (
              <AmenityIcon key={index} {...amenity} />
            ))}
          </div>
        </div>

        {/* About this space */}
        <div>
          <h2 className="text-xl font-semibold mb-3">About this space</h2>
          <p className="text-muted-foreground leading-relaxed">{spot.description}</p>
        </div>

        {/* Host Info */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={spot.host.avatar} />
                <AvatarFallback>{spot.host.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{spot.host.name}</p>
                <p className="text-sm text-muted-foreground">Host</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm">
                <MessageCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{spot.host.responseTime}</p>
        </div>

        {/* Reviews */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Reviews ({spot.reviewCount})</h2>
            <Button variant="ghost" className="text-primary">View all</Button>
          </div>
          
          <div className="space-y-4">
            {spot.reviewsList.map((review) => (
              <div key={review.id} className="space-y-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={review.avatar} />
                    <AvatarFallback>{review.user.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{review.user}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={`h-3 w-3 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} 
                          />
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground">{review.date}</span>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground">{review.comment}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Things to know */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Things to know</h2>
          <ul className="space-y-2">
            {spot.rules.map((rule, index) => (
              <li key={index} className="flex items-start gap-2 text-muted-foreground">
                <span className="w-1 h-1 bg-muted-foreground rounded-full mt-2 flex-shrink-0"></span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">${spot.hourlyRate} / hour</p>
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium">{spot.rating} ({spot.reviewCount})</span>
            </div>
          </div>
          <Button size="lg" onClick={() => navigate(`/book/${spot.id}`)}>
            Book Now
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SpotDetail;