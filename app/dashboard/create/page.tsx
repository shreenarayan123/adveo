"use client"

import type React from "react"

import { useState } from "react"
import { Upload, Check, RefreshCw, Play, Loader2, Sparkles, X, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"

const steps = [
  { id: 1, title: "Upload Product" },
  { id: 2, title: "Choose Theme" },
  { id: 3, title: "Creative Tools" },
  { id: 4, title: "Review & Generate" },
]

const themes = [
  { id: "nature", name: "Nature", description: "Lush greenery & natural light" },
  { id: "jungle", name: "Jungle", description: "Wild tropical vibes" },
  { id: "ice", name: "Ice", description: "Cool crystalline aesthetics" },
  { id: "desert", name: "Desert", description: "Warm sandy tones" },
  { id: "luxury", name: "Luxury", description: "Premium gold & marble" },
  { id: "minimalistic", name: "Minimalistic", description: "Clean & modern" },
  { id: "futuristic", name: "Futuristic", description: "Tech-forward neon" },
  { id: "vintage", name: "Vintage", description: "Nostalgic retro feel" },
]

const voiceOptions = [
  { id: "excited-male", name: "Excited Male", description: "Energetic & upbeat" },
  { id: "calm-female", name: "Calm Female", description: "Soothing & professional" },
  { id: "deep-male", name: "Deep Male", description: "Authoritative & rich" },
  { id: "young-female", name: "Young Female", description: "Fresh & friendly" },
  { id: "old-male", name: "Wise Elder", description: "Warm & trustworthy" },
  { id: "narrator", name: "Narrator", description: "Documentary style" },
]

const generationSteps = [
  "Analyzing product image...",
  "Generating product shots...",
  "Sending to Veo...",
  "Generating audio with ElevenLabs...",
  "Syncing audio with video...",
  "Finalizing render...",
]

export default function CreateVideoPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [productImage, setProductImage] = useState<string | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null)
  const [ideation, setIdeation] = useState("")
  const [script, setScript] = useState("")
  const [dialogue, setDialogue] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [currentGenerationStep, setCurrentGenerationStep] = useState(0)
  const [removeBackground, setRemoveBackground] = useState(false)
  const [productFile, setProductFile] = useState<File | null>(null)
  const [rawDraftJson, setRawDraftJson] = useState("")

  const [productName, setProductName] = useState("")
  const [productCategory, setProductCategory] = useState("beauty")

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setProductFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setProductImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const generateContent = async (type: "ideation" | "script" | "dialogue") => {
    if (type === "ideation") {
      setIdeation("Generating ideas...");
      const upRes = await fetch('/api/draft/ideation', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: selectedTheme || 'general', productName: productName || 'My Product' })
      });
      const data = await upRes.json();
      if(data.idea) setIdeation(data.idea);
      else setIdeation("Failed to generate.");
    }
    
    if (type === "script" || type === "dialogue") {
      if(!ideation || ideation.includes("Generating")) return;
      setScript("Drafting script...");
      setDialogue("Drafting dialogue...");
      const upRes = await fetch('/api/draft/script', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideation: ideation || 'A creative ad' })
      });
      const data = await upRes.json();
      if(data.script) setScript(data.script);
      if(data.dialogue) setDialogue(data.dialogue);
      if(data.rawJson) setRawDraftJson(JSON.stringify(data.rawJson));
    }
  }

  const handleGenerateVideo = async () => {
    setIsGenerating(true)
    setGenerationProgress(5)
    setCurrentGenerationStep(0)

    try {
      let uploadedUrl = productImage;
      if (productFile) {
        const fd = new FormData();
        fd.append('file', productFile);
        const upRes = await fetch('/api/upload', { method: 'POST', body: fd });
        const upData = await upRes.json();
        uploadedUrl = upData.url;
      }

      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageUrl: uploadedUrl, 
          theme: selectedTheme,
          voice: selectedVoice,
          productName: productName || 'My Product',
          category: productCategory,
          customScriptJson: rawDraftJson
        })
      });
      const data = await resp.json();
      if (data.projectId) {
        pollStatus(data.projectId);
      } else {
        alert("Generation failed to start: " + (data.error || "Unknown"));
        setIsGenerating(false);
      }
    } catch (err) {
      console.error(err);
      alert("Error starting generation");
      setIsGenerating(false);
    }
  }

  const pollStatus = (projectId: string) => {
    const interval = setInterval(async () => {
      try {
        const statusResp = await fetch(`/api/status/${projectId}`);
        const statusData = await statusResp.json();
        const stepMap: Record<string, number> = {
          'processing': 0, 'script': 1, 'shots': 2, 'video': 2, 'audio': 3, 'finalizing': 4, 'done': 5,
        };
        
        if (statusData.status) {
          const idx = stepMap[statusData.status] || 0;
          setCurrentGenerationStep(Math.min(idx, generationSteps.length - 1));
          setGenerationProgress(idx * 20); // roughly 20% per step
        }

        if (statusData.status === 'done') {
          clearInterval(interval);
          setGenerationProgress(100);
          setCurrentGenerationStep(generationSteps.length - 1);
          setTimeout(() => setIsGenerating(false), 800);
        } else if (statusData.status === 'error') {
          clearInterval(interval);
          alert("Pipeline Error: " + statusData.error);
          setIsGenerating(false);
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 2000);
  }

  const canProceed = () => {
    if (currentStep === 1) return !!productImage
    if (currentStep === 2) return !!selectedTheme
    if (currentStep === 3) return ideation && script && dialogue && selectedVoice
    return true
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Progress Indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                  currentStep > step.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : currentStep === step.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground"
                }`}
              >
                {currentStep > step.id ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-medium">{step.id}</span>
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium ${
                  currentStep >= step.id ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`mx-2 h-0.5 w-16 sm:w-24 ${currentStep > step.id ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStep - 1].title}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Step 1: Upload Product Image */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {!productImage ? (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-12 transition-colors hover:border-primary/50 hover:bg-muted/50">
                  <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
                  <span className="mb-2 text-lg font-medium">Drop your product image here</span>
                  <span className="text-sm text-muted-foreground">or click to browse</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              ) : (
                <div className="space-y-4">
                  <div className="relative mx-auto w-fit">
                    <img
                      src={productImage || "/placeholder.svg"}
                      alt="Product preview"
                      className="max-h-64 rounded-xl object-contain"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -right-2 -top-2 h-8 w-8"
                      onClick={() => setProductImage(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      variant={removeBackground ? "default" : "outline"}
                      onClick={() => setRemoveBackground(!removeBackground)}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      {removeBackground ? "Background Removed" : "Remove Background"}
                    </Button>
                  </div>
                  <div className="mt-6 space-y-4 rounded-xl border border-border p-4 bg-muted/10">
                    <h3 className="font-medium text-sm">Product Details</h3>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Product Name</label>
                      <input 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
                        value={productName} 
                        onChange={e => setProductName(e.target.value)} 
                        placeholder="e.g. Ocean Blue Perfume" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Category</label>
                      <select 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
                        value={productCategory} 
                        onChange={e => setProductCategory(e.target.value)}
                      >
                         <option value="electronics">Electronics</option>
                         <option value="fashion">Fashion</option>
                         <option value="beauty">Beauty</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Choose Theme */}
          {currentStep === 2 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setSelectedTheme(theme.id)}
                  className={`flex flex-col items-center rounded-xl border-2 p-4 text-center transition-all hover:border-primary/50 ${
                    selectedTheme === theme.id ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <span className="font-medium">{theme.name}</span>
                  <span className="mt-1 text-xs text-muted-foreground">{theme.description}</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 3: Creative Tools */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Ideation */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Scene Ideation</h3>
                  <Button variant="outline" size="sm" onClick={() => generateContent("ideation")}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate
                  </Button>
                </div>
                <Textarea
                  placeholder="AI-generated scene concepts will appear here..."
                  value={ideation}
                  onChange={(e) => setIdeation(e.target.value)}
                  rows={4}
                />
                {ideation && (
                  <Button variant="ghost" size="sm" onClick={() => generateContent("ideation")}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                )}
              </div>

              {/* Script */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Video Script</h3>
                  <Button variant="outline" size="sm" onClick={() => generateContent("script")}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate
                  </Button>
                </div>
                <Textarea
                  placeholder="Scene-by-scene description will appear here..."
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={4}
                />
                {script && (
                  <Button variant="ghost" size="sm" onClick={() => generateContent("script")}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                )}
              </div>

              {/* Dialogue */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Voice Narration</h3>
                  <Button variant="outline" size="sm" onClick={() => generateContent("dialogue")}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate
                  </Button>
                </div>
                <Textarea
                  placeholder="Narration lines will appear here..."
                  value={dialogue}
                  onChange={(e) => setDialogue(e.target.value)}
                  rows={4}
                />
                {dialogue && (
                  <Button variant="ghost" size="sm" onClick={() => generateContent("dialogue")}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                )}
              </div>

              {/* Voice Selection */}
              <div className="space-y-3">
                <h3 className="font-medium">Select Voice</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {voiceOptions.map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => setSelectedVoice(voice.id)}
                      className={`rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50 ${
                        selectedVoice === voice.id ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <span className="font-medium">{voice.name}</span>
                      <p className="text-xs text-muted-foreground">{voice.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Generate */}
          {currentStep === 4 && (
            <div className="space-y-6">
              {!isGenerating ? (
                <>
                  {/* Summary */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-border p-4">
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">Product</h4>
                      {productImage && (
                        <img
                          src={productImage || "/placeholder.svg"}
                          alt="Product"
                          className="h-24 rounded-lg object-contain"
                        />
                      )}
                    </div>
                    <div className="rounded-xl border border-border p-4">
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">Theme</h4>
                      <p className="font-medium capitalize">{selectedTheme}</p>
                    </div>
                    <div className="rounded-xl border border-border p-4">
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">Voice</h4>
                      <p className="font-medium">{voiceOptions.find((v) => v.id === selectedVoice)?.name}</p>
                    </div>
                    <div className="rounded-xl border border-border p-4">
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">Scenes</h4>
                      <p className="font-medium">{ideation.split("\n").length} scenes planned</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">Script Preview</h4>
                    <p className="text-sm">{script.substring(0, 200)}...</p>
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">Narration Preview</h4>
                    <p className="text-sm">{dialogue.substring(0, 150)}...</p>
                  </div>

                  <Button size="lg" className="w-full" onClick={handleGenerateVideo}>
                    <Play className="mr-2 h-5 w-5" />
                    Generate Final Video
                  </Button>
                </>
              ) : (
                <div className="space-y-6 py-8">
                  <div className="flex flex-col items-center">
                    <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
                    <h3 className="mb-2 text-lg font-medium">Creating Your Video</h3>
                    <p className="text-sm text-muted-foreground">{generationSteps[currentGenerationStep]}</p>
                  </div>
                  <Progress value={generationProgress} className="h-2" />
                  <div className="space-y-2">
                    {generationSteps.map((step, index) => (
                      <div
                        key={step}
                        className={`flex items-center gap-2 text-sm ${
                          index <= currentGenerationStep ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {index < currentGenerationStep ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : index === currentGenerationStep ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-border" />
                        )}
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      {!isGenerating && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
          >
            Previous
          </Button>
          {currentStep < 4 && (
            <Button onClick={() => setCurrentStep((prev) => Math.min(4, prev + 1))} disabled={!canProceed()}>
              Continue
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
