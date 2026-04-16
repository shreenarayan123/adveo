"use client"

import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"

const plans = [
  {
    name: "Starter",
    price: "$29",
    period: "/month",
    description: "Perfect for small businesses and creators",
    features: [
      "5 video ads per month",
      "All theme presets",
      "720p video export",
      "Basic voiceover styles",
      "Email support",
    ],
    cta: "Get Started",
    featured: false,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/month",
    description: "For growing teams and agencies",
    features: [
      "25 video ads per month",
      "Custom themes",
      "4K video export",
      "Premium voiceover library",
      "Priority support",
      "Brand kit integration",
      "API access",
    ],
    cta: "Start Free Trial",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations",
    features: [
      "Unlimited video ads",
      "Custom AI training",
      "White-label option",
      "Dedicated account manager",
      "SLA guarantee",
      "Advanced analytics",
      "SSO & security",
    ],
    cta: "Contact Sales",
    featured: false,
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-20 md:py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Simple, transparent pricing</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Choose the plan that fits your needs. Scale as you grow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative p-6 lg:p-8 rounded-2xl border ${
                plan.featured ? "bg-foreground text-background border-foreground" : "bg-card border-border"
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-accent text-accent-foreground text-xs font-medium rounded-full">
                  Most Popular
                </div>
              )}

              <h3 className={`text-xl font-semibold mb-2 ${plan.featured ? "text-background" : "text-foreground"}`}>
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className={`text-4xl font-bold ${plan.featured ? "text-background" : "text-foreground"}`}>
                  {plan.price}
                </span>
                <span className={plan.featured ? "text-background/70" : "text-muted-foreground"}>{plan.period}</span>
              </div>
              <p className={`text-sm mb-6 ${plan.featured ? "text-background/70" : "text-muted-foreground"}`}>
                {plan.description}
              </p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check
                      className={`w-5 h-5 flex-shrink-0 mt-0.5 ${plan.featured ? "text-background" : "text-accent"}`}
                    />
                    <span className={`text-sm ${plan.featured ? "text-background/90" : "text-foreground"}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full ${
                  plan.featured
                    ? "bg-background text-foreground hover:bg-background/90"
                    : "bg-foreground text-background hover:bg-foreground/90"
                }`}
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
