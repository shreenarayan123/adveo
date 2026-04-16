"use client"

import { TreePine, Trees, Snowflake, Crown, Minimize2, Sun } from "lucide-react"

const themes = [
  { icon: TreePine, name: "Nature", gradient: "from-green-900/40 to-emerald-900/20" },
  { icon: Trees, name: "Jungle", gradient: "from-lime-900/40 to-green-900/20" },
  { icon: Snowflake, name: "Ice", gradient: "from-cyan-900/40 to-blue-900/20" },
  { icon: Crown, name: "Luxury", gradient: "from-amber-900/40 to-yellow-900/20" },
  { icon: Minimize2, name: "Minimalistic", gradient: "from-neutral-800/40 to-zinc-900/20" },
  { icon: Sun, name: "Desert", gradient: "from-orange-900/40 to-amber-900/20" },
]

export function ThemesSection() {
  return (
    <section id="themes" className="py-20 md:py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Choose your aesthetic</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Select from stunning pre-designed themes or let AI suggest the perfect backdrop for your product.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {themes.map((theme, index) => (
            <button
              key={index}
              className={`group relative aspect-[4/3] rounded-2xl bg-gradient-to-br ${theme.gradient} border border-border hover:border-accent/50 transition-all duration-300 overflow-hidden`}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <theme.icon className="w-10 h-10 md:w-12 md:h-12 text-foreground/80 mb-3 group-hover:scale-110 transition-transform" />
                <span className="text-foreground font-medium text-lg">{theme.name}</span>
              </div>

              {/* Hover effect */}
              <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
