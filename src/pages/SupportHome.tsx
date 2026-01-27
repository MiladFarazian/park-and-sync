import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertTriangle, 
  Truck, 
  MessageCircle, 
  Calendar,
  ChevronRight,
  Shield,
  Clock,
  User
} from 'lucide-react';
import { format } from 'date-fns';
import { logger } from '@/lib/logger';

const log = logger.scope('SupportHome');

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter_id: string;
  spot: {
    id: string;
    title: string;
    address: string;
  };
  reporter: {
    first_name: string | null;
    last_name: string | null;
  };
}

interface TowRequest {
  id: string;
  overstay_action: string;
  overstay_detected_at: string;
  start_at: string;
  end_at: string;
  renter_id: string;
  spot: {
    id: string;
    title: string;
    address: string;
  };
  renter: {
    first_name: string | null;
    last_name: string | null;
  };
}

export default function SupportHome() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [towRequests, setTowRequests] = useState<TowRequest[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingTows, setLoadingTows] = useState(true);

  useEffect(() => {
    fetchReports();
    fetchTowRequests();
  }, []);

  const fetchReports = async () => {
    setLoadingReports(true);
    try {
      const { data, error } = await supabase
        .from('spot_reports')
        .select(`
          id, reason, details, status, created_at, reporter_id,
          spot:spots!spot_reports_spot_id_fkey (id, title, address),
          reporter:profiles!spot_reports_reporter_id_fkey (first_name, last_name)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setReports(data as unknown as Report[]);
    } catch (err) {
      log.error('Error fetching reports:', err);
    } finally {
      setLoadingReports(false);
    }
  };

  const fetchTowRequests = async () => {
    setLoadingTows(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, overstay_action, overstay_detected_at, start_at, end_at, renter_id,
          spot:spots!bookings_spot_id_fkey (id, title, address),
          renter:profiles!bookings_renter_id_fkey (first_name, last_name)
        `)
        .eq('overstay_action', 'towing')
        .order('overstay_detected_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setTowRequests(data as unknown as TowRequest[]);
    } catch (err) {
      log.error('Error fetching tow requests:', err);
    } finally {
      setLoadingTows(false);
    }
  };

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      inaccurate_info: 'Inaccurate Info',
      misleading_photos: 'Misleading Photos',
      scam: 'Potential Scam',
      unsafe: 'Unsafe Location',
      unavailable: 'Unavailable',
      other: 'Other',
    };
    return labels[reason] || reason;
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Support Dashboard</h1>
          <p className="text-muted-foreground">Priority items requiring attention</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{reports.length}</p>
                <p className="text-xs text-muted-foreground">Pending Reports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Truck className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{towRequests.length}</p>
                <p className="text-xs text-muted-foreground">Active Tows</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/support-messages')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Messages</p>
                <p className="text-xs text-muted-foreground">View all</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/support-reservations')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Reservations</p>
                <p className="text-xs text-muted-foreground">Search all</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reports Widget */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Pending Reports
            </CardTitle>
            <CardDescription>Spot reports requiring review</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            View All <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {loadingReports ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No pending reports</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div 
                  key={report.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/spot/${report.spot?.id}`)}>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">
                          {getReasonLabel(report.reason)}
                        </Badge>
                      </div>
                      <p className="font-medium truncate mt-1">{report.spot?.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Reported by {report.reporter?.first_name || 'Anonymous'} • {format(new Date(report.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/support-user/${report.reporter_id}`);
                      }}
                    >
                      <User className="h-4 w-4 mr-1" />
                      Profile
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tow Requests Widget */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-amber-500" />
              Active Tow Requests
            </CardTitle>
            <CardDescription>Vehicles flagged for towing</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTows ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : towRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No active tow requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {towRequests.map((tow) => (
                <div 
                  key={tow.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/booking/${tow.id}`)}>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-amber-500 text-white text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          Towing
                        </Badge>
                      </div>
                      <p className="font-medium truncate mt-1">{tow.spot?.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {tow.renter?.first_name} {tow.renter?.last_name} • Detected {tow.overstay_detected_at ? format(new Date(tow.overstay_detected_at), 'MMM d, h:mm a') : 'Unknown'}
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/support-user/${tow.renter_id}`);
                      }}
                    >
                      <User className="h-4 w-4 mr-1" />
                      Profile
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
