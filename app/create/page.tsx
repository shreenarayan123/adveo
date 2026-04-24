"use client";
import React, { useState, useRef } from "react";

const THEMES = [
  { id: "studio",    label: "Studio",     emoji: "🎬" },
  { id: "luxury",    label: "Luxury",     emoji: "✨" },
  { id: "energy",    label: "Energy",     emoji: "⚡" },
  { id: "nature",    label: "Nature",     emoji: "🌿" },
  { id: "minimal",   label: "Minimal",    emoji: "◻" },
  { id: "lifestyle", label: "Lifestyle",  emoji: "🌅" },
];

const VOICES = [
  { id: "calm-female",   label: "Calm Female",       desc: "Dorothy — smooth & trustworthy" },
  { id: "excited-male",  label: "Energetic Male",    desc: "Adam — punchy & direct" },
  { id: "deep-male",     label: "Deep & Authoritative", desc: "Arnold — commanding" },
  { id: "young-female",  label: "Young Female",      desc: "Bella — light & relatable" },
  { id: "narrator",      label: "Documentary",       desc: "Arnold — storytelling" },
];

const STEPS = [
  { key: "script",  label: "Script",   icon: "✍" },
  { key: "video",   label: "Video",    icon: "🎬" },
  { key: "audio",   label: "Audio",    icon: "🎙" },
  { key: "done",    label: "Done",     icon: "✅" },
];

