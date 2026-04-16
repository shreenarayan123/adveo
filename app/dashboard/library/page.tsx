"use client"

import { useState } from "react"
import { Download, Edit, RefreshCw, MoreHorizontal, Grid, List, Search, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const videos = [
  {
    id: 1,
    title: "Nike Air Max - Nature Theme",
    date: "Dec 5, 2024",
    duration: "0:30",
    thumbnail: "/sneaker-product-video-nature.jpg",
  },
  {
    id: 2,
    title: "Summer Dress Collection",
    date: "Dec 4, 2024",
    duration: "0:45",
    thumbnail: "/fashion-dress-summer.jpg",
  },
  {
    id: 3,
    title: "Smartwatch Pro Launch",
    date: "Dec 3, 2024",
    duration: "0:30",
    thumbnail: "/smartwatch-tech-product.jpg",
  },
  {
    id: 4,
    title: "Organic Coffee Blend",
    date: "Dec 2, 2024",
    duration: "0:20",
    thumbnail: "/coffee-product-premium.jpg",
  },
  {
    id: 5,
    title: "Luxury Perfume Ad",
    date: "Dec 1, 2024",
    duration: "0:30",
    thumbnail: "/perfume-luxury-bottle.jpg",
  },
  {
    id: 6,
    title: "Gaming Headset Promo",
    date: "Nov 30, 2024",
    duration: "0:25",
    thumbnail: "/gaming-headset-tech.jpg",
  },
]

export default function LibraryPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [searchQuery, setSearchQuery] = useState("")

  const filteredVideos = videos.filter((video) => video.title.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Video Library</h2>
          <p className="text-muted-foreground">{videos.length} videos generated</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
          <div className="flex rounded-lg border border-border">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
              className="rounded-r-none"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Videos */}
      {viewMode === "grid" ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredVideos.map((video) => (
            <Card key={video.id} className="group overflow-hidden">
              <div className="relative aspect-video overflow-hidden bg-muted">
                <img
                  src={video.thumbnail || "/placeholder.svg"}
                  alt={video.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute bottom-2 right-2 rounded bg-foreground/80 px-1.5 py-0.5 text-xs text-background">
                  {video.duration}
                </div>
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{video.title}</h3>
                    <p className="text-sm text-muted-foreground">{video.date}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Regenerate
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredVideos.map((video) => (
            <Card key={video.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="relative h-16 w-28 overflow-hidden rounded-lg bg-muted">
                  <img
                    src={video.thumbnail || "/placeholder.svg"}
                    alt={video.title}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{video.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {video.date} • {video.duration}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  <Button variant="outline" size="sm">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
