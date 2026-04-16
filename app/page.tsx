import { Header } from "@/components/header"
import { HeroSection } from "@/components/hero-section"
import { FeaturesSection } from "@/components/features-section"
import { WorkflowSection } from "@/components/workflow-section"
import { ThemesSection } from "@/components/themes-section"
import { TestimonialsSection } from "@/components/testimonials-section"
import { PricingSection } from "@/components/pricing-section"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <FeaturesSection />
      <WorkflowSection />
      <ThemesSection />
      <TestimonialsSection />
      <PricingSection />
      <Footer />
    </main>
  )
}
