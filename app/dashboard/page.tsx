import { Video, FolderOpen, Clock, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import DashboardClient from "./page.client";

const stats = [
  {
    title: "Total Videos",
    value: "24",
    icon: Video,
    change: "+3 this week",
  },
  {
    title: "Projects",
    value: "8",
    icon: FolderOpen,
    change: "+1 this month",
  },
  {
    title: "Hours Saved",
    value: "156",
    icon: Clock,
    change: "vs manual editing",
  },
  {
    title: "Engagement Rate",
    value: "4.2x",
    icon: TrendingUp,
    change: "avg improvement",
  },
]

const recentVideos = [
  {
    id: 1,
    title: "Nike Air Max Promo",
    theme: "Minimalistic",
    date: "2 hours ago",
    status: "Completed",
  },
  {
    id: 2,
    title: "Summer Collection Ad",
    theme: "Nature",
    date: "Yesterday",
    status: "Completed",
  },
  {
    id: 3,
    title: "Tech Gadget Launch",
    theme: "Futuristic",
    date: "3 days ago",
    status: "Completed",
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Welcome back, John</h2>
          <p className="text-muted-foreground">Here&apos;s what&apos;s happening with your video ads</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/create">
            <Video className="mr-2 h-4 w-4" />
            Create New Video
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Videos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Videos</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/library">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentVideos.map((video) => (
              <div key={video.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Video className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{video.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {video.theme} • {video.date}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {video.status}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User's Real Projects */}
      <DashboardClient />
    </div>
  )
}
