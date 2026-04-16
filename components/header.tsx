"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
              <span className="text-background font-bold text-sm">AV</span>
            </div>
            <span className="font-semibold text-lg text-foreground">AdVeo</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
              Features
            </Link>
            <Link href="#workflow" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
              How it Works
            </Link>
            <Link href="#themes" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
              Themes
            </Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
              Pricing
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
              <Link href="/dashboard">Log in</Link>
            </Button>
            <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90" asChild>
              <Link href="/dashboard">Get Started</Link>
            </Button>
          </div>

          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-background border-t border-border">
          <nav className="flex flex-col px-4 py-4 gap-4">
            <Link href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#workflow" className="text-muted-foreground hover:text-foreground transition-colors">
              How it Works
            </Link>
            <Link href="#themes" className="text-muted-foreground hover:text-foreground transition-colors">
              Themes
            </Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <div className="flex flex-col gap-2 pt-4 border-t border-border">
              <Button variant="ghost" className="justify-start text-muted-foreground" asChild>
                <Link href="/dashboard">Log in</Link>
              </Button>
              <Button className="bg-foreground text-background hover:bg-foreground/90" asChild>
                <Link href="/dashboard">Get Started</Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
