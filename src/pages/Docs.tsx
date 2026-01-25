import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Car, Home, CreditCard, HelpCircle, Search, Calendar, Shield, Star, Zap, MapPin, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const Docs = () => {
  const navigate = useNavigate();

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6 pb-12">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Help Center</h1>
        </div>

        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => scrollToSection('drivers')}
          >
            <CardHeader className="p-4 pb-2">
              <Car className="h-6 w-6 text-primary mb-2" />
              <CardTitle className="text-base">For Drivers</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <CardDescription className="text-xs">Find & book parking spots</CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => scrollToSection('hosts')}
          >
            <CardHeader className="p-4 pb-2">
              <Home className="h-6 w-6 text-primary mb-2" />
              <CardTitle className="text-base">For Hosts</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <CardDescription className="text-xs">List your spot & earn</CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => scrollToSection('payments')}
          >
            <CardHeader className="p-4 pb-2">
              <CreditCard className="h-6 w-6 text-primary mb-2" />
              <CardTitle className="text-base">Payments</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <CardDescription className="text-xs">Pricing, fees & payouts</CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => scrollToSection('faq')}
          >
            <CardHeader className="p-4 pb-2">
              <HelpCircle className="h-6 w-6 text-primary mb-2" />
              <CardTitle className="text-base">FAQ</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <CardDescription className="text-xs">Common questions</CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Getting Started Section */}
        <section className="mb-10" id="getting-started">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Getting Started</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="create-account">
              <AccordionTrigger>Creating an Account</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Getting started with Parkzy is quick and easy. You can create an account using:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Email & Password:</strong> Sign up with your email address and create a secure password</li>
                  <li><strong>Phone Number:</strong> Use your mobile number and verify with a one-time code</li>
                  <li><strong>Google Sign-In:</strong> Connect your Google account for instant access</li>
                  <li><strong>Apple Sign-In:</strong> Use your Apple ID for secure, private sign-in</li>
                </ul>
                <p>After signing up, you'll be prompted to complete your profile with your name and optional profile photo.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="complete-profile">
              <AccordionTrigger>Completing Your Profile</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>A complete profile helps build trust in the Parkzy community:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Full Name:</strong> Your first and last name (required)</li>
                  <li><strong>Profile Photo:</strong> Add a photo to help hosts and drivers recognize you</li>
                  <li><strong>Phone Number:</strong> Add for booking notifications and support</li>
                  <li><strong>Email:</strong> Keep your email up to date for important updates</li>
                </ul>
                <p>You can update your profile anytime from the Profile page in the app.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="verification">
              <AccordionTrigger>Email & Phone Verification</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Verification helps keep Parkzy safe and secure:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Email Verification:</strong> Check your inbox for a verification link after signing up. Click the link to verify your email address.</li>
                  <li><strong>Phone Verification:</strong> If you signed up with your phone number, you'll receive a one-time code via SMS to verify your number.</li>
                </ul>
                <p>Verified accounts have access to all Parkzy features and help build trust with other users.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* For Drivers Section */}
        <section className="mb-10" id="drivers">
          <div className="flex items-center gap-2 mb-4">
            <Car className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">For Drivers</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="find-parking">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Finding Parking
                </span>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Find the perfect parking spot with our powerful search:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Location Search:</strong> Enter an address, landmark, or use your current location</li>
                  <li><strong>Map View:</strong> Browse available spots on an interactive map</li>
                  <li><strong>List View:</strong> See spots in a scrollable list with photos and details</li>
                  <li><strong>Filters:</strong> Narrow results by price, features (covered, secure, EV charging), and vehicle size</li>
                </ul>
                <p>Each spot shows the hourly rate, distance from your search location, and available features.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="ev-charging">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  EV Charging
                </span>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Parkzy makes it easy to find spots with EV charging:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>EV Filter:</strong> Toggle the EV charging filter to only see spots with chargers</li>
                  <li><strong>Charger Types:</strong> We support Tesla, CCS1, CCS2, CHAdeMO, J1772, Type 2, and NEMA 14-50</li>
                  <li><strong>Charging Fee:</strong> Some hosts charge a premium for EV charging, shown separately during booking</li>
                </ul>
                <p>When booking, you can indicate if you plan to use EV charging so the host is prepared.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="booking">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Making a Booking
                </span>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Booking a spot is simple:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Select your desired parking spot</li>
                  <li>Choose your start and end times</li>
                  <li>Select which vehicle you'll be parking</li>
                  <li>Indicate if you need EV charging (if available)</li>
                  <li>Review the pricing breakdown</li>
                  <li>Confirm and pay</li>
                </ol>
                <p><strong>Instant Book:</strong> Some spots allow instant booking—your reservation is confirmed immediately.</p>
                <p><strong>Request to Book:</strong> Other spots require host approval. The host will review and approve or decline your request.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="manage-reservations">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Managing Reservations
                </span>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Keep track of all your bookings in the Activity tab:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Upcoming:</strong> View your confirmed reservations and access spot details</li>
                  <li><strong>Active:</strong> See your current parking session with time remaining</li>
                  <li><strong>Past:</strong> Review your parking history and leave reviews</li>
                </ul>
                <p><strong>Extend Your Session:</strong> Need more time? You can extend your parking directly from an active booking if the spot is available.</p>
                <p><strong>Cancel a Booking:</strong> Cancel upcoming reservations from the booking details page. Refund policies vary—check the spot's cancellation policy.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="vehicles">
              <AccordionTrigger>Managing Your Vehicles</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Add your vehicles to make booking faster:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Add Vehicle:</strong> Enter your license plate, make, model, and color</li>
                  <li><strong>Vehicle Size:</strong> Select your vehicle's size class (compact, sedan, SUV, truck) to ensure you book spots that fit</li>
                  <li><strong>EV Status:</strong> Mark if your vehicle is electric to easily find compatible charging spots</li>
                  <li><strong>Primary Vehicle:</strong> Set a default vehicle for quicker bookings</li>
                </ul>
                <p>Manage your vehicles anytime from Profile → My Vehicles.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="favorites">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Saving Favorites
                </span>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Save spots you love for quick access later:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Tap the heart icon on any spot to save it</li>
                  <li>Access your saved spots from Profile → Saved Spots</li>
                  <li>Favorites sync across all your devices</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="reviews-driver">
              <AccordionTrigger>Leaving Reviews</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Help the community by reviewing your parking experiences:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>After your booking ends, you'll have a window to leave a review</li>
                  <li>Rate the spot from 1 to 5 stars</li>
                  <li>Add a comment about your experience</li>
                  <li>Reviews are revealed after both parties submit or the review window closes</li>
                </ul>
                <p>Honest reviews help other drivers find great spots and encourage hosts to maintain quality.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* For Hosts Section */}
        <section className="mb-10" id="hosts">
          <div className="flex items-center gap-2 mb-4">
            <Home className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">For Hosts</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="list-spot">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Listing Your Spot
                </span>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Turn your unused parking space into income:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Switch to Host mode using the toggle in the header</li>
                  <li>Tap "List a Spot" from the Host Home</li>
                  <li>Enter your spot's address and confirm the location on the map</li>
                  <li>Add photos that clearly show the parking space</li>
                  <li>Write a title and description</li>
                  <li>Select features (covered, secure, EV charging, etc.)</li>
                  <li>Set vehicle size constraints if your spot has limitations</li>
                  <li>Set your hourly rate</li>
                  <li>Configure your availability schedule</li>
                  <li>Choose instant book or request-to-book</li>
                </ol>
                <p>Your listing will be reviewed and activated once complete.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pricing">
              <AccordionTrigger>Setting Your Price</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>You control your earnings:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Hourly Rate:</strong> Set your base hourly rate for parking</li>
                  <li><strong>EV Charging Premium:</strong> If you offer EV charging, you can set an additional per-hour fee</li>
                  <li><strong>Custom Rates:</strong> Set different rates for specific days or time slots in your availability settings</li>
                </ul>
                <p>Research similar spots in your area to set competitive pricing.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="availability">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Managing Availability
                </span>
              </AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Control when your spot is available:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Recurring Schedule:</strong> Set your weekly availability (e.g., weekdays 8am-6pm)</li>
                  <li><strong>Date Overrides:</strong> Block specific dates or change hours for holidays, events, or personal use</li>
                  <li><strong>Custom Rates:</strong> Charge more during high-demand periods</li>
                </ul>
                <p>Your calendar shows all bookings and availability at a glance.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="booking-requests">
              <AccordionTrigger>Approving Booking Requests</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>For spots with request-to-book enabled:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>You'll receive a notification when someone requests your spot</li>
                  <li>Review the booking details: dates, times, vehicle, and driver profile</li>
                  <li>Approve to confirm the booking, or decline with an optional reason</li>
                  <li>Respond promptly—requests expire if not addressed</li>
                </ul>
                <p><strong>Instant Book:</strong> Enable instant book to automatically accept all bookings without manual approval.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="earnings">
              <AccordionTrigger>Earnings & Payouts</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Get paid for your parking space:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Track Earnings:</strong> View your earnings in the Host Dashboard</li>
                  <li><strong>Stripe Connect:</strong> Set up Stripe to receive payouts to your bank account</li>
                  <li><strong>Payout Schedule:</strong> Earnings are transferred according to Stripe's schedule (typically within a few days)</li>
                  <li><strong>Earnings History:</strong> Review all your completed bookings and earnings over time</li>
                </ul>
                <p>Set up Stripe Connect in your Host Dashboard to start receiving payouts.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="host-calendar">
              <AccordionTrigger>Using the Host Calendar</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Your Host Calendar gives you a complete view of your spots:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>See all upcoming bookings at a glance</li>
                  <li>View booking details by tapping on any reservation</li>
                  <li>Quickly see which time slots are available vs. booked</li>
                  <li>Manage multiple spots from one calendar</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="messaging">
              <AccordionTrigger>Messaging Drivers</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Communicate with drivers directly through Parkzy:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Message drivers before, during, or after a booking</li>
                  <li>Share access instructions or special notes</li>
                  <li>Coordinate arrival times or answer questions</li>
                  <li>All messages are saved in your inbox</li>
                </ul>
                <p>Quick responses lead to better reviews and repeat bookings!</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Payments & Fees Section */}
        <section className="mb-10" id="payments">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Payments & Fees</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="pricing-how">
              <AccordionTrigger>How Pricing Works</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Parkzy pricing is simple and transparent:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Hourly Rate:</strong> The base rate set by the host</li>
                  <li><strong>Duration:</strong> Total hours of your booking</li>
                  <li><strong>Service Fee:</strong> A small fee to cover platform operations</li>
                  <li><strong>EV Charging:</strong> Additional fee if using EV charging (where applicable)</li>
                </ul>
                <p>You'll see a complete breakdown before confirming any booking.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="payment-methods">
              <AccordionTrigger>Payment Methods</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Parkzy accepts major payment methods:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Credit and debit cards (Visa, Mastercard, American Express)</li>
                  <li>Apple Pay and Google Pay</li>
                </ul>
                <p>Manage your saved payment methods in Profile → Payment Methods.</p>
                <p>All payments are processed securely through Stripe.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cancellations">
              <AccordionTrigger>Cancellations & Refunds</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Cancellation policies vary by spot. Common policies include:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Flexible:</strong> Full refund if cancelled 1+ hours before start</li>
                  <li><strong>Moderate:</strong> Full refund if cancelled 24+ hours before start</li>
                  <li><strong>Strict:</strong> 50% refund if cancelled 48+ hours before start</li>
                </ul>
                <p>Check the spot's cancellation policy before booking. Refunds are processed back to your original payment method.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="host-payouts">
              <AccordionTrigger>Host Payouts</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Hosts receive their earnings through Stripe Connect:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Set up your Stripe account from the Host Dashboard</li>
                  <li>Earnings are deposited directly to your bank account</li>
                  <li>Stripe handles all tax documentation (1099s for US hosts)</li>
                  <li>Track all payouts in your earnings history</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Safety & Trust Section */}
        <section className="mb-10" id="safety">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Safety & Trust</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="verified-profiles">
              <AccordionTrigger>Verified Profiles</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Parkzy verifies users to build a trusted community:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Email Verification:</strong> Confirms you have access to your email</li>
                  <li><strong>Phone Verification:</strong> Confirms your phone number is valid</li>
                  <li><strong>Profile Photo:</strong> Helps hosts and drivers recognize each other</li>
                </ul>
                <p>Look for verification badges when viewing profiles.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="reviews-system">
              <AccordionTrigger>Reviews & Ratings</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Our two-way review system builds trust:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Drivers review spots and hosts</li>
                  <li>Hosts review drivers</li>
                  <li>Reviews are revealed simultaneously to ensure honesty</li>
                  <li>Average ratings are displayed on profiles</li>
                </ul>
                <p>Read reviews to find reliable spots and trustworthy users.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="reporting">
              <AccordionTrigger>Reporting Issues</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>If something goes wrong, we're here to help:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Report a Spot:</strong> Flag listings that are inaccurate or problematic</li>
                  <li><strong>Contact Support:</strong> Reach our team through the Messages tab</li>
                  <li><strong>Booking Issues:</strong> Report problems from your booking details page</li>
                </ul>
                <p>We take all reports seriously and investigate promptly.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="account-security">
              <AccordionTrigger>Account Security</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Keep your account secure:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Use a strong, unique password</li>
                  <li>Never share your login credentials</li>
                  <li>Sign out when using shared devices</li>
                  <li>Keep your email and phone number up to date</li>
                </ul>
                <p>Manage your security settings in Profile → Privacy & Security.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* FAQ Section */}
        <section className="mb-10" id="faq">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="faq-change-time">
              <AccordionTrigger>How do I change my booking time?</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>You can modify your booking times before your session starts:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Go to your booking in the Activity tab</li>
                  <li>Tap "Modify Booking"</li>
                  <li>Select your new times</li>
                  <li>Confirm the change (price adjustments will be calculated automatically)</li>
                </ol>
                <p>Note: Changes are subject to availability.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-overstay">
              <AccordionTrigger>What happens if I overstay?</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>If you stay past your booking end time:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>You'll receive reminders before your booking ends</li>
                  <li>A grace period may apply depending on the spot</li>
                  <li>Overstay charges will be applied to your payment method</li>
                  <li>Repeated overstays may affect your account standing</li>
                </ul>
                <p>If you need more time, extend your booking before it ends!</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-cancel">
              <AccordionTrigger>Can I cancel a booking?</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Yes, you can cancel upcoming bookings:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Go to your booking in the Activity tab</li>
                  <li>Tap "Cancel Booking"</li>
                  <li>Confirm the cancellation</li>
                </ol>
                <p>Refund amount depends on the spot's cancellation policy and timing.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-host-paid">
              <AccordionTrigger>How do hosts get paid?</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Hosts receive payments through Stripe Connect:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Set up Stripe from the Host Dashboard</li>
                  <li>Link your bank account for direct deposits</li>
                  <li>Earnings are transferred automatically after completed bookings</li>
                  <li>Track all payouts in your earnings history</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-problem">
              <AccordionTrigger>What if there's a problem with my parking spot?</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>If you encounter issues:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Contact the host:</strong> Message them directly through the app</li>
                  <li><strong>Document the issue:</strong> Take photos if relevant</li>
                  <li><strong>Contact support:</strong> Reach us through the Messages tab</li>
                  <li><strong>Request a refund:</strong> We'll review and process eligible refunds</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-ev-rates">
              <AccordionTrigger>How do EV charging rates work?</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>EV charging is an optional add-on:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Hosts set a per-hour premium for EV charging</li>
                  <li>The fee is shown separately during booking</li>
                  <li>Indicate if you plan to charge when booking</li>
                  <li>Follow the host's charging instructions</li>
                </ul>
                <p>Not all spots with chargers require a fee—check each listing.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-guest-booking">
              <AccordionTrigger>Can I book without an account?</AccordionTrigger>
              <AccordionContent className="prose prose-sm dark:prose-invert max-w-none">
                <p>Yes! Guest booking is available for convenience:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>You can book certain spots as a guest</li>
                  <li>Provide your name, email, phone, and vehicle info</li>
                  <li>Receive booking confirmation via email</li>
                  <li>Access your booking through a unique link</li>
                </ul>
                <p>Create an account to save vehicles, track history, and unlock all features!</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Contact Section */}
        <div className="bg-muted/50 rounded-lg p-6 text-center">
          <h3 className="font-semibold mb-2">Still need help?</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Our support team is here for you. Send us a message and we'll get back to you as soon as possible.
          </p>
          <Button onClick={() => navigate('/messages')}>
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Docs;
