"use client"

import { Upload, Palette, Brain, Clapperboard, Video, Mic, CheckCircle } from "lucide-react"

const steps = [
  { icon: Upload, title: "Upload Product Image", description: "Drop your product photo" },
  { icon: Palette, title: "Choose Theme", description: "Nature, jungle, ice, desert..." },
  { icon: Brain, title: "Generate Ideas & Script", description: "AI creates compelling narratives" },
  { icon: Clapperboard, title: "AI Produces Shots", description: "Scene-by-scene generation" },
  { icon: Video, title: "Veo Generates Video", description: "Cinematic quality output" },
  { icon: Mic, title: "ElevenLabs Adds Voice", description: "Professional voiceover" },
  { icon: CheckCircle, title: "Final Ad Ready", description: "Download and publish" },
]

export function WorkflowSection() {
  return (
    <section id="workflow" className="py-20 md:py-32 bg-card/50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">How it works</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            From upload to finished ad in 7 simple steps
          </p>
        </div>

        {/* Desktop horizontal timeline */}
        <div className="hidden lg:block relative">
          {/* Connection line */}
          <div className="absolute top-8 left-0 right-0 h-0.5 bg-border" />

          <div className="grid grid-cols-7 gap-4">
            {steps.map((step, index) => (
              <div key={index} className="relative flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-background border border-border flex items-center justify-center mb-4 relative z-10 hover:border-accent/50 transition-colors">
                  <step.icon className="w-7 h-7 text-foreground" />
                </div>
                <span className="text-xs text-accent font-medium mb-1">Step {index + 1}</span>
                <h4 className="text-sm font-semibold text-foreground mb-1">{step.title}</h4>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile/Tablet vertical timeline */}
        <div className="lg:hidden relative">
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-8">
            {steps.map((step, index) => (
              <div key={index} className="relative flex items-start gap-6">
                <div className="w-16 h-16 rounded-2xl bg-background border border-border flex items-center justify-center flex-shrink-0 relative z-10">
                  <step.icon className="w-7 h-7 text-foreground" />
                </div>
                <div className="pt-2">
                  <span className="text-xs text-accent font-medium">Step {index + 1}</span>
                  <h4 className="text-base font-semibold text-foreground">{step.title}</h4>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
