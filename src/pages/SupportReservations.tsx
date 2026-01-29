import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  Calendar as CalendarIcon,
  ChevronRight,
  Filter,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { logger } from '@/lib/logger';
import { getBookingStatus, getBookingStatusColor } from '@/lib/bookingStatus';

const log = logger.scope('SupportReservations');

interface Reservation {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  total_amount: number;
  spot: {
    id: string;
    title: string;
    address: string;
    instant_book: boolean;
  };
  renter: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
}

type BookingStatus = 'all' | 'pending' | 'held' | 'paid' | 'active' | 'completed' | 'canceled' | 'refunded';

export default function SupportReservations() {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus>('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchReservations();
  }, [debouncedSearch, statusFilter]);

  const fetchReservations = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('bookings')
        .select(`
          id, status, start_at, end_at, total_amount,
          spot:spots!bookings_spot_id_fkey (id, title, address, instant_book),
          renter:profiles!bookings_renter_id_fkey (user_id, first_name, last_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Client-side search filtering
      let filtered = data as unknown as Reservation[];
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        filtered = filtered.filter((r) => 
          r.spot?.title?.toLowerCase().includes(searchLower) ||
          r.spot?.address?.toLowerCase().includes(searchLower) ||
          r.renter?.first_name?.toLowerCase().includes(searchLower) ||
          r.renter?.last_name?.toLowerCase().includes(searchLower) ||
          r.renter?.email?.toLowerCase().includes(searchLower) ||
          r.id.toLowerCase().includes(searchLower)
        );
      }

      setReservations(filtered);
    } catch (err) {
      log.error('Error fetching reservations:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeForBooking = (res: Reservation) => {
    const { label } = getBookingStatus({
      status: res.status,
      instantBook: res.spot?.instant_book ?? true,
      startAt: res.start_at,
      endAt: res.end_at,
      isHost: false, // Support views from neutral perspective
    });
    const colorClass = getBookingStatusColor(label);
    return (
      <Badge variant="outline" className={colorClass}>
        {label}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">All Reservations</h1>
        <p className="text-muted-foreground">Search and view all platform reservations</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by spot, user, email, or booking ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
              {search && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setSearch('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as BookingStatus)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="held">Held</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Reservations
          </CardTitle>
          <CardDescription>
            {reservations.length} reservation{reservations.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : reservations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No reservations found</p>
              {(search || statusFilter !== 'all') && (
                <Button 
                  variant="link" 
                  onClick={() => { setSearch(''); setStatusFilter('all'); }}
                  className="mt-2"
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {reservations.map((res) => (
                <div 
                  key={res.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/booking/${res.id}`)}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadgeForBooking(res)}
                      <span className="text-xs text-muted-foreground font-mono">
                        {res.id.slice(0, 8)}...
                      </span>
                    </div>
                    <p className="font-medium truncate">{res.spot?.title}</p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{res.renter?.first_name} {res.renter?.last_name}</span>
                      <span className="hidden sm:inline">•</span>
                      <span className="hidden sm:inline">{res.renter?.email}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{format(new Date(res.start_at), 'MMM d, h:mm a')} → {format(new Date(res.end_at), 'h:mm a')}</span>
                      <span className="font-medium text-foreground">${(res.total_amount / 100).toFixed(2)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
