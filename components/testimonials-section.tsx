"use client"

import { Star } from "lucide-react"

const testimonials = [
  {
    quote:
      "AdVeo cut our video production time from weeks to hours. The AI-generated scripts are surprisingly on-brand.",
    author: "Sarah Chen",
    role: "Marketing Director, TechFlow",
    avatar: "/professional-woman-headshot.png",
  },
  {
    quote:
      "The quality of the Veo-generated shots is incredible. Our social media engagement has tripled since we started using it.",
    author: "Marcus Johnson",
    role: "Founder, Brandify",
    avatar: "/professional-man-headshot.png",
  },
  {
    quote:
      "Finally, a tool that understands creative direction. The theme presets are a game-changer for quick campaigns.",
    author: "Emily Rodriguez",
    role: "Creative Lead, Spark Agency",
    avatar: "/creative-professional-woman.png",
  },
]

export function TestimonialsSection() {
  return (
    <section className="py-20 md:py-32 bg-card/50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Trusted by creators worldwide</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            See what marketing teams and creators are saying about AdVeo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="p-6 rounded-2xl bg-background border border-border hover:border-accent/30 transition-colors"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-accent text-accent" />
                ))}
              </div>
              <p className="text-foreground mb-6 leading-relaxed">"{testimonial.quote}"</p>
              <div className="flex items-center gap-3">
                <img
                  src={testimonial.avatar || "/placeholder.svg"}
                  alt={testimonial.author}
                  className="w-12 h-12 rounded-full bg-secondary"
                />
                <div>
                  <p className="font-semibold text-foreground text-sm">{testimonial.author}</p>
                  <p className="text-muted-foreground text-sm">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
