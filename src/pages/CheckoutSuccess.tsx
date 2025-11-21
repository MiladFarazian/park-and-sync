import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const bookingIdParam = searchParams.get('booking_id');

    if (!sessionId || !bookingIdParam) {
      toast({
        title: "Error",
        description: "Invalid confirmation link",
        variant: "destructive",
      });
      navigate('/');
      return;
    }

    setBookingId(bookingIdParam);

    // Wait a moment for webhook to process
    const timer = setTimeout(async () => {
      try {
        // Verify booking status
        const { data: booking, error } = await supabase
          .from('bookings')
          .select('status')
          .eq('id', bookingIdParam)
          .single();

        if (error) throw error;

        if (booking.status === 'active') {
          setLoading(false);
        } else {
          // Still pending, check again shortly
          setTimeout(() => setLoading(false), 2000);
        }
      } catch (error) {
        console.error('Error checking booking status:', error);
        setLoading(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [searchParams, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md w-full">
          <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Processing Payment</h2>
          <p className="text-muted-foreground">
            Please wait while we confirm your booking...
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="p-8 text-center max-w-md w-full">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Booking Confirmed!</h2>
        <p className="text-muted-foreground mb-6">
          Your parking spot has been successfully reserved and payment confirmed.
        </p>
        <div className="space-y-3">
          <Button 
            onClick={() => navigate(`/booking/${bookingId}`)}
            className="w-full"
          >
            View Booking Details
          </Button>
          <Button 
            onClick={() => navigate('/activity')}
            variant="outline"
            className="w-full"
          >
            Go to Activity
          </Button>
        </div>
      </Card>
    </div>
  );
}
