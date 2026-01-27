import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";

const log = logger.scope('CheckoutSuccess');

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "active" | "error">("pending");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const bookingIdParam = searchParams.get("booking_id");

    if (!sessionId || !bookingIdParam) {
      toast({
        title: "Error",
        description: "Invalid confirmation link",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    setBookingId(bookingIdParam);

    let attempts = 0;
    const maxAttempts = 10; // ~20 seconds total (2s * 10)

    const checkStatus = async () => {
      try {
        const { data: booking, error } = await supabase
          .from("bookings")
          .select("status")
          .eq("id", bookingIdParam)
          .single();

        if (error) throw error;

        if (booking.status === "active") {
          setStatus("active");
          setLoading(false);
          return;
        }

        attempts += 1;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 2000);
        } else {
          log.error("Booking did not become active in time", {
            bookingId: bookingIdParam,
            status: booking.status,
          });
          setStatus("error");
          setErrorMessage(
            "Your payment was processed, but we could not confirm the booking. Please check your Activity or try again.",
          );
          setLoading(false);
        }
      } catch (error) {
        log.error("Error checking booking status:", error);
        attempts += 1;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 2000);
        } else {
          setStatus("error");
          setErrorMessage("We could not verify your booking status. Please check your Activity page.");
          setLoading(false);
        }
      }
    };

    // Initial slight delay to give webhooks time to run
    const initialTimer = setTimeout(checkStatus, 2000);

    return () => {
      clearTimeout(initialTimer);
    };
  }, [searchParams, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md w-full">
          <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Processing Payment</h2>
          <p className="text-muted-foreground">Please wait while we confirm your booking...</p>
        </Card>
      </div>
    );
  }

  const isSuccess = status === "active";

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="p-8 text-center max-w-md w-full">
        {isSuccess ? (
          <>
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Booking Confirmed!</h2>
            <p className="text-muted-foreground mb-6">
              Your parking spot has been successfully reserved and payment confirmed.
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Payment Received</h2>
            <p className="text-muted-foreground mb-6">
              {errorMessage ||
                "We are still finalizing your booking. Please check your Activity page in a moment."}
            </p>
          </>
        )}
        <div className="space-y-3">
          {isSuccess && (
            <Button onClick={() => navigate(`/booking/${bookingId}`)} className="w-full">
              View Booking Details
            </Button>
          )}
          <Button onClick={() => navigate("/activity")} variant="outline" className="w-full">
            Go to Activity
          </Button>
        </div>
      </Card>
    </div>
  );
}
