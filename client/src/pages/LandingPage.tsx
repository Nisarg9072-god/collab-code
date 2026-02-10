import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import WhatIsSection from "@/components/landing/WhatIsSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import UseCasesSection from "@/components/landing/UseCasesSection";
import ReliabilitySection from "@/components/landing/ReliabilitySection";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <HeroSection />
        <WhatIsSection />
        <HowItWorksSection />
        <FeaturesSection />
        <UseCasesSection />
        <ReliabilitySection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
