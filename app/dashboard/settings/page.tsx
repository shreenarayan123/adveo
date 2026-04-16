"use client"

import { useState } from "react"
import { Eye, EyeOff, Save, User, Key, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function SettingsPage() {
  const [showApiKeys, setShowApiKeys] = useState({
    veo: false,
    openai: false,
    elevenlabs: false,
  })

  const toggleApiKeyVisibility = (key: "veo" | "openai" | "elevenlabs") => {
    setShowApiKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-muted-foreground">Manage your account and API integrations</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2">
            <Key className="h-4 w-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-10 w-10 text-primary" />
                </div>
                <Button variant="outline">Change Avatar</Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" defaultValue="John" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" defaultValue="Doe" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue="john@example.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" defaultValue="Acme Inc." />
              </div>

              <Button>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Connect your AI services to enable video generation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Veo API */}
              <div className="space-y-2">
                <Label htmlFor="veo">Google Cloud Vertex AI Access</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="veo"
                      type={showApiKeys.veo ? "text" : "password"}
                      placeholder="Service account / ADC path managed in .env"
                      defaultValue="./decisive-light-492716-d1-0ebdd94c891b.json"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => toggleApiKeyVisibility("veo")}
                    >
                      {showApiKeys.veo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button variant="outline">Test</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used for AI video generation through Vertex AI. Configure your Google Cloud project ID, region, and service account credentials in .env.
                </p>
              </div>

              {/* OpenAI API */}
              <div className="space-y-2">
                <Label htmlFor="openai">OpenAI API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="openai"
                      type={showApiKeys.openai ? "text" : "password"}
                      placeholder="Enter your OpenAI API key"
                      defaultValue="sk-xxxxxxxxxxxxxxxxxxxx"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => toggleApiKeyVisibility("openai")}
                    >
                      {showApiKeys.openai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button variant="outline">Test</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used for script and ideation generation. Get your key from OpenAI.
                </p>
              </div>

              {/* ElevenLabs API */}
              <div className="space-y-2">
                <Label htmlFor="elevenlabs">ElevenLabs API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="elevenlabs"
                      type={showApiKeys.elevenlabs ? "text" : "password"}
                      placeholder="Enter your ElevenLabs API key"
                      defaultValue="el_xxxxxxxxxxxxxxxxxxxx"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => toggleApiKeyVisibility("elevenlabs")}
                    >
                      {showApiKeys.elevenlabs ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button variant="outline">Test</Button>
                </div>
                <p className="text-xs text-muted-foreground">Used for voice narration. Get your key from ElevenLabs.</p>
              </div>

              <Button>
                <Save className="mr-2 h-4 w-4" />
                Save API Keys
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Video Generation Complete</p>
                  <p className="text-sm text-muted-foreground">Get notified when your video is ready</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Weekly Summary</p>
                  <p className="text-sm text-muted-foreground">Receive a weekly report of your activity</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Product Updates</p>
                  <p className="text-sm text-muted-foreground">Learn about new features and improvements</p>
                </div>
                <Switch />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Marketing Emails</p>
                  <p className="text-sm text-muted-foreground">Tips, tutorials, and promotional content</p>
                </div>
                <Switch />
              </div>

              <Button>
                <Save className="mr-2 h-4 w-4" />
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
