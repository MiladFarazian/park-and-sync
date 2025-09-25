import React, { useState } from 'react';
import { MapPin, Search as SearchIcon, Calendar, Clock, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Search = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [searchLocation, setSearchLocation] = useState('University Park, Los Angeles');
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);

  // LA neighborhoods and areas
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
    'Woodland Hills',
    'Canoga Park',
    'Reseda',
    'Van Nuys',
    'Northridge',
    'Granada Hills',
    'Chatsworth',
    'San Fernando',
    'Pacoima',
    'Sun Valley',
    'Sylmar',
    'Mission Hills',
    'Arleta',
    'Panorama City',
    'Valley Glen',
    'Valley Village'
  ];

  // Set default dates
  React.useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    setCheckInDate(now.toISOString().split('T')[0]);
    setCheckOutDate(tomorrow.toISOString().split('T')[0]);
  }, []);

  // Handle search input changes
  const handleSearchChange = (value: string) => {
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
  };

  // Handle suggestion selection
  const handleSuggestionClick = (suggestion: string) => {
    setSearchLocation(suggestion);
    setShowSuggestions(false);
  };

  const stats = [
    { value: '4', label: 'Spots Available' },
    { value: '$6', label: 'Average Price' },
    { value: '2 min', label: 'Average Walk' }
  ];

  const recentlyViewed = [
    {
      id: 1,
      title: 'Premium Downtown Garage',
      address: '123 Main St',
      hourlyRate: 8,
      rating: 4.9,
      reviews: 124,
      status: 'Available Now',
      image: '/placeholder.svg'
    },
    {
      id: 2,
      title: 'Safe Residential Driveway',
      address: '456 Oak Ave',
      hourlyRate: 5,
      rating: 4.8,
      reviews: 89,
      status: 'Available in 30 min',
      image: '/placeholder.svg'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 pt-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">P</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Parkway</h1>
              <p className="text-muted-foreground text-sm">Find parking in seconds</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6 text-muted-foreground" />
            {user ? (
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback>
                  {profile?.first_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            ) : (
              <Button variant="outline" onClick={() => navigate('/auth')}>
                Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Where Section */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Where</h2>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5 z-10" />
            <Input 
              value={searchLocation}
              onChange={(e) => handleSearchChange(e.target.value)}
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
                // Delay hiding suggestions to allow for clicks
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              className="pl-12 h-14 text-lg border-0 bg-muted/30"
              placeholder="Search Los Angeles neighborhoods..."
            />
            
            {/* Suggestions Dropdown */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredSuggestions.slice(0, 8).map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
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
        </div>

        {/* Check-in/Check-out */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Check-in</p>
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <input 
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                className="bg-transparent border-none text-sm flex-1 outline-none"
              />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Check-out</p>
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <input 
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
                className="bg-transparent border-none text-sm flex-1 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Find Parking Button */}
        <Button 
          className="w-full h-14 text-lg mt-6" 
          onClick={() => {
            if (!user) {
              navigate('/auth');
              return;
            }
            // Pass search parameters via URL
            const params = new URLSearchParams({
              location: searchLocation,
              checkIn: checkInDate,
              checkOut: checkOutDate
            });
            navigate(`/search-results?${params.toString()}`);
          }}
        >
          <SearchIcon className="h-5 w-5 mr-2" />
          Find Parking
        </Button>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 mt-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <p className="text-2xl font-bold text-primary">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recently Viewed */}
      <div className="px-4 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Recently Viewed</h2>
          <Button variant="ghost" className="text-primary">View All</Button>
        </div>
        
        <div className="space-y-3">
          {recentlyViewed.map((spot) => (
            <Card 
              key={spot.id} 
              className="p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/spot/${spot.id}`)}
            >
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-lg bg-muted flex-shrink-0">
                  <img 
                    src={spot.image} 
                    alt={spot.title}
                    className="w-full h-full object-cover rounded-lg"
                  />
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold">{spot.title}</h3>
                    <div className="text-right">
                      <p className="font-bold text-primary">${spot.hourlyRate}/hr</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{spot.address}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-500">★</span>
                      <span className="font-medium text-sm">{spot.rating}</span>
                      <span className="text-muted-foreground text-sm">({spot.reviews})</span>
                    </div>
                    
                    <Badge 
                      variant={spot.status === 'Available Now' ? 'default' : 'secondary'}
                      className={spot.status === 'Available Now' ? 'bg-green-100 text-green-800' : ''}
                    >
                      {spot.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Search;