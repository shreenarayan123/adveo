"use client";
import React, { useEffect, useState } from "react";

export default function DashboardClient() {
  const [projects, setProjects] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data));
  }, []);
  return (
    <div className="max-w-2xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Your Projects</h1>
      <div className="space-y-4">
        {projects.length === 0 && <div>No projects yet.</div>}
        {projects.map((p) => (
          <div key={p.id} className="border rounded p-4 flex flex-col gap-2">
            <div className="flex gap-4 items-center">
              <img src={p.imageUrl} alt="Product" className="w-16 h-16 object-cover rounded" />
              <div>
                <div className="font-semibold">Theme: {p.theme}</div>
                <div>Status: <span className="font-mono text-xs">{p.status}</span></div>
                {p.videoUrl && (
                  <a href={p.videoUrl} download className="text-blue-600 underline">Download Video</a>
                )}
                {p.error && <div className="text-red-600">Error: {p.error}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
