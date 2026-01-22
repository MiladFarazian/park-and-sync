import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Privacy = () => {
  const navigate = useNavigate();

  return (
    <div className="h-screen overflow-y-auto bg-background">
      <div className="container max-w-3xl mx-auto p-4 pb-12 space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">Last updated: January 22, 2026</p>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">1. Introduction</h2>
            <p>
              Welcome to Parkzy ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website (collectively, the "Platform").
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">2. Information We Collect</h2>
            <h3 className="text-lg font-medium">Personal Information</h3>
            <p>We may collect personal information that you voluntarily provide to us when you:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Register for an account</li>
              <li>List a parking spot</li>
              <li>Make a booking</li>
              <li>Contact us for support</li>
            </ul>
            <p>This information may include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Name and contact information (email address, phone number)</li>
              <li>Payment information (processed securely through Stripe)</li>
              <li>Vehicle information (license plate, make, model)</li>
              <li>Profile photo</li>
              <li>Location data</li>
            </ul>

            <h3 className="text-lg font-medium">Automatically Collected Information</h3>
            <p>When you use our Platform, we automatically collect certain information, including:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Device information (device type, operating system)</li>
              <li>Usage data (pages visited, features used)</li>
              <li>IP address and browser type</li>
              <li>Location data (with your permission)</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and send related information</li>
              <li>Send you technical notices, updates, and support messages</li>
              <li>Respond to your comments, questions, and customer service requests</li>
              <li>Monitor and analyze trends, usage, and activities</li>
              <li>Detect, investigate, and prevent fraudulent transactions and abuse</li>
              <li>Personalize and improve your experience</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">4. Sharing Your Information</h2>
            <p>We may share your information in the following situations:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>With other users:</strong> When you book a spot, we share necessary information with the host. When you list a spot, we share necessary information with renters.</li>
              <li><strong>With service providers:</strong> We share information with third-party vendors who perform services on our behalf (payment processing, email delivery, analytics).</li>
              <li><strong>For legal purposes:</strong> We may disclose information if required by law or to protect our rights and safety.</li>
              <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">5. Your Privacy Controls</h2>
            <p>You have control over your personal information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Profile visibility:</strong> Choose whether to display your profile photo and full name</li>
              <li><strong>Review visibility:</strong> Control whether your name appears on public reviews</li>
              <li><strong>Account deletion:</strong> You can delete your account at any time through your account settings</li>
              <li><strong>Communication preferences:</strong> Manage your notification settings</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">6. Data Security</h2>
            <p>
              We implement appropriate technical and organizational security measures to protect your personal information. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">7. Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">8. Children's Privacy</h2>
            <p>
              Our Platform is not intended for children under 18 years of age. We do not knowingly collect personal information from children under 18.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">10. Contact Us</h2>
            <p>
              If you have questions or concerns about this Privacy Policy, please contact us at:
            </p>
            <p className="font-medium">support@parkzy.app</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
