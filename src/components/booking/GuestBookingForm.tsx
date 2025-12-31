import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Car, CreditCard, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

interface GuestBookingFormProps {
  spot: any;
  startDateTime: Date;
  endDateTime: Date;
  totalHours: number;
  subtotal: number;
  serviceFee: number;
  totalAmount: number;
}

const GuestBookingFormContent = ({ 
  spot, 
  startDateTime, 
  endDateTime, 
  totalHours,
  subtotal,
  serviceFee,
  totalAmount 
}: GuestBookingFormProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const stripe = useStripe();
  const elements = useElements();
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [carModel, setCarModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [saveInfo, setSaveInfo] = useState(false);
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      toast({ title: "Payment not ready", description: "Please wait for payment form to load", variant: "destructive" });
      return;
    }

    if (!fullName.trim()) {
      toast({ title: "Name required", description: "Please enter your full name", variant: "destructive" });
      return;
    }

    if (!email.trim() && !phone.trim()) {
      toast({ title: "Contact required", description: "Please enter email or phone number", variant: "destructive" });
      return;
    }

    if (!carModel.trim()) {
      toast({ title: "Vehicle required", description: "Please enter your vehicle model", variant: "destructive" });
      return;
    }

    if (!cardComplete) {
      toast({ title: "Card required", description: "Please enter your card details", variant: "destructive" });
      return;
    }

    // Validate password if saving info
    if (saveInfo) {
      if (!email.trim()) {
        toast({ title: "Email required", description: "Please enter an email to create an account", variant: "destructive" });
        return;
      }
      if (password.length < 6) {
        toast({ title: "Password too short", description: "Password must be at least 6 characters", variant: "destructive" });
        return;
      }
    }

    setLoading(true);

    let paymentIntentId: string | null = null;

    try {
      // Create guest booking
      const { data, error } = await supabase.functions.invoke('create-guest-booking', {
        body: {
          spot_id: spot.id,
          start_at: startDateTime.toISOString(),
          end_at: endDateTime.toISOString(),
          guest_full_name: fullName.trim(),
          guest_email: email.trim() || null,
          guest_phone: phone.trim() || null,
          guest_car_model: carModel.trim(),
          guest_license_plate: licensePlate.trim() || null,
          save_payment_method: saveInfo, // Tell backend to set up for future use
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { client_secret, payment_intent_id, booking_id, guest_access_token } = data;
      paymentIntentId = payment_intent_id;

      // Confirm payment with Stripe
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error('Card element not found');

      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: fullName.trim(),
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
          },
        },
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      if (paymentIntent?.status === 'succeeded') {
        // Create account if user opted in
        if (saveInfo && email.trim() && password) {
          try {
            const nameParts = fullName.trim().split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || '';

            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
              email: email.trim(),
              password,
              options: {
                emailRedirectTo: `${window.location.origin}/`,
                data: {
                  first_name: firstName,
                  last_name: lastName,
                },
              },
            });

            if (signUpError) {
              console.warn('Account creation failed:', signUpError.message);
              toast({ 
                title: "Account creation failed", 
                description: signUpError.message === 'User already registered' 
                  ? "An account with this email already exists. You can sign in later to link this booking."
                  : "Booking confirmed, but we couldn't create your account. You can sign up later.",
              });
            } else {
              toast({ 
                title: "Account created!", 
                description: "Check your email to verify your account",
              });
              
              // Attach the payment method to the new account
              if (paymentIntentId && signUpData.session) {
                try {
                  await supabase.functions.invoke('attach-guest-payment-method', {
                    body: { payment_intent_id: paymentIntentId },
                  });
                  console.log('Payment method attached to new account');
                } catch (attachErr) {
                  console.warn('Could not attach payment method:', attachErr);
                }
              }
              
              // Try to link the guest booking to the new user
              try {
                await supabase.functions.invoke('link-guest-bookings', {
                  body: { email: email.trim() },
                });
              } catch (linkErr) {
                console.warn('Could not auto-link booking:', linkErr);
              }
            }
          } catch (accountErr) {
            console.warn('Account creation error:', accountErr);
          }
        }

        toast({ title: "Booking confirmed!", description: "Your parking spot has been reserved" });
        navigate(`/guest-booking/${booking_id}?token=${guest_access_token}`);
      } else {
        throw new Error('Payment was not successful');
      }
    } catch (err: any) {
      console.error('Guest booking error:', err);
      toast({ 
        title: "Booking failed", 
        description: err.message || 'Please try again', 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Contact Information */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <User className="h-4 w-4" />
          Your Information
        </h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="fullName">Full Name *</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              required
            />
          </div>
          <div>
            <Label htmlFor="email">Email {saveInfo && '*'}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              required={saveInfo}
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </div>
          <p className="text-xs text-muted-foreground">* Email or phone required for booking confirmation</p>
        </div>
      </Card>

      {/* Vehicle Information */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Car className="h-4 w-4" />
          Vehicle Information
        </h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="carModel">Vehicle Make & Model *</Label>
            <Input
              id="carModel"
              value={carModel}
              onChange={(e) => setCarModel(e.target.value)}
              placeholder="Toyota Camry"
              required
            />
          </div>
          <div>
            <Label htmlFor="licensePlate">License Plate (optional)</Label>
            <Input
              id="licensePlate"
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value)}
              placeholder="ABC 1234"
            />
          </div>
        </div>
      </Card>

      {/* Payment */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Payment
        </h3>
        <div className="p-3 border rounded-md bg-background">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': { color: '#aab7c4' },
                },
                invalid: { color: '#9e2146' },
              },
            }}
            onChange={(e) => setCardComplete(e.complete)}
          />
        </div>
      </Card>

      {/* Save Info Checkbox */}
      <Card className="p-4">
        <div className="flex items-start space-x-3">
          <Checkbox 
            id="saveInfo" 
            checked={saveInfo} 
            onCheckedChange={(checked) => setSaveInfo(checked === true)}
          />
          <div className="flex-1">
            <Label htmlFor="saveInfo" className="cursor-pointer font-medium">
              Save my info for next time
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Create an account to manage bookings, save payment methods, and get faster checkout
            </p>
          </div>
        </div>

        {saveInfo && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div>
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="h-3 w-3" />
                Create Password *
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                required={saveInfo}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We'll send a verification email to confirm your account
            </p>
          </div>
        )}
      </Card>

      {/* Price Summary */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Price Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{totalHours.toFixed(1)} hours × ${(subtotal / totalHours).toFixed(2)}/hr</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Service fee</span>
            <span>${serviceFee.toFixed(2)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold text-base">
            <span>Total</span>
            <span>${totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </Card>

      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          `Pay $${totalAmount.toFixed(2)}`
        )}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        By booking, you agree to our Terms of Service and Privacy Policy
      </p>
    </form>
  );
};

export default GuestBookingFormContent;