export default function CreatePage() {
  const [imageUrl, setImageUrl]             = useState("");
  const [imagePreview, setImagePreview]     = useState("");
  const [theme, setTheme]                   = useState("");
  const [brand, setBrand]                   = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [features, setFeatures]             = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [voice, setVoice]                   = useState("calm-female");
  const [projectId, setProjectId]           = useState("");
  const [status, setStatus]                 = useState("");
  const [progressStep, setProgressStep]     = useState("");
  const [videoUrl, setVideoUrl]             = useState("");
  const [error, setError]                   = useState("");
  const [polling, setPolling]               = useState(false);
  const [uploading, setUploading]           = useState(false);
  const [script, setScript]                 = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");

    // Show local preview immediately
    setImagePreview(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) setImageUrl(data.url);
      else setError(data.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
    if (!imageUrl || !theme || !brand.trim() || !productDescription.trim()) return;
    setError("");
    setStatus("processing");
    setProgressStep("Generating script...");
    setVideoUrl("");
    setScript(null);
    setPolling(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          theme,
          brand: brand.trim(),
          productDescription: productDescription.trim(),
          features: features.trim(),
          targetAudience: targetAudience.trim() || "general audience",
          voice,
        }),
      });
      const data = await res.json();
      if (data.projectId) {
        setProjectId(data.projectId);
        if (data.script) setScript(data.script);
        pollStatus(data.projectId);
      } else {
        setError(data.error || "Failed to start generation");
        setPolling(false);
        setStatus("");
      }
    } catch (err: any) {
      setError(err.message || "Network error");
      setPolling(false);
      setStatus("");
    }
  }

  async function pollStatus(id: string) {
    let done = false;
    while (!done) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch(`/api/status/${id}`);
        const data = await res.json();
        setStatus(data.status);
        setProgressStep(data.progressStep || "");
        if (data.videoUrl) setVideoUrl(data.videoUrl);
        if (data.status === "done" || data.status === "error") {
          done = true;
          setPolling(false);
          if (data.error) setError(data.error);
        }
      } catch {
        // network hiccup — keep polling
      }
    }
  }

  const canGenerate = imageUrl && theme && brand.trim() && productDescription.trim() && !polling;
  const currentStep = STEPS.find((s) => s.key === status);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* Header */}
      <header className="border-b border-white/10 px-8 py-5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-sm font-bold">A</div>
        <span className="font-semibold text-lg tracking-tight">adveo</span>
        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">AI Ad Studio</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">

        <div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Generate your product ad
          </h1>
          <p className="mt-2 text-white/50 text-sm">Upload a product image → get an 18-second cinematic ad with voiceover.</p>
        </div>

        {/* ── Step 1: Product Image ── */}
        <section className="space-y-3">
          <Label step="1" text="Product Image" />
          <div
            className="relative border-2 border-dashed border-white/20 rounded-2xl p-8 text-center cursor-pointer hover:border-violet-500/60 hover:bg-violet-500/5 transition-all"
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? (
              <div className="flex items-center gap-6">
                <img src={imagePreview} alt="Product" className="w-24 h-24 object-contain rounded-xl ring-2 ring-violet-500/40" />
                <div className="text-left">
                  <p className="text-sm font-medium text-white/80">{uploading ? "Uploading…" : imageUrl ? "Image uploaded ✓" : "Processing…"}</p>
                  <p className="text-xs text-white/40 mt-1">Click to change</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl mx-auto">📦</div>
                <p className="text-white/60 text-sm">Click to upload product image</p>
                <p className="text-white/30 text-xs">PNG, JPG, WEBP — clear product shot works best</p>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
                <Spinner />
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </section>

        {/* ── Step 2: Product Info ── */}
        <section className="space-y-4">
          <Label step="2" text="Product Details" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-white/50 uppercase tracking-wider">Brand</label>
              <input
                id="brand-input"
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Quaker, Nike, CeraVe"
                disabled={polling}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-all disabled:opacity-40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/50 uppercase tracking-wider">Product</label>
              <input
                id="product-input"
                type="text"
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="e.g. Mocha Oats, Air Max 95"
                disabled={polling}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-all disabled:opacity-40"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-white/50 uppercase tracking-wider">Key Features <span className="text-white/25">(optional but improves specificity)</span></label>
            <textarea
              id="features-input"
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder="e.g. 20g protein per serving, Mocha flavour, no added sugar, ready in 2 minutes"
              disabled={polling}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-all disabled:opacity-40 resize-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-white/50 uppercase tracking-wider">Target Audience <span className="text-white/25">(optional)</span></label>
            <input
              id="audience-input"
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="e.g. fitness enthusiasts aged 25-35, busy moms, sneakerheads"
              disabled={polling}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-all disabled:opacity-40"
            />
          </div>
        </section>

        {/* ── Step 3: Theme ── */}
        <section className="space-y-3">
          <Label step="3" text="Ad Theme" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {THEMES.map((t) => (
              <button
                key={t.id}
                id={`theme-${t.id}`}
                onClick={() => setTheme(t.id)}
                disabled={polling}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 ${
                  theme === t.id
                    ? "border-violet-500 bg-violet-500/20 text-violet-200"
                    : "border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:text-white"
                }`}
              >
                <span className="text-lg">{t.emoji}</span>
                <span className="text-xs">{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Step 4: Voice ── */}
        <section className="space-y-3">
          <Label step="4" text="Voiceover Style" />
          <div className="space-y-2">
            {VOICES.map((v) => (
              <button
                key={v.id}
                id={`voice-${v.id}`}
                onClick={() => setVoice(v.id)}
                disabled={polling}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl border text-left transition-all disabled:opacity-40 ${
                  voice === v.id
                    ? "border-violet-500 bg-violet-500/15 text-white"
                    : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white"
                }`}
              >
                <span className="text-lg">🎙</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{v.label}</p>
                  <p className="text-xs text-white/40">{v.desc}</p>
                </div>
                {voice === v.id && <span className="text-violet-400 text-xs">✓ Selected</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ── Generate Button ── */}
        <button
          id="generate-btn"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full py-4 rounded-2xl font-semibold text-sm tracking-wide transition-all
            bg-gradient-to-r from-violet-600 to-fuchsia-600
            hover:from-violet-500 hover:to-fuchsia-500
            disabled:opacity-30 disabled:cursor-not-allowed
            shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40"
        >
          {polling ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner size={14} /> Generating your ad…
            </span>
          ) : (
            "✨ Generate 18-second Ad"
          )}
        </button>

        {/* ── Progress ── */}
        {polling && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Spinner />
              <span className="text-sm text-white/70">{progressStep || "Processing…"}</span>
            </div>
            <div className="flex gap-2">
              {STEPS.map((step) => {
                const isActive = step.key === status;
                const isDone = STEPS.indexOf(step) < STEPS.findIndex((s) => s.key === status);
                return (
                  <div
                    key={step.key}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-center transition-all ${
                      isActive ? "bg-violet-500/20 border border-violet-500/40" :
                      isDone ? "bg-white/10 border border-white/10" :
                      "border border-white/5"
                    }`}
                  >
                    <span className="text-base">{step.icon}</span>
                    <span className={`text-xs ${isActive ? "text-violet-300" : isDone ? "text-white/60" : "text-white/20"}`}>{step.label}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Script Preview ── */}
        {script && !videoUrl && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
            <p className="text-xs text-white/40 uppercase tracking-wider font-medium">Script generated — video generating…</p>
            {script.hook && (
              <p className="text-sm text-white/80"><span className="text-violet-400 font-medium">Hook:</span> {script.hook}</p>
            )}
            {script.narrativeArc && (
              <p className="text-sm text-white/80"><span className="text-violet-400 font-medium">Arc:</span> {script.narrativeArc}</p>
            )}
            {script.voiceoverScript?.fullScript && (
              <p className="text-sm text-white/60 italic">"{script.voiceoverScript.fullScript}"</p>
            )}
          </section>
        )}

        {/* ── Final Video ── */}
        {videoUrl && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20 text-green-400 text-xs">✓</span>
              <p className="text-sm font-medium text-green-400">Your ad is ready!</p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
              <video src={videoUrl} controls autoPlay loop playsInline className="w-full aspect-video" />
            </div>
            <div className="flex gap-3">
              <a
                href={videoUrl}
                download
                className="flex-1 py-3 rounded-xl border border-white/20 text-center text-sm text-white/70 hover:text-white hover:border-white/40 transition-all"
              >
                ⬇ Download MP4
              </a>
              <button
                onClick={() => {
                  setVideoUrl(""); setScript(null); setStatus(""); setError(""); setProgressStep("");
                }}
                className="flex-1 py-3 rounded-xl bg-white/10 text-center text-sm text-white hover:bg-white/20 transition-all"
              >
                + New Ad
              </button>
            </div>
          </section>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}

function Label({ step, text }: { step: string | number; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/30 text-violet-300 text-xs font-bold">{step}</span>
      <span className="text-sm font-semibold text-white/80">{text}</span>
    </div>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="animate-spin"
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
