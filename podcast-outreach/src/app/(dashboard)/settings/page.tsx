"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  Mail,
  Key,
  Link2,
  Save,
  Check,
  AlertCircle,
} from "lucide-react";

export default function SettingsPage() {
  const [guestProfile, setGuestProfile] = useState({
    name: "",
    title: "",
    company: "",
    bio: "",
    topics: "",
    credentials: "",
    uniqueAngle: "",
    websiteUrl: "",
    linkedinUrl: "",
    twitterUrl: "",
  });

  const [emailSettings, setEmailSettings] = useState({
    senderName: "",
    signature: "",
    followUpEnabled: true,
    followUp1Days: 5,
    followUp2Days: 7,
    followUp3Days: 14,
  });

  const [integrations, setIntegrations] = useState({
    gmail: false,
    anthropic: false,
    openai: false,
    spotify: false,
    youtube: false,
  });

  const handleSaveProfile = () => {
    // TODO: Save to API
    alert("Profile saved!");
  };

  const handleSaveEmail = () => {
    // TODO: Save to API
    alert("Email settings saved!");
  };

  const handleConnectGmail = () => {
    // TODO: Initiate OAuth flow
    window.location.href = "/api/auth/gmail";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">
          Configure your profile, email settings, and integrations
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-2" />
            Guest Profile
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="h-4 w-4 mr-2" />
            Email Settings
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Key className="h-4 w-4 mr-2" />
            Integrations
          </TabsTrigger>
        </TabsList>

        {/* Guest Profile */}
        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Guest Profile</CardTitle>
              <CardDescription>
                This information is used to generate personalized pitch emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Full Name</label>
                  <Input
                    value={guestProfile.name}
                    onChange={(e) =>
                      setGuestProfile({ ...guestProfile, name: e.target.value })
                    }
                    placeholder="John Smith"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={guestProfile.title}
                    onChange={(e) =>
                      setGuestProfile({ ...guestProfile, title: e.target.value })
                    }
                    placeholder="CEO & Founder"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Company</label>
                <Input
                  value={guestProfile.company}
                  onChange={(e) =>
                    setGuestProfile({ ...guestProfile, company: e.target.value })
                  }
                  placeholder="Acme Inc."
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Bio</label>
                <textarea
                  value={guestProfile.bio}
                  onChange={(e) =>
                    setGuestProfile({ ...guestProfile, bio: e.target.value })
                  }
                  placeholder="A brief bio about yourself..."
                  className="mt-1 w-full h-24 rounded-md border border-gray-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Topics You Speak About
                </label>
                <Input
                  value={guestProfile.topics}
                  onChange={(e) =>
                    setGuestProfile({ ...guestProfile, topics: e.target.value })
                  }
                  placeholder="Leadership, AI, Startups (comma separated)"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Credentials & Social Proof
                </label>
                <textarea
                  value={guestProfile.credentials}
                  onChange={(e) =>
                    setGuestProfile({
                      ...guestProfile,
                      credentials: e.target.value,
                    })
                  }
                  placeholder="Notable achievements, previous podcast appearances, publications..."
                  className="mt-1 w-full h-20 rounded-md border border-gray-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Your Unique Angle
                </label>
                <textarea
                  value={guestProfile.uniqueAngle}
                  onChange={(e) =>
                    setGuestProfile({
                      ...guestProfile,
                      uniqueAngle: e.target.value,
                    })
                  }
                  placeholder="What makes you different from other guests?"
                  className="mt-1 w-full h-20 rounded-md border border-gray-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium">Website</label>
                  <Input
                    value={guestProfile.websiteUrl}
                    onChange={(e) =>
                      setGuestProfile({
                        ...guestProfile,
                        websiteUrl: e.target.value,
                      })
                    }
                    placeholder="https://..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">LinkedIn</label>
                  <Input
                    value={guestProfile.linkedinUrl}
                    onChange={(e) =>
                      setGuestProfile({
                        ...guestProfile,
                        linkedinUrl: e.target.value,
                      })
                    }
                    placeholder="https://linkedin.com/in/..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Twitter/X</label>
                  <Input
                    value={guestProfile.twitterUrl}
                    onChange={(e) =>
                      setGuestProfile({
                        ...guestProfile,
                        twitterUrl: e.target.value,
                      })
                    }
                    placeholder="https://twitter.com/..."
                    className="mt-1"
                  />
                </div>
              </div>

              <Button onClick={handleSaveProfile}>
                <Save className="h-4 w-4 mr-2" />
                Save Profile
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Settings */}
        <TabsContent value="email" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Configuration</CardTitle>
              <CardDescription>
                Configure how your outreach emails are sent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Sender Name</label>
                <Input
                  value={emailSettings.senderName}
                  onChange={(e) =>
                    setEmailSettings({
                      ...emailSettings,
                      senderName: e.target.value,
                    })
                  }
                  placeholder="John from Acme"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Email Signature</label>
                <textarea
                  value={emailSettings.signature}
                  onChange={(e) =>
                    setEmailSettings({
                      ...emailSettings,
                      signature: e.target.value,
                    })
                  }
                  placeholder="Best regards,&#10;John Smith&#10;CEO, Acme Inc."
                  className="mt-1 w-full h-24 rounded-md border border-gray-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-medium mb-4">Follow-up Schedule</h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium">
                      First Follow-up (days)
                    </label>
                    <Input
                      type="number"
                      value={emailSettings.followUp1Days}
                      onChange={(e) =>
                        setEmailSettings({
                          ...emailSettings,
                          followUp1Days: parseInt(e.target.value),
                        })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Second Follow-up (days)
                    </label>
                    <Input
                      type="number"
                      value={emailSettings.followUp2Days}
                      onChange={(e) =>
                        setEmailSettings({
                          ...emailSettings,
                          followUp2Days: parseInt(e.target.value),
                        })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Final Follow-up (days)
                    </label>
                    <Input
                      type="number"
                      value={emailSettings.followUp3Days}
                      onChange={(e) =>
                        setEmailSettings({
                          ...emailSettings,
                          followUp3Days: parseInt(e.target.value),
                        })
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveEmail}>
                <Save className="h-4 w-4 mr-2" />
                Save Email Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Connected Services</CardTitle>
              <CardDescription>
                Connect your accounts to enable full functionality
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="h-8 w-8 text-red-500" />
                  <div>
                    <h4 className="font-medium">Gmail</h4>
                    <p className="text-sm text-gray-500">
                      Send emails and track replies
                    </p>
                  </div>
                </div>
                {integrations.gmail ? (
                  <Badge variant="success">
                    <Check className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Button onClick={handleConnectGmail}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Connect
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-gradient-to-r from-orange-400 to-pink-500 rounded flex items-center justify-center text-white font-bold text-xs">
                    AI
                  </div>
                  <div>
                    <h4 className="font-medium">Anthropic (Claude)</h4>
                    <p className="text-sm text-gray-500">
                      Generate personalized emails
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    placeholder="API Key"
                    className="w-48"
                  />
                  <Button variant="outline">Save</Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-green-500 rounded flex items-center justify-center text-white font-bold text-xs">
                    S
                  </div>
                  <div>
                    <h4 className="font-medium">Spotify</h4>
                    <p className="text-sm text-gray-500">
                      Discover podcasts on Spotify
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input placeholder="Client ID" className="w-32" />
                  <Input
                    type="password"
                    placeholder="Client Secret"
                    className="w-32"
                  />
                  <Button variant="outline">Save</Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-red-600 rounded flex items-center justify-center text-white font-bold text-xs">
                    YT
                  </div>
                  <div>
                    <h4 className="font-medium">YouTube</h4>
                    <p className="text-sm text-gray-500">
                      Fetch transcripts and discover shows
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    placeholder="API Key"
                    className="w-48"
                  />
                  <Button variant="outline">Save</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Environment Variables</CardTitle>
              <CardDescription>
                Required environment variables for the application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm font-mono overflow-x-auto">
                <pre>{`# Database
DATABASE_URL="file:./dev.db"

# AI
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."

# Gmail OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/callback"

# Podcast APIs (optional)
SPOTIFY_CLIENT_ID="..."
SPOTIFY_CLIENT_SECRET="..."
YOUTUBE_API_KEY="..."`}</pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
