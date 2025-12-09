import HeroSection from '@/components/ui/hero-section';
import FeaturesSection from '@/components/ui/features-section';
import CTASection from '@/components/ui/cta-section';
import Footer from '@/components/layout/Footer';

const Index = () => {
  return (
    <div className="bg-background">
      <HeroSection />
      <FeaturesSection />
      <CTASection />
      <Footer />
    </div>
  );
};

export default Index;
