"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Play, Sparkles } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
      {/* Background gradient effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary border border-border mb-8">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm text-muted-foreground">Powered by Veo & ElevenLabs</span>
          </div>

          {/* Main headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground mb-6 text-balance">
            Create Studio-Grade Product Video Ads with AI
          </h1>

          {/* Subtext */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 text-pretty">
            Upload your product. Choose a theme. Let AI generate cinematic product shots, scripts, and voiceovers — all
            in minutes.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-foreground text-background hover:bg-foreground/90 px-8 h-12 text-base"
              asChild
            >
              <Link href="/dashboard/create">Generate Video Ad</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border text-foreground hover:bg-secondary px-8 h-12 text-base bg-transparent"
            >
              <Play className="w-4 h-4 mr-2" />
              Watch Demo
            </Button>
          </div>
        </div>

        {/* Product demo placeholder */}
        <div className="mt-16 md:mt-24 relative">
          <div className="relative mx-auto max-w-5xl">
            <div className="aspect-video rounded-2xl bg-card border border-border overflow-hidden shadow-2xl shadow-accent/5">
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary to-card">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-foreground/10 flex items-center justify-center mx-auto mb-4 cursor-pointer hover:bg-foreground/20 transition-colors">
                    <Play className="w-8 h-8 text-foreground ml-1" />
                  </div>
                  <p className="text-muted-foreground text-sm">Watch how it works</p>
                </div>
              </div>
            </div>
            {/* Glow effect */}
            <div className="absolute -inset-4 bg-accent/10 rounded-3xl blur-2xl -z-10" />
          </div>
        </div>
      </div>
    </section>
  )
}
