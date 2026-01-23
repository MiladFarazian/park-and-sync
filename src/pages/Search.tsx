import React, { useState } from 'react';
import { MapPin, Search as SearchIcon, Calendar, Clock, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { TimePicker } from '@/components/ui/time-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { calculateDriverPrice } from '@/lib/pricing';
import { PLACEHOLDER_IMAGE } from '@/lib/constants';

const Search = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [searchLocation, setSearchLocation] = useState('University Park, Los Angeles');
  const [checkInDate, setCheckInDate] = useState<Date>(new Date());
  const [checkOutDate, setCheckOutDate] = useState<Date>(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);

  // Validate that end time is after start time
  const isValidTimeRange = checkOutDate.getTime() >= checkInDate.getTime();

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
    { value: '25+', label: 'Spots Available' },
    { value: '$10', label: 'Average Price' },
    { value: '3 min', label: 'Average Walk' }
  ];

  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Fetch recently viewed spots on component mount
  React.useEffect(() => {
    fetchRecentSpots();
  }, []);

  const fetchRecentSpots = async () => {
    try {
      setLoadingRecent(true);
      // Get a few random spots to show as "recently viewed"
      const { data: spots, error } = await supabase
        .from('spots')
        .select(`
          id,
          title,
          address,
          hourly_rate,
          profiles!spots_host_id_fkey (
            rating,
            review_count
          ),
          spot_photos (
            url,
            is_primary
          )
        `)
        .eq('status', 'active')
        .limit(2);

      if (error) {
        console.error('Error fetching recent spots:', error);
        return;
      }

      const transformedSpots = spots?.map((spot: any) => ({
        id: spot.id,
        title: spot.title,
        address: spot.address,
        hourlyRate: calculateDriverPrice(parseFloat(spot.hourly_rate)),
        rating: parseFloat(spot.profiles?.rating || 4.5),
        reviews: spot.profiles?.review_count || 0,
        status: 'Available Now',
        image: spot.spot_photos?.find((p: any) => p.is_primary)?.url || PLACEHOLDER_IMAGE
      })) || [];

      setRecentlyViewed(transformedSpots);
    } catch (err) {
      console.error('Error fetching recent spots:', err);
    } finally {
      setLoadingRecent(false);
    }
  };

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
        <div className="space-y-4 mt-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Start</p>
            <div className="grid grid-cols-2 gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg hover:bg-muted/40 transition-colors">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {format(checkInDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                        ? 'Today'
                        : format(checkInDate, 'MMM dd, yyyy')}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={checkInDate}
                    onSelect={(date) => {
                      if (date) {
                        const newDate = new Date(date);
                        newDate.setHours(checkInDate.getHours());
                        newDate.setMinutes(checkInDate.getMinutes());
                        setCheckInDate(newDate);
                        
                        // Ensure end time is still after start time
                        if (newDate.getTime() >= checkOutDate.getTime()) {
                          const newEndDate = new Date(newDate);
                          newEndDate.setHours(newEndDate.getHours() + 1);
                          setCheckOutDate(newEndDate);
                        }
                      }
                    }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              
              <TimePicker 
                date={checkInDate} 
                setDate={(newDate) => {
                  const updatedDate = new Date(checkInDate);
                  updatedDate.setHours(newDate.getHours());
                  updatedDate.setMinutes(newDate.getMinutes());
                  setCheckInDate(updatedDate);
                  
                  // Ensure end time is still after start time
                  if (updatedDate.getTime() >= checkOutDate.getTime()) {
                    const newEndDate = new Date(updatedDate);
                    newEndDate.setHours(newEndDate.getHours() + 1);
                    setCheckOutDate(newEndDate);
                  }
                }}
              >
                <button className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg hover:bg-muted/40 transition-colors">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{format(checkInDate, 'h:mm a')}</span>
                </button>
              </TimePicker>
            </div>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">End</p>
            <div className="grid grid-cols-2 gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg hover:bg-muted/40 transition-colors">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {format(checkOutDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                        ? 'Today'
                        : format(checkOutDate, 'MMM dd, yyyy')}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={checkOutDate}
                    onSelect={(date) => {
                      if (date) {
                        const newDate = new Date(date);
                        newDate.setHours(checkOutDate.getHours());
                        newDate.setMinutes(checkOutDate.getMinutes());
                        
                        // Only update if it's after start time
                        if (newDate.getTime() >= checkInDate.getTime()) {
                          setCheckOutDate(newDate);
                        }
                      }
                    }}
                    disabled={(date) => date < checkInDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              
              <TimePicker 
                date={checkOutDate} 
                setDate={(newDate) => {
                  const updatedDate = new Date(checkOutDate);
                  updatedDate.setHours(newDate.getHours());
                  updatedDate.setMinutes(newDate.getMinutes());
                  
                  // Only update if it's after start time
                  if (updatedDate.getTime() >= checkInDate.getTime()) {
                    setCheckOutDate(updatedDate);
                  }
                }}
              >
                <button className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg hover:bg-muted/40 transition-colors">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{format(checkOutDate, 'h:mm a')}</span>
                </button>
              </TimePicker>
            </div>
          </div>
        </div>

        {/* Find Parking Button */}
        <Button 
          className="w-full h-14 text-lg mt-6"
          disabled={!isValidTimeRange}
          onClick={() => {
            if (!user) {
              navigate('/auth');
              return;
            }
            // Pass search parameters via URL
            const params = new URLSearchParams({
              location: searchLocation,
              checkIn: checkInDate.toISOString(),
              checkOut: checkOutDate.toISOString()
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
          {loadingRecent ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground">Loading spots...</p>
              </div>
            </div>
          ) : recentlyViewed.length > 0 ? (
            recentlyViewed.map((spot) => (
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
                      <div className="flex-1">
                        {spot.category && (
                          <Badge variant="secondary" className="text-xs px-2 py-0.5 mb-1">
                            {spot.category}
                          </Badge>
                        )}
                      </div>
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
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No recent spots to show</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Search;