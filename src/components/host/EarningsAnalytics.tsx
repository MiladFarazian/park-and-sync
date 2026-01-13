import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, addDays } from 'date-fns';

interface EarningData {
  date: string;
  earnings: number;
}

const EarningsAnalytics = () => {
  const { user } = useAuth();
  const [dailyData, setDailyData] = useState<EarningData[]>([]);
  const [weeklyData, setWeeklyData] = useState<EarningData[]>([]);
  const [averageDaily, setAverageDaily] = useState(0);
  const [averageWeekly, setAverageWeekly] = useState(0);
  const [nextPayoutDate, setNextPayoutDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchEarningsData();
    }
  }, [user]);

  const fetchEarningsData = async () => {
    try {
      setLoading(true);

      // Fetch user's spots
      const { data: spotsData, error: spotsError } = await supabase
        .from('spots')
        .select('id')
        .eq('host_id', user?.id);

      if (spotsError) throw spotsError;

      const spotIds = spotsData?.map(s => s.id) || [];

      if (spotIds.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch completed bookings from the last 30 days
      const thirtyDaysAgo = subDays(new Date(), 30);
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('host_earnings, total_amount, end_at, created_at')
        .in('spot_id', spotIds)
        .eq('status', 'completed')
        .gte('end_at', thirtyDaysAgo.toISOString());

      if (bookingsError) throw bookingsError;

      // Process daily earnings for the last 14 days
      const last14Days = eachDayOfInterval({
        start: subDays(new Date(), 13),
        end: new Date(),
      });

      const dailyEarnings: EarningData[] = last14Days.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayEarnings = bookings?.filter(b => {
          const bookingDate = format(new Date(b.end_at), 'yyyy-MM-dd');
          return bookingDate === dayStr;
        }).reduce((sum, b) => {
          return sum + Number(b.host_earnings || 0);
        }, 0) || 0;

        return {
          date: format(day, 'MMM d'),
          earnings: dayEarnings,
        };
      });

      setDailyData(dailyEarnings);

      // Process weekly earnings for the last 8 weeks
      const weeklyEarnings: EarningData[] = [];
      for (let i = 7; i >= 0; i--) {
        const weekStart = startOfWeek(subDays(new Date(), i * 7));
        const weekEnd = endOfWeek(subDays(new Date(), i * 7));
        
        const weekEarnings = bookings?.filter(b => {
          const bookingDate = new Date(b.end_at);
          return bookingDate >= weekStart && bookingDate <= weekEnd;
        }).reduce((sum, b) => {
          return sum + Number(b.host_earnings || 0);
        }, 0) || 0;

        weeklyEarnings.push({
          date: format(weekStart, 'MMM d'),
          earnings: weekEarnings,
        });
      }

      setWeeklyData(weeklyEarnings);

      // Calculate averages
      const totalDailyEarnings = dailyEarnings.reduce((sum, d) => sum + d.earnings, 0);
      const avgDaily = totalDailyEarnings / 14;
      setAverageDaily(avgDaily);

      const totalWeeklyEarnings = weeklyEarnings.reduce((sum, w) => sum + w.earnings, 0);
      const avgWeekly = totalWeeklyEarnings / 8;
      setAverageWeekly(avgWeekly);

      // Stripe typically pays out on a rolling basis, usually within 2-7 business days
      // Set next payout date to next Monday (typical payout schedule)
      const today = new Date();
      const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
      setNextPayoutDate(addDays(today, daysUntilMonday));

    } catch (error) {
      console.error('Error fetching earnings data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-1/4"></div>
          <div className="h-48 bg-muted rounded"></div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Payout Info Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs">Avg Daily</span>
          </div>
          <p className="text-xl font-bold">${averageDaily.toFixed(2)}</p>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs">Avg Weekly</span>
          </div>
          <p className="text-xl font-bold">${averageWeekly.toFixed(2)}</p>
        </Card>
      </div>

      {nextPayoutDate && (
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-sm">
              Next payout: <span className="font-semibold">{format(nextPayoutDate, 'EEEE, MMM d')}</span>
            </span>
          </div>
        </Card>
      )}

      {/* Earnings Chart */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Earnings Overview</h3>
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="daily">Daily (14 days)</TabsTrigger>
            <TabsTrigger value="weekly">Weekly (8 weeks)</TabsTrigger>
          </TabsList>
          
          <TabsContent value="daily" className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }} 
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10 }} 
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Earnings']}
                />
                <Area 
                  type="monotone" 
                  dataKey="earnings" 
                  stroke="hsl(var(--primary))" 
                  fillOpacity={1} 
                  fill="url(#colorEarnings)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>
          
          <TabsContent value="weekly" className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData}>
                <defs>
                  <linearGradient id="colorWeeklyEarnings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }} 
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10 }} 
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Earnings']}
                />
                <Area 
                  type="monotone" 
                  dataKey="earnings" 
                  stroke="hsl(var(--primary))" 
                  fillOpacity={1} 
                  fill="url(#colorWeeklyEarnings)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

export default EarningsAnalytics;
