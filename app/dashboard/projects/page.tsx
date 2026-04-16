import { Plus, MoreHorizontal, Video, Calendar, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import Link from "next/link"

const projects = [
  {
    id: 1,
    name: "Summer Collection 2024",
    videos: 6,
    lastUpdated: "2 hours ago",
    thumbnail: "/fashion-summer-collection.png",
  },
  {
    id: 2,
    name: "Tech Product Launch",
    videos: 4,
    lastUpdated: "Yesterday",
    thumbnail: "/tech-gadget-product.jpg",
  },
  {
    id: 3,
    name: "Food & Beverage Ads",
    videos: 8,
    lastUpdated: "3 days ago",
    thumbnail: "/food-beverage-product.jpg",
  },
  {
    id: 4,
    name: "Luxury Watch Campaign",
    videos: 3,
    lastUpdated: "1 week ago",
    thumbnail: "/luxury-watch.jpg",
  },
]

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Projects</h2>
          <p className="text-muted-foreground">Organize your video ads by campaign</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Projects Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id} className="group overflow-hidden">
            <div className="relative aspect-video overflow-hidden bg-muted">
              <img
                src={project.thumbnail || "/placeholder.svg"}
                alt={project.name}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 opacity-0 transition-all group-hover:bg-foreground/20 group-hover:opacity-100">
                <Button variant="secondary" size="sm">
                  <Eye className="mr-2 h-4 w-4" />
                  View Project
                </Button>
              </div>
            </div>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-base">{project.name}</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Edit</DropdownMenuItem>
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Video className="h-4 w-4" />
                  {project.videos} videos
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {project.lastUpdated}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* New Project Card */}
        <Link href="/dashboard/create">
          <Card className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center border-dashed transition-colors hover:border-primary/50 hover:bg-muted/50">
            <Plus className="mb-2 h-10 w-10 text-muted-foreground" />
            <span className="font-medium text-muted-foreground">Create New Project</span>
          </Card>
        </Link>
      </div>
    </div>
  )
}
