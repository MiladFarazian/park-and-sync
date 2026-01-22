import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Terms = () => {
  const navigate = useNavigate();

  return (
    <div className="h-screen overflow-y-auto bg-background">
      <div className="container max-w-3xl mx-auto p-4 pb-12 space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Terms & Conditions</h1>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">Last updated: January 22, 2026</p>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Parkzy platform ("Platform"), you agree to be bound by these Terms & Conditions ("Terms"). If you do not agree to these Terms, please do not use our Platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">2. Description of Service</h2>
            <p>
              Parkzy is a peer-to-peer marketplace that connects parking space owners ("Hosts") with drivers seeking parking ("Renters"). We facilitate the booking and payment process but are not directly responsible for the parking spaces listed on our Platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">3. User Accounts</h2>
            <h3 className="text-lg font-medium">Registration</h3>
            <p>To use certain features of our Platform, you must create an account. You agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Notify us immediately of any unauthorized use</li>
              <li>Be at least 18 years of age</li>
            </ul>

            <h3 className="text-lg font-medium">Account Responsibility</h3>
            <p>
              You are responsible for all activities that occur under your account. Parkzy reserves the right to suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">4. Host Responsibilities</h2>
            <p>If you list a parking space on Parkzy, you agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Have the legal right to offer the parking space</li>
              <li>Provide accurate descriptions and photos</li>
              <li>Maintain the space in safe and usable condition</li>
              <li>Honor confirmed bookings</li>
              <li>Comply with all applicable laws and regulations</li>
              <li>Respond to booking requests in a timely manner</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">5. Renter Responsibilities</h2>
            <p>If you book a parking space through Parkzy, you agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the space only for the agreed-upon time period</li>
              <li>Follow all host rules and instructions</li>
              <li>Leave the space in the condition you found it</li>
              <li>Not engage in any illegal activities</li>
              <li>Provide accurate vehicle information</li>
              <li>Depart by the end of your booking time</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">6. Payments and Fees</h2>
            <h3 className="text-lg font-medium">Payment Processing</h3>
            <p>
              All payments are processed securely through our third-party payment processor, Stripe. By making a payment, you agree to Stripe's terms of service.
            </p>

            <h3 className="text-lg font-medium">Service Fees</h3>
            <p>
              Parkzy charges a service fee for each transaction. The fee amount will be clearly displayed before you confirm any booking.
            </p>

            <h3 className="text-lg font-medium">Host Payouts</h3>
            <p>
              Hosts receive payouts according to our payout schedule, less applicable service fees. Hosts must have a valid Stripe Connect account to receive payments.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">7. Cancellation Policy</h2>
            <p>
              Cancellation policies are set by individual Hosts. The applicable cancellation policy will be displayed on the listing page before you book. Refunds are processed according to the Host's stated policy.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">8. Overstay Policy</h2>
            <p>
              If you remain parked beyond your booking end time, you may be subject to overstay charges. Repeated overstays may result in account suspension.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">9. Reviews and Ratings</h2>
            <p>
              Users may leave reviews and ratings after completed bookings. Reviews must be honest and based on actual experiences. We reserve the right to remove reviews that violate our guidelines.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">10. Prohibited Activities</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Violate any laws or regulations</li>
              <li>Post false, misleading, or fraudulent content</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Circumvent our payment system</li>
              <li>Use the Platform for any illegal purpose</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Interfere with the proper functioning of the Platform</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">11. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Parkzy shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform. Our total liability shall not exceed the amount you paid to Parkzy in the 12 months preceding the claim.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">12. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Parkzy and its officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from your use of the Platform or violation of these Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">13. Dispute Resolution</h2>
            <p>
              Any disputes arising from these Terms or your use of the Platform shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">14. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify users of material changes by posting a notice on the Platform. Continued use of the Platform after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">15. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">16. Contact Us</h2>
            <p>
              If you have questions about these Terms, please contact us at:
            </p>
            <p className="font-medium">support@parkzy.app</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Terms;
