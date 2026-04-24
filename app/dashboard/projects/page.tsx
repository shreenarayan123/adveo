"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Video, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ProjectRecord = {
  id: string;
  imageUrl: string;
  theme: string;
  status: string;
  progressStep?: string;
  videoUrl?: string | null;
  error?: string | null;
  createdAt?: string;
  brand?: string;
  productDescription?: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const finalizedProjects = useMemo(
    () => projects.filter((p) => p.status === "done" && !!p.videoUrl),
    [projects]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Projects</h2>
        <p className="text-muted-foreground">Final generated videos</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading projects...
        </div>
      )}

      {!loading && finalizedProjects.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No finalized videos yet.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {finalizedProjects.map((project) => (
          <Card key={project.id} className="overflow-hidden">
            <div className="relative aspect-video bg-muted">
              <img
                src={project.imageUrl || "/placeholder.svg"}
                alt={`${project.brand || "Brand"} product`}
                className="h-full w-full object-cover"
              />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {project.brand || "Brand"}
              </CardTitle>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {project.productDescription || "Product"}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Video className="h-4 w-4" />
                Final video ready
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" className="flex-1">
                  <a href={project.videoUrl!} target="_blank" rel="noreferrer">
                    Watch
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <a href={project.videoUrl!} download>
                    Download
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && projects.some((p) => p.status === "error") && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Some projects failed. Open dashboard home to inspect errors.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
