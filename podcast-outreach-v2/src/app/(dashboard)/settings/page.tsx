"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User,
  Mail,
  Key,
  Link2,
  Save,
  Check,
  Target,
  Plus,
  Trash2,
  GripVertical,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Database,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";

interface Criterion {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isEnabled: boolean;
  isRequired: boolean;
  isCustom: boolean;
  weight: number;
  promptHint: string | null;
  sortOrder: number;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"profile" | "criteria" | "email" | "apikeys" | "integrations">("profile");

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

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedProfile = localStorage.getItem("guest-profile");
      const storedEmailSettings = localStorage.getItem("email-settings");
      if (storedProfile) {
        try {
          setGuestProfile(JSON.parse(storedProfile));
        } catch {}
      }
      if (storedEmailSettings) {
        try {
          setEmailSettings(JSON.parse(storedEmailSettings));
        } catch {}
      }
    }
  }, []);

  const handleSaveProfile = () => {
    // Save to localStorage for email generation
    if (typeof window !== "undefined") {
      localStorage.setItem("guest-profile", JSON.stringify(guestProfile));
    }
    alert("Profile saved!");
  };

  const handleSaveEmail = () => {
    // Save to localStorage for email generation
    if (typeof window !== "undefined") {
      localStorage.setItem("email-settings", JSON.stringify(emailSettings));
    }
    alert("Email settings saved!");
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#02121a]">Settings</h1>
        <p className="text-sm text-[#006073]">
          Configure your profile, targeting criteria, and integrations
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#94d2bd] mb-6">
        <div className="flex gap-6">
          <TabButton
            active={activeTab === "profile"}
            onClick={() => setActiveTab("profile")}
            icon={User}
          >
            Guest Profile
          </TabButton>
          <TabButton
            active={activeTab === "criteria"}
            onClick={() => setActiveTab("criteria")}
            icon={Target}
          >
            Perfect Podcast
          </TabButton>
          <TabButton
            active={activeTab === "email"}
            onClick={() => setActiveTab("email")}
            icon={Mail}
          >
            Email Settings
          </TabButton>
          <TabButton
            active={activeTab === "apikeys"}
            onClick={() => setActiveTab("apikeys")}
            icon={Database}
          >
            API Keys
          </TabButton>
          <TabButton
            active={activeTab === "integrations"}
            onClick={() => setActiveTab("integrations")}
            icon={Key}
          >
            Integrations
          </TabButton>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "profile" && (
        <GuestProfileTab
          profile={guestProfile}
          onChange={setGuestProfile}
          onSave={handleSaveProfile}
        />
      )}
      {activeTab === "criteria" && <PerfectPodcastTab />}
      {activeTab === "email" && (
        <EmailSettingsTab
          settings={emailSettings}
          onChange={setEmailSettings}
          onSave={handleSaveEmail}
        />
      )}
      {activeTab === "apikeys" && <ApiKeysManager />}
      {activeTab === "integrations" && <IntegrationsTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-[#0a9396] text-[#0a9396]"
          : "border-transparent text-[#006073] hover:text-[#02121a]"
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

// ================== Perfect Podcast Tab ==================

function PerfectPodcastTab() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCriterion, setNewCriterion] = useState({
    name: "",
    description: "",
    category: "general",
    isRequired: false,
    weight: 3,
    promptHint: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["criteria"],
    queryFn: async () => {
      const res = await fetch("/api/settings/criteria");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Criterion>) => {
      const res = await fetch(`/api/settings/criteria/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newCriterion) => {
      const res = await fetch("/api/settings/criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
      setShowAddForm(false);
      setNewCriterion({
        name: "",
        description: "",
        category: "general",
        isRequired: false,
        weight: 3,
        promptHint: "",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/criteria/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
    },
  });

  const criteria: Criterion[] = data?.criteria || [];

  // Group by category
  const categories = [
    { id: "content", label: "Content & Topics" },
    { id: "audience", label: "Audience & Reach" },
    { id: "technical", label: "Technical Quality" },
    { id: "general", label: "General Requirements" },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[#0a9396]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="bg-[#d4f0e7] border border-[#94d2bd] rounded-lg p-4">
        <div className="flex gap-3">
          <Target className="h-5 w-5 text-[#0a9396] flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-[#02121a]">Define Your Perfect Podcast</h3>
            <p className="text-sm text-[#006073] mt-1">
              These criteria help the AI determine which podcasts are worth pursuing.
              Required criteria must be met, while others influence the overall fit score.
            </p>
          </div>
        </div>
      </div>

      {/* Criteria by Category */}
      {categories.map((category) => {
        const categoryCriteria = criteria.filter((c) => c.category === category.id);
        if (categoryCriteria.length === 0) return null;

        return (
          <div key={category.id} className="bg-white border border-[#94d2bd] rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-[#f5edd8] border-b border-[#94d2bd]">
              <h3 className="font-medium text-[#02121a]">{category.label}</h3>
            </div>
            <div className="divide-y divide-[#94d2bd]">
              {categoryCriteria.map((criterion) => (
                <CriterionRow
                  key={criterion.id}
                  criterion={criterion}
                  onUpdate={(data) => updateMutation.mutate({ id: criterion.id, ...data })}
                  onDelete={() => {
                    if (confirm("Delete this criterion?")) {
                      deleteMutation.mutate(criterion.id);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Add Custom Criterion */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-3 border-2 border-dashed border-[#94d2bd] rounded-lg text-[#006073] hover:border-[#0a9396] hover:text-[#0a9396] transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Custom Criterion
        </button>
      ) : (
        <div className="bg-white border border-[#94d2bd] rounded-lg p-4 space-y-4">
          <h3 className="font-medium text-[#02121a]">New Custom Criterion</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-[#006073]">Name *</label>
              <input
                type="text"
                value={newCriterion.name}
                onChange={(e) => setNewCriterion({ ...newCriterion, name: e.target.value })}
                placeholder="e.g., Has social media presence"
                className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-sm text-[#02121a] placeholder:text-[#006073]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#006073]">Category</label>
              <select
                value={newCriterion.category}
                onChange={(e) => setNewCriterion({ ...newCriterion, category: e.target.value })}
                className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-sm text-[#02121a] placeholder:text-[#006073]"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[#006073]">Description</label>
            <input
              type="text"
              value={newCriterion.description}
              onChange={(e) => setNewCriterion({ ...newCriterion, description: e.target.value })}
              placeholder="Brief explanation of what this criterion checks"
              className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-sm text-[#02121a] placeholder:text-[#006073]"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[#006073]">AI Evaluation Hint</label>
            <textarea
              value={newCriterion.promptHint}
              onChange={(e) => setNewCriterion({ ...newCriterion, promptHint: e.target.value })}
              placeholder="Instructions for how the AI should evaluate this criterion..."
              rows={2}
              className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-sm text-[#02121a] placeholder:text-[#006073]"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newCriterion.isRequired}
                onChange={(e) => setNewCriterion({ ...newCriterion, isRequired: e.target.checked })}
                className="rounded border-[#94d2bd]"
              />
              <span className="text-sm text-[#006073]">Required (instant skip if not met)</span>
            </label>

            <div className="flex items-center gap-2">
              <label className="text-sm text-[#006073]">Importance:</label>
              <select
                value={newCriterion.weight}
                onChange={(e) => setNewCriterion({ ...newCriterion, weight: parseInt(e.target.value) })}
                className="border border-[#94d2bd] rounded px-2 py-1 text-sm text-[#02121a]"
              >
                <option value={1}>Low (1)</option>
                <option value={2}>Medium-Low (2)</option>
                <option value={3}>Medium (3)</option>
                <option value={4}>Medium-High (4)</option>
                <option value={5}>High (5)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => createMutation.mutate(newCriterion)}
              disabled={!newCriterion.name || createMutation.isPending}
              className="px-4 py-2 bg-[#0a9396] text-white rounded-lg hover:bg-[#006073] disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Criterion
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-[#94d2bd] text-[#006073] rounded-lg hover:bg-[#f5edd8]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CriterionRow({
  criterion,
  onUpdate,
  onDelete,
}: {
  criterion: Criterion;
  onUpdate: (data: Partial<Criterion>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="px-4 py-3 flex items-start gap-4">
      {/* Enable/Disable Toggle */}
      <button
        onClick={() => onUpdate({ isEnabled: !criterion.isEnabled })}
        className={cn(
          "mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
          criterion.isEnabled
            ? "bg-[#0a9396] border-[#0a9396] text-white"
            : "border-[#94d2bd] text-transparent hover:border-[#006073]"
        )}
      >
        <Check className="h-3 w-3" />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-medium",
            criterion.isEnabled ? "text-[#02121a]" : "text-[#006073]"
          )}>
            {criterion.name}
          </span>
          {criterion.isRequired && (
            <span className="px-1.5 py-0.5 bg-[#fce8e9] text-[#9d2227] text-xs font-medium rounded">
              Required
            </span>
          )}
          {criterion.isCustom && (
            <span className="px-1.5 py-0.5 bg-[#94d2bd] text-[#006073] text-xs font-medium rounded">
              Custom
            </span>
          )}
        </div>
        {criterion.description && (
          <p className={cn(
            "text-sm mt-0.5",
            criterion.isEnabled ? "text-[#006073]" : "text-[#006073]"
          )}>
            {criterion.description}
          </p>
        )}
      </div>

      {/* Weight */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {[1, 2, 3, 4, 5].map((w) => (
          <button
            key={w}
            onClick={() => onUpdate({ weight: w })}
            className={cn(
              "w-2 h-4 rounded-sm transition-colors",
              w <= criterion.weight
                ? criterion.isEnabled ? "bg-[#d4f0e7]0" : "bg-[#94d2bd]"
                : "bg-[#ead7a5]"
            )}
            title={`Weight: ${w}`}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {criterion.isCustom && (
          <button
            onClick={onDelete}
            className="p-1 text-[#006073] hover:text-[#9d2227] rounded"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ================== Guest Profile Tab ==================

function GuestProfileTab({
  profile,
  onChange,
  onSave,
}: {
  profile: any;
  onChange: (profile: any) => void;
  onSave: () => void;
}) {
  return (
    <div className="bg-white border border-[#94d2bd] rounded-lg">
      <div className="px-6 py-4 border-b border-[#94d2bd]">
        <h2 className="font-semibold text-[#02121a]">Your Guest Profile</h2>
        <p className="text-sm text-[#006073]">
          This information is used to generate personalized pitch emails
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-[#006073]">Full Name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => onChange({ ...profile, name: e.target.value })}
              placeholder="John Smith"
              className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#006073]">Title</label>
            <input
              type="text"
              value={profile.title}
              onChange={(e) => onChange({ ...profile, title: e.target.value })}
              placeholder="CEO & Founder"
              className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-[#006073]">Company</label>
          <input
            type="text"
            value={profile.company}
            onChange={(e) => onChange({ ...profile, company: e.target.value })}
            placeholder="Acme Inc."
            className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[#006073]">Bio</label>
          <textarea
            value={profile.bio}
            onChange={(e) => onChange({ ...profile, bio: e.target.value })}
            placeholder="A brief bio about yourself..."
            rows={3}
            className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[#006073]">Topics You Speak About</label>
          <input
            type="text"
            value={profile.topics}
            onChange={(e) => onChange({ ...profile, topics: e.target.value })}
            placeholder="Leadership, AI, Startups (comma separated)"
            className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[#006073]">Credentials & Social Proof</label>
          <textarea
            value={profile.credentials}
            onChange={(e) => onChange({ ...profile, credentials: e.target.value })}
            placeholder="Notable achievements, previous podcast appearances, publications..."
            rows={2}
            className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[#006073]">Your Unique Angle</label>
          <textarea
            value={profile.uniqueAngle}
            onChange={(e) => onChange({ ...profile, uniqueAngle: e.target.value })}
            placeholder="What makes you different from other guests?"
            rows={2}
            className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-[#006073]">Website</label>
            <input
              type="url"
              value={profile.websiteUrl}
              onChange={(e) => onChange({ ...profile, websiteUrl: e.target.value })}
              placeholder="https://..."
              className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#006073]">LinkedIn</label>
            <input
              type="url"
              value={profile.linkedinUrl}
              onChange={(e) => onChange({ ...profile, linkedinUrl: e.target.value })}
              placeholder="https://linkedin.com/in/..."
              className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#006073]">Twitter/X</label>
            <input
              type="url"
              value={profile.twitterUrl}
              onChange={(e) => onChange({ ...profile, twitterUrl: e.target.value })}
              placeholder="https://twitter.com/..."
              className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
            />
          </div>
        </div>

        <button
          onClick={onSave}
          className="px-4 py-2 bg-[#0a9396] text-white rounded-lg hover:bg-[#006073] flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          Save Profile
        </button>
      </div>
    </div>
  );
}

// ================== Email Settings Tab ==================

function EmailSettingsTab({
  settings,
  onChange,
  onSave,
}: {
  settings: any;
  onChange: (settings: any) => void;
  onSave: () => void;
}) {
  return (
    <div className="bg-white border border-[#94d2bd] rounded-lg">
      <div className="px-6 py-4 border-b border-[#94d2bd]">
        <h2 className="font-semibold text-[#02121a]">Email Configuration</h2>
        <p className="text-sm text-[#006073]">
          Configure how your outreach emails are sent
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-[#006073]">Sender Name</label>
          <input
            type="text"
            value={settings.senderName}
            onChange={(e) => onChange({ ...settings, senderName: e.target.value })}
            placeholder="John from Acme"
            className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[#006073]">Email Signature</label>
          <textarea
            value={settings.signature}
            onChange={(e) => onChange({ ...settings, signature: e.target.value })}
            placeholder="Best regards,&#10;John Smith&#10;CEO, Acme Inc."
            rows={4}
            className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
          />
        </div>

        <div className="pt-4 border-t border-[#94d2bd]">
          <h4 className="font-medium text-[#02121a] mb-4">Follow-up Schedule</h4>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-[#006073]">First Follow-up (days)</label>
              <input
                type="number"
                value={settings.followUp1Days}
                onChange={(e) => onChange({ ...settings, followUp1Days: parseInt(e.target.value) })}
                className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#006073]">Second Follow-up (days)</label>
              <input
                type="number"
                value={settings.followUp2Days}
                onChange={(e) => onChange({ ...settings, followUp2Days: parseInt(e.target.value) })}
                className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#006073]">Final Follow-up (days)</label>
              <input
                type="number"
                value={settings.followUp3Days}
                onChange={(e) => onChange({ ...settings, followUp3Days: parseInt(e.target.value) })}
                className="mt-1 w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-[#02121a] placeholder:text-[#006073]"
              />
            </div>
          </div>
        </div>

        <button
          onClick={onSave}
          className="px-4 py-2 bg-[#0a9396] text-white rounded-lg hover:bg-[#006073] flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          Save Email Settings
        </button>
      </div>
    </div>
  );
}

// ================== Integrations Tab ==================

interface IntegrationStatus {
  connected: boolean;
  configured: boolean;
  masked?: string | null;
  hasOAuthToken?: boolean;
}

interface IntegrationsData {
  gmail: IntegrationStatus;
  anthropic: IntegrationStatus;
  openai: IntegrationStatus;
  spotify: IntegrationStatus;
  podcastindex: IntegrationStatus;
  listennotes: IntegrationStatus;
  apple: IntegrationStatus;
}

function IntegrationsTab() {
  const queryClient = useQueryClient();
  const [testingIntegration, setTestingIntegration] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);

  // Fetch integration status
  const { data: integrations, isLoading } = useQuery<IntegrationsData>({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await fetch("/api/integrations");
      if (!res.ok) throw new Error("Failed to fetch integrations");
      const data = await res.json();
      return data.integrations;
    },
  });

  // Check Gmail status
  useQuery({
    queryKey: ["gmail-status"],
    queryFn: async () => {
      const res = await fetch("/api/auth/gmail?action=status");
      const data = await res.json();
      if (data.connected) {
        setGmailEmail(data.email);
      }
      return data;
    },
  });

  // Test integration connection
  const testConnection = async (integration: string) => {
    setTestingIntegration(integration);
    try {
      // Gmail uses a special endpoint that sends an actual test email
      if (integration === "gmail") {
        const res = await fetch("/api/integrations/test-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const result = await res.json();
        setTestResults((prev) => ({ ...prev, [integration]: result }));
      } else {
        const res = await fetch("/api/integrations/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ integration, apiKey: apiKeys[integration] }),
        });
        const result = await res.json();
        setTestResults((prev) => ({ ...prev, [integration]: result }));
      }
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [integration]: { success: false, message: "Test failed" },
      }));
    }
    setTestingIntegration(null);
  };

  // Connect Gmail via OAuth
  const connectGmail = async () => {
    try {
      const res = await fetch("/api/auth/gmail?action=connect");
      const data = await res.json();

      // Check for redirect URI mismatch before opening popup
      if (data.debug?.potentialMismatch) {
        const confirmConnect = window.confirm(
          `WARNING: Redirect URI mismatch detected!\n\n` +
          `Your app is running at: ${window.location.origin}\n` +
          `But redirect URI is set to: ${data.debug.redirectUri}\n\n` +
          `This will cause "Error 400: invalid_request" from Google.\n\n` +
          `To fix:\n` +
          `1. Go to Railway dashboard → Variables\n` +
          `2. Set GOOGLE_REDIRECT_URI to: ${window.location.origin}/api/auth/gmail/callback\n` +
          `3. Set NEXT_PUBLIC_APP_URL to: ${window.location.origin}\n` +
          `4. Redeploy the app\n` +
          `5. Also update the redirect URI in Google Cloud Console\n\n` +
          `Click OK to try anyway, or Cancel to fix first.`
        );
        if (!confirmConnect) return;
      }

      if (data.authUrl) {
        // Open OAuth popup
        const popup = window.open(data.authUrl, "gmail_auth", "width=500,height=600");

        // Listen for callback
        const handleMessage = async (event: MessageEvent) => {
          if (event.data?.type === "gmail_oauth_callback" && event.data.code) {
            // Exchange code for tokens
            const tokenRes = await fetch("/api/auth/gmail", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: event.data.code }),
            });
            const tokenData = await tokenRes.json();

            if (tokenData.success) {
              setGmailEmail(tokenData.email);
              setTestResults((prev) => ({
                ...prev,
                gmail: { success: true, message: `Connected as ${tokenData.email}` },
              }));
              queryClient.invalidateQueries({ queryKey: ["integrations"] });
            } else {
              setTestResults((prev) => ({
                ...prev,
                gmail: { success: false, message: tokenData.error || "Failed to connect" },
              }));
            }
          }
          window.removeEventListener("message", handleMessage);
        };

        window.addEventListener("message", handleMessage);
      } else if (data.error) {
        setTestResults((prev) => ({
          ...prev,
          gmail: { success: false, message: data.error },
        }));
      }
    } catch (error) {
      console.error("Gmail connect error:", error);
      setTestResults((prev) => ({
        ...prev,
        gmail: { success: false, message: "Failed to initiate connection" },
      }));
    }
  };

  // Disconnect Gmail
  const disconnectGmail = async () => {
    await fetch("/api/auth/gmail?action=disconnect");
    setGmailEmail(null);
    setTestResults((prev) => ({ ...prev, gmail: { success: false, message: "Disconnected" } }));
    queryClient.invalidateQueries({ queryKey: ["integrations"] });
  };

  // Save API key
  const saveApiKey = async (integration: string) => {
    const key = apiKeys[integration];
    if (!key) return;

    setTestingIntegration(integration);

    try {
      // First test the key
      const testRes = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integration, apiKey: key }),
      });
      const testResult = await testRes.json();

      if (testResult.success) {
        // Save the key to the backend
        const saveRes = await fetch("/api/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integration,
            action: "save_key",
            config: { apiKey: key }
          }),
        });

        if (saveRes.ok) {
          setTestResults((prev) => ({
            ...prev,
            [integration]: { success: true, message: "API key saved and verified!" },
          }));
          // Clear the input after successful save
          setApiKeys((prev) => ({ ...prev, [integration]: "" }));
          // Refresh integration status
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
        } else {
          setTestResults((prev) => ({
            ...prev,
            [integration]: { success: false, message: "Failed to save API key" },
          }));
        }
      } else {
        setTestResults((prev) => ({
          ...prev,
          [integration]: { success: false, message: testResult.message || "Invalid API key" },
        }));
      }
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [integration]: { success: false, message: "Error saving API key" },
      }));
    }

    setTestingIntegration(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[#0a9396]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Services */}
      <div className="bg-white border border-[#94d2bd] rounded-lg">
        <div className="px-6 py-4 border-b border-[#94d2bd]">
          <h2 className="font-semibold text-[#02121a]">AI Services</h2>
          <p className="text-sm text-[#006073]">
            Configure AI providers for podcast analysis and email generation
          </p>
        </div>
        <div className="p-6 space-y-4">
          {/* Anthropic Claude */}
          <IntegrationCard
            name="Anthropic (Claude)"
            description="AI-powered podcast analysis and email drafting"
            icon={
              <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                AI
              </div>
            }
            status={integrations?.anthropic}
            testResult={testResults.anthropic}
            testing={testingIntegration === "anthropic"}
            onTest={() => testConnection("anthropic")}
            apiKeyInput={
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder={integrations?.anthropic?.masked || "sk-ant-..."}
                  value={apiKeys.anthropic || ""}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, anthropic: e.target.value }))}
                  className="w-48 border border-[#94d2bd] rounded-lg px-3 py-2 text-sm text-[#02121a] placeholder:text-[#006073]"
                />
                <button
                  onClick={() => saveApiKey("anthropic")}
                  disabled={!apiKeys.anthropic}
                  className="px-3 py-2 border border-[#94d2bd] text-[#006073] rounded-lg hover:bg-[#f5edd8] disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            }
          />

          {/* OpenAI (Optional) */}
          <IntegrationCard
            name="OpenAI (Optional)"
            description="Alternative AI provider for analysis"
            icon={
              <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white font-bold text-xs">
                GPT
              </div>
            }
            status={integrations?.openai}
            testResult={testResults.openai}
            testing={testingIntegration === "openai"}
            onTest={() => testConnection("openai")}
            apiKeyInput={
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder={integrations?.openai?.masked || "sk-..."}
                  value={apiKeys.openai || ""}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, openai: e.target.value }))}
                  className="w-48 border border-[#94d2bd] rounded-lg px-3 py-2 text-sm text-[#02121a] placeholder:text-[#006073]"
                />
                <button
                  onClick={() => saveApiKey("openai")}
                  disabled={!apiKeys.openai}
                  className="px-3 py-2 border border-[#94d2bd] text-[#006073] rounded-lg hover:bg-[#f5edd8] disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            }
          />
        </div>
      </div>

      {/* Email Services */}
      <div className="bg-white border border-[#94d2bd] rounded-lg">
        <div className="px-6 py-4 border-b border-[#94d2bd]">
          <h2 className="font-semibold text-[#02121a]">Email Services</h2>
          <p className="text-sm text-[#006073]">
            Connect your email account to send outreach emails
          </p>
        </div>
        <div className="p-6 space-y-4">
          {/* Gmail */}
          <div className="flex items-center justify-between p-4 border border-[#94d2bd] rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#fce8e9] rounded-lg flex items-center justify-center">
                <Mail className="h-5 w-5 text-[#9d2227]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-[#02121a]">Gmail</h4>
                  {gmailEmail && (
                    <span className="flex items-center gap-1 text-xs text-[#0a9396] bg-[#d4f0e7] px-2 py-0.5 rounded-full">
                      <CheckCircle className="h-3 w-3" />
                      Connected
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#006073]">
                  {gmailEmail || "Send emails and track replies via Gmail"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {gmailEmail ? (
                <>
                  <button
                    onClick={() => testConnection("gmail")}
                    disabled={testingIntegration === "gmail"}
                    className="px-3 py-2 border border-[#94d2bd] text-[#006073] rounded-lg hover:bg-[#f5edd8] disabled:opacity-50"
                  >
                    {testingIntegration === "gmail" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Send Test"
                    )}
                  </button>
                  <button
                    onClick={disconnectGmail}
                    className="px-3 py-2 border border-[#9d2227] text-[#9d2227] rounded-lg hover:bg-[#fce8e9]"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={connectGmail}
                  disabled={!integrations?.gmail?.configured}
                  className="px-4 py-2 bg-[#0a9396] text-white rounded-lg hover:bg-[#006073] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Link2 className="h-4 w-4" />
                  {integrations?.gmail?.configured ? "Connect" : "Not Configured"}
                </button>
              )}
            </div>
          </div>
          {!integrations?.gmail?.configured && (
            <div className="text-sm bg-[#f5edd8] border border-[#ead7a5] p-4 rounded-lg space-y-2">
              <p className="text-[#b02013] flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4" />
                Gmail OAuth Setup Required
              </p>
              <ol className="list-decimal list-inside text-[#bb3f03] space-y-1 ml-6">
                <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" className="underline hover:text-[#9d2227]">Google Cloud Console</a></li>
                <li>Create OAuth 2.0 credentials (Web application)</li>
                <li>Add your email to &quot;Test users&quot; in OAuth consent screen</li>
                <li>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment</li>
              </ol>
            </div>
          )}
          {integrations?.gmail?.configured && !gmailEmail && (
            <GmailSetupGuide />
          )}
          {testResults.gmail && (
            <TestResultBadge result={testResults.gmail} />
          )}
        </div>
      </div>

      {/* Podcast Discovery Platforms */}
      <div className="bg-white border border-[#94d2bd] rounded-lg">
        <div className="px-6 py-4 border-b border-[#94d2bd]">
          <h2 className="font-semibold text-[#02121a]">Podcast Discovery Platforms</h2>
          <p className="text-sm text-[#006073]">
            Connect podcast directories to discover and research shows
          </p>
        </div>
        <div className="p-6 space-y-4">
          {/* Apple Podcasts */}
          <IntegrationCard
            name="Apple Podcasts"
            description="Search the iTunes podcast directory (no API key required)"
            icon={
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 3a7 7 0 11-7 7 7 7 0 017-7zm0 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z"/>
                </svg>
              </div>
            }
            status={integrations?.apple}
            testResult={testResults.apple}
            testing={testingIntegration === "apple"}
            onTest={() => testConnection("apple")}
            alwaysConnected
          />

          {/* Spotify */}
          <IntegrationCard
            name="Spotify"
            description="Access Spotify's podcast catalog with trending data"
            icon={
              <div className="w-10 h-10 bg-[#0a9396] rounded-lg flex items-center justify-center">
                <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
              </div>
            }
            status={integrations?.spotify}
            testResult={testResults.spotify}
            testing={testingIntegration === "spotify"}
            onTest={() => testConnection("spotify")}
            requiresEnvVar="SPOTIFY_CLIENT_ID & SPOTIFY_CLIENT_SECRET"
          />

          {/* PodcastIndex */}
          <IntegrationCard
            name="PodcastIndex"
            description="Open podcast database with contact emails and trending data"
            icon={
              <div className="w-10 h-10 bg-[#0a9396] rounded-lg flex items-center justify-center text-white font-bold text-xs">
                PI
              </div>
            }
            status={integrations?.podcastindex}
            testResult={testResults.podcastindex}
            testing={testingIntegration === "podcastindex"}
            onTest={() => testConnection("podcastindex")}
            requiresEnvVar="PODCAST_INDEX_API_KEY & PODCAST_INDEX_API_SECRET"
          />

          {/* ListenNotes */}
          <IntegrationCard
            name="ListenNotes"
            description="Comprehensive podcast search and metadata API"
            icon={
              <div className="w-10 h-10 bg-[#f5edd8]0 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                LN
              </div>
            }
            status={integrations?.listennotes}
            testResult={testResults.listennotes}
            testing={testingIntegration === "listennotes"}
            onTest={() => testConnection("listennotes")}
            requiresEnvVar="LISTEN_NOTES_API_KEY"
          />
        </div>
      </div>

      {/* Environment Variables Reference */}
      <EnvironmentVariablesSection />
    </div>
  );
}

function IntegrationCard({
  name,
  description,
  icon,
  status,
  testResult,
  testing,
  onTest,
  apiKeyInput,
  alwaysConnected,
  requiresEnvVar,
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
  status?: IntegrationStatus;
  testResult?: { success: boolean; message: string };
  testing: boolean;
  onTest: () => void;
  apiKeyInput?: React.ReactNode;
  alwaysConnected?: boolean;
  requiresEnvVar?: string;
}) {
  const isConnected = alwaysConnected || status?.connected;

  return (
    <div className="p-4 border border-[#94d2bd] rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-[#02121a]">{name}</h4>
              {isConnected && (
                <span className="flex items-center gap-1 text-xs text-[#0a9396] bg-[#d4f0e7] px-2 py-0.5 rounded-full">
                  <CheckCircle className="h-3 w-3" />
                  {alwaysConnected ? "Available" : "Connected"}
                </span>
              )}
              {!isConnected && status?.configured && (
                <span className="flex items-center gap-1 text-xs text-[#cb6701] bg-[#f5edd8] px-2 py-0.5 rounded-full">
                  <AlertCircle className="h-3 w-3" />
                  Configured
                </span>
              )}
            </div>
            <p className="text-sm text-[#006073]">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {apiKeyInput || (
            <button
              onClick={onTest}
              disabled={testing || (!isConnected && !status?.configured)}
              className="px-3 py-2 border border-[#94d2bd] text-[#006073] rounded-lg hover:bg-[#f5edd8] disabled:opacity-50 flex items-center gap-2"
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing
                </>
              ) : (
                "Test Connection"
              )}
            </button>
          )}
        </div>
      </div>
      {requiresEnvVar && !status?.configured && (
        <p className="mt-3 text-sm text-[#cb6701] bg-[#f5edd8] p-2 rounded flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Requires {requiresEnvVar} environment variable(s)
        </p>
      )}
      {testResult && <TestResultBadge result={testResult} />}
    </div>
  );
}

function TestResultBadge({ result }: { result: { success: boolean; message: string } }) {
  return (
    <div
      className={cn(
        "mt-3 p-2 rounded text-sm flex items-center gap-2",
        result.success ? "bg-[#d4f0e7] text-[#0a9396]" : "bg-[#fce8e9] text-[#9d2227]"
      )}
    >
      {result.success ? (
        <CheckCircle className="h-4 w-4" />
      ) : (
        <X className="h-4 w-4" />
      )}
      {result.message}
    </div>
  );
}

// Gmail Setup Guide - handles window reference safely
function GmailSetupGuide() {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const redirectUri = origin ? `${origin}/api/auth/gmail/callback` : "YOUR_APP_URL/api/auth/gmail/callback";

  return (
    <div className="text-sm bg-[#d4f0e7] border border-[#94d2bd] p-4 rounded-lg space-y-2">
      <p className="text-[#006073] flex items-center gap-2 font-medium">
        <AlertCircle className="h-4 w-4" />
        Before connecting, ensure these are configured in Google Cloud Console:
      </p>
      <ul className="list-disc list-inside text-[#006073] space-y-1 ml-6">
        <li>
          <strong>Authorized redirect URI:</strong>{" "}
          <code className="bg-[#94d2bd] px-1 rounded">{redirectUri}</code>
        </li>
        <li>
          <strong>OAuth consent screen:</strong> Add your email to &quot;Test users&quot;
        </li>
        <li>
          <strong>Required scopes:</strong> gmail.send, gmail.readonly, gmail.modify
        </li>
      </ul>
      <p className="text-[#0a9396] text-xs mt-2">
        Error 400 &quot;invalid_request&quot; usually means the redirect URI does not match or your email is not a test user.
      </p>
    </div>
  );
}

// Environment Variables Section - handles window reference safely
function EnvironmentVariablesSection() {
  const [origin, setOrigin] = useState("https://your-railway-app.railway.app");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const redirectUri = `${origin}/api/auth/gmail/callback`;

  return (
    <div className="bg-white border border-[#94d2bd] rounded-lg">
      <div className="px-6 py-4 border-b border-[#94d2bd]">
        <h2 className="font-semibold text-[#02121a]">Environment Variables</h2>
        <p className="text-sm text-[#006073]">Required for deployment - add to your .env file</p>
      </div>
      <div className="p-4">
        <pre className="bg-[#02121a] text-[#ead7a5] rounded-lg p-4 text-sm overflow-x-auto">
{`# Database
DATABASE_URL="postgresql://..."

# AI Services
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."  # Optional

# Gmail OAuth
# IMPORTANT: GOOGLE_REDIRECT_URI must match EXACTLY what's configured in Google Cloud Console
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI="${redirectUri}"

# Spotify (for podcast discovery)
SPOTIFY_CLIENT_ID="..."
SPOTIFY_CLIENT_SECRET="..."

# PodcastIndex (for trending & contact info)
PODCAST_INDEX_API_KEY="..."
PODCAST_INDEX_API_SECRET="..."

# ListenNotes (optional)
LISTEN_NOTES_API_KEY="..."

# App Config
NEXT_PUBLIC_APP_URL="${origin}"`}
        </pre>
      </div>

      {/* Gmail OAuth Setup Guide */}
      <div className="px-6 pb-6">
        <div className="bg-[#f5edd8] border border-[#ead7a5] rounded-lg p-4">
          <h3 className="font-medium text-[#9d2227] mb-2">Gmail OAuth Troubleshooting</h3>
          <p className="text-sm text-[#b02013] mb-2">
            If you see <strong>&quot;Error 400: invalid_request&quot;</strong> or <strong>&quot;Access blocked&quot;</strong>:
          </p>
          <ol className="list-decimal list-inside text-sm text-[#bb3f03] space-y-1.5">
            <li>
              <strong>Check redirect URI:</strong> In Google Cloud Console → Credentials → OAuth 2.0 Client IDs,
              add this exact URI: <code className="bg-[#ead7a5] px-1 rounded">{redirectUri}</code>
            </li>
            <li>
              <strong>Add test user:</strong> OAuth consent screen → Test users → Add your email address
            </li>
            <li>
              <strong>Enable APIs:</strong> Make sure Gmail API is enabled in your Google Cloud project
            </li>
            <li>
              <strong>Update env vars:</strong> Set GOOGLE_REDIRECT_URI to your deployed URL (not localhost)
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
