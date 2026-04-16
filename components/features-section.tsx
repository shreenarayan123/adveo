"use client"

import { Lightbulb, FileText, Video, Mic } from "lucide-react"

const features = [
  {
    icon: Lightbulb,
    title: "AI Scene Ideation",
    description: "Generate high-level story concepts and visual themes that match your product perfectly.",
  },
  {
    icon: FileText,
    title: "Script + Dialogue Generation",
    description: "Full ad-ready scripts with compelling dialogue, hooks, and calls-to-action.",
  },
  {
    icon: Video,
    title: "Veo Video Rendering",
    description: "Cinematic shots generated automatically with state-of-the-art AI video technology.",
  },
  {
    icon: Mic,
    title: "Voiceovers from ElevenLabs",
    description: "Professional voiceovers in multiple styles and languages, powered by ElevenLabs.",
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Everything you need to create</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            From ideation to final cut, our AI handles every step of production.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative p-6 rounded-2xl bg-card border border-border hover:border-accent/50 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4 group-hover:bg-accent/10 transition-colors">
                <feature.icon className="w-6 h-6 text-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>

              {/* Hover glow effect */}
              <div className="absolute inset-0 rounded-2xl bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity -z-10 blur-xl" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
