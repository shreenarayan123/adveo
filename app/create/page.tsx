"use client";
import React, { useState } from "react";

const THEMES = [
  "nature",
  "jungle",
  "ice",
  "desert",
  "studio",
  "luxury",
];

const STEPS = [
  { key: "script", label: "Script" },
  { key: "shots", label: "Product Shots" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
  { key: "finalizing", label: "Finalizing" },
  { key: "done", label: "Done" },
];

export default function CreatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [theme, setTheme] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [progressStep, setProgressStep] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [polling, setPolling] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (data.url) setImageUrl(data.url);
    else setError(data.error || "Upload failed");
  }

  async function handleGenerate() {
    setError("");
    setStatus("processing");
    setProgressStep("Starting...");
    setVideoUrl("");
    setPolling(true);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, theme }),
    });
    const data = await res.json();
    if (data.projectId) {
      setProjectId(data.projectId);
      pollStatus(data.projectId);
    } else {
      setError(data.error || "Failed to start generation");
      setPolling(false);
    }
  }

  async function pollStatus(id: string) {
    let done = false;
    while (!done) {
      const res = await fetch(`/api/status/${id}`);
      const data = await res.json();
      setStatus(data.status);
      setProgressStep(data.progressStep);
      setVideoUrl(data.videoUrl);
      if (data.status === "done" || data.status === "error") {
        done = true;
        setPolling(false);
        if (data.error) setError(data.error);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return (
    <div className="max-w-xl mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">AI Product Video Ad Generator</h1>
      <div className="mb-4">
        <label className="block mb-2 font-medium">1. Upload Product Image</label>
        <input type="file" accept="image/*" onChange={handleUpload} />
        {imageUrl && <img src={imageUrl} alt="Uploaded" className="mt-2 w-32 h-32 object-cover rounded" />}
      </div>
      <div className="mb-4">
        <label className="block mb-2 font-medium">2. Select Theme</label>
        <div className="flex gap-2 flex-wrap">
          {THEMES.map((t) => (
            <button
              key={t}
              className={`px-3 py-1 rounded border ${theme === t ? "bg-black text-white" : "bg-white"}`}
              onClick={() => setTheme(t)}
              disabled={polling}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          onClick={handleGenerate}
          disabled={!imageUrl || !theme || polling}
        >
          3. Generate Ad
        </button>
      </div>
      {polling && (
        <div className="mb-4">
          <div className="flex gap-2 items-center">
            <span className="loader w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
            <span className="font-medium">{progressStep}</span>
          </div>
          <div className="flex gap-2 mt-2">
            {STEPS.map((step) => (
              <span
                key={step.key}
                className={`px-2 py-1 rounded text-xs ${status === step.key ? "bg-blue-600 text-white" : "bg-gray-200"}`}
              >
                {step.label}
              </span>
            ))}
          </div>
        </div>
      )}
      {videoUrl && (
        <div className="mb-4">
          <video src={videoUrl} controls className="w-full rounded" />
          <a
            href={videoUrl}
            download
            className="block mt-2 text-blue-600 underline"
          >
            Download Video
          </a>
        </div>
      )}
      {error && <div className="text-red-600 font-medium">{error}</div>}
    </div>
  );
}
