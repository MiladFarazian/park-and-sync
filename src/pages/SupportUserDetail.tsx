import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Calendar, 
  Car, 
  MapPin,
  Star,
  MessageCircle,
  AlertTriangle,
  CreditCard,
  Clock,
  User,
  Shield,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import RequireAuth from '@/components/auth/RequireAuth';
import { logger } from '@/lib/logger';

const log = logger.scope('SupportUserDetail');

interface UserProfile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  role: string;
  rating: number | null;
  review_count: number | null;
  strikes: number | null;
  kyc_status: string | null;
  email_verified: boolean | null;
  phone_verified: boolean | null;
  balance: number;
}

interface Booking {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  total_amount: number;
  hourly_rate: number;
  created_at: string;
  spot: {
    id: string;
    title: string;
    address: string;
  } | null;
  vehicle: {
    make: string | null;
    model: string | null;
    license_plate: string;
  } | null;
}

interface Vehicle {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  license_plate: string;
  size_class: string;
  is_primary: boolean | null;
}

interface Spot {
  id: string;
  title: string;
  address: string;
  status: string | null;
  hourly_rate: number;
  created_at: string;
}

const formatDisplayName = (firstName?: string | null, lastName?: string | null): string => {
  const first = firstName?.trim() || '';
  const last = lastName?.trim() || '';
  if (!first && !last) return 'Unknown User';
  return `${first} ${last}`.trim();
};

function SupportUserDetailContent() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingSpots, setLoadingSpots] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetchUserProfile();
    fetchUserBookings();
    fetchUserVehicles();
    fetchUserSpots();
  }, [userId]);

  const fetchUserProfile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setProfile(data as UserProfile);
    } catch (err) {
      log.error('Error fetching user profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserBookings = async () => {
    setLoadingBookings(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, status, start_at, end_at, total_amount, hourly_rate, created_at,
          spot:spots!bookings_spot_id_fkey (id, title, address),
          vehicle:vehicles!bookings_vehicle_id_fkey (make, model, license_plate)
        `)
        .eq('renter_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setBookings(data as unknown as Booking[]);
    } catch (err) {
      log.error('Error fetching bookings:', err);
    } finally {
      setLoadingBookings(false);
    }
  };

  const fetchUserVehicles = async () => {
    setLoadingVehicles(true);
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', userId)
        .order('is_primary', { ascending: false });

      if (error) throw error;
      setVehicles(data as Vehicle[]);
    } catch (err) {
      log.error('Error fetching vehicles:', err);
    } finally {
      setLoadingVehicles(false);
    }
  };

  const fetchUserSpots = async () => {
    setLoadingSpots(true);
    try {
      const { data, error } = await supabase
        .from('spots')
        .select('id, title, address, status, hourly_rate, created_at')
        .eq('host_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSpots(data as Spot[]);
    } catch (err) {
      log.error('Error fetching spots:', err);
    } finally {
      setLoadingSpots(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
      held: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      paid: 'bg-green-500/10 text-green-600 border-green-500/20',
      active: 'bg-primary/10 text-primary border-primary/20',
      completed: 'bg-muted text-muted-foreground border-muted',
      canceled: 'bg-destructive/10 text-destructive border-destructive/20',
      refunded: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    };
    return (
      <Badge variant="outline" className={statusColors[status] || ''}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getSpotStatusBadge = (status: string | null) => {
    if (!status) return null;
    const statusColors: Record<string, string> = {
      active: 'bg-green-500/10 text-green-600 border-green-500/20',
      inactive: 'bg-muted text-muted-foreground border-muted',
      pending_approval: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    };
    return (
      <Badge variant="outline" className={statusColors[status] || ''}>
        {status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1)}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-4xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        <Card>
          <CardContent className="p-8 text-center">
            <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">User not found</p>
            <Button className="mt-4" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">User Details</h1>
          <p className="text-muted-foreground">Support view</p>
        </div>
      </div>

      {/* Profile Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-2xl">
                {formatDisplayName(profile.first_name, profile.last_name).split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-xl font-bold">
                  {formatDisplayName(profile.first_name, profile.last_name)}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant="outline" className="capitalize">
                    {profile.role}
                  </Badge>
                  {profile.strikes && profile.strikes > 0 && (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {profile.strikes} strike{profile.strikes > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {profile.kyc_status && (
                    <Badge 
                      variant="outline"
                      className={
                        profile.kyc_status === 'verified' 
                          ? 'bg-green-500/10 text-green-600 border-green-500/20'
                          : profile.kyc_status === 'pending'
                          ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                          : 'bg-muted text-muted-foreground'
                      }
                    >
                      <Shield className="h-3 w-3 mr-1" />
                      KYC: {profile.kyc_status}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{profile.email || 'No email'}</span>
                  {profile.email_verified ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{profile.phone || 'No phone'}</span>
                  {profile.phone_verified ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Joined {format(new Date(profile.created_at), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Star className="h-4 w-4" />
                  <span>
                    {profile.rating ? `${profile.rating.toFixed(1)} rating` : 'No rating'} 
                    {profile.review_count ? ` (${profile.review_count} reviews)` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CreditCard className="h-4 w-4" />
                  <span>Balance: ${profile.balance.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate(`/support-messages?userId=${userId}`)}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Message User
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Bookings, Vehicles, Spots */}
      <Tabs defaultValue="bookings" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="bookings">
            Bookings ({bookings.length})
          </TabsTrigger>
          <TabsTrigger value="vehicles">
            Vehicles ({vehicles.length})
          </TabsTrigger>
          <TabsTrigger value="spots">
            Spots ({spots.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Booking History</CardTitle>
              <CardDescription>Recent bookings made by this user</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingBookings ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : bookings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No bookings found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings.map((booking) => (
                    <div 
                      key={booking.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/booking/${booking.id}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusBadge(booking.status)}
                          <span className="text-sm font-medium">${booking.total_amount.toFixed(2)}</span>
                        </div>
                        <p className="font-medium truncate">{booking.spot?.title || 'Unknown Spot'}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(booking.start_at), 'MMM d, h:mm a')}
                          </span>
                          {booking.vehicle && (
                            <span className="flex items-center gap-1">
                              <Car className="h-3 w-3" />
                              {booking.vehicle.make} {booking.vehicle.model}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vehicles" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Registered Vehicles</CardTitle>
              <CardDescription>Vehicles registered to this user</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingVehicles ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : vehicles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Car className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No vehicles registered</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {vehicles.map((vehicle) => (
                    <div 
                      key={vehicle.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <Car className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                            {vehicle.is_primary && (
                              <Badge variant="secondary" className="ml-2 text-xs">Primary</Badge>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {vehicle.license_plate} • {vehicle.color} • {vehicle.size_class}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spots" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Listed Spots</CardTitle>
              <CardDescription>Parking spots listed by this user</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSpots ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : spots.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No spots listed</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {spots.map((spot) => (
                    <div 
                      key={spot.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/spot/${spot.id}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getSpotStatusBadge(spot.status)}
                          <span className="text-sm font-medium">${spot.hourly_rate}/hr</span>
                        </div>
                        <p className="font-medium truncate">{spot.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{spot.address}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SupportUserDetail() {
  return (
    <RequireAuth>
      <SupportUserDetailContent />
    </RequireAuth>
  );
}
