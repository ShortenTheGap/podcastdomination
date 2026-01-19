"use client";

import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [activeTab, setActiveTab] = useState<"profile" | "criteria" | "email" | "integrations">("profile");

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

  const handleSaveProfile = () => {
    alert("Profile saved!");
  };

  const handleSaveEmail = () => {
    alert("Email settings saved!");
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Configure your profile, targeting criteria, and integrations
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6">
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
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-slate-500 hover:text-slate-700"
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
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Target className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">Define Your Perfect Podcast</h3>
            <p className="text-sm text-blue-700 mt-1">
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
          <div key={category.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <h3 className="font-medium text-slate-900">{category.label}</h3>
            </div>
            <div className="divide-y divide-slate-100">
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
          className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Custom Criterion
        </button>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <h3 className="font-medium text-slate-900">New Custom Criterion</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Name *</label>
              <input
                type="text"
                value={newCriterion.name}
                onChange={(e) => setNewCriterion({ ...newCriterion, name: e.target.value })}
                placeholder="e.g., Has social media presence"
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Category</label>
              <select
                value={newCriterion.category}
                onChange={(e) => setNewCriterion({ ...newCriterion, category: e.target.value })}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Description</label>
            <input
              type="text"
              value={newCriterion.description}
              onChange={(e) => setNewCriterion({ ...newCriterion, description: e.target.value })}
              placeholder="Brief explanation of what this criterion checks"
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">AI Evaluation Hint</label>
            <textarea
              value={newCriterion.promptHint}
              onChange={(e) => setNewCriterion({ ...newCriterion, promptHint: e.target.value })}
              placeholder="Instructions for how the AI should evaluate this criterion..."
              rows={2}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newCriterion.isRequired}
                onChange={(e) => setNewCriterion({ ...newCriterion, isRequired: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Required (instant skip if not met)</span>
            </label>

            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-700">Importance:</label>
              <select
                value={newCriterion.weight}
                onChange={(e) => setNewCriterion({ ...newCriterion, weight: parseInt(e.target.value) })}
                className="border border-slate-300 rounded px-2 py-1 text-sm"
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
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Criterion
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
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
            ? "bg-green-500 border-green-500 text-white"
            : "border-slate-300 text-transparent hover:border-slate-400"
        )}
      >
        <Check className="h-3 w-3" />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            "font-medium",
            criterion.isEnabled ? "text-slate-900" : "text-slate-400"
          )}>
            {criterion.name}
          </span>
          {criterion.isRequired && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">
              Required
            </span>
          )}
          {criterion.isCustom && (
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
              Custom
            </span>
          )}
        </div>
        {criterion.description && (
          <p className={cn(
            "text-sm mt-0.5",
            criterion.isEnabled ? "text-slate-500" : "text-slate-400"
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
                ? criterion.isEnabled ? "bg-blue-500" : "bg-slate-300"
                : "bg-slate-200"
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
            className="p-1 text-slate-400 hover:text-red-600 rounded"
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
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="font-semibold text-slate-900">Your Guest Profile</h2>
        <p className="text-sm text-slate-500">
          This information is used to generate personalized pitch emails
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Full Name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => onChange({ ...profile, name: e.target.value })}
              placeholder="John Smith"
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Title</label>
            <input
              type="text"
              value={profile.title}
              onChange={(e) => onChange({ ...profile, title: e.target.value })}
              placeholder="CEO & Founder"
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Company</label>
          <input
            type="text"
            value={profile.company}
            onChange={(e) => onChange({ ...profile, company: e.target.value })}
            placeholder="Acme Inc."
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Bio</label>
          <textarea
            value={profile.bio}
            onChange={(e) => onChange({ ...profile, bio: e.target.value })}
            placeholder="A brief bio about yourself..."
            rows={3}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Topics You Speak About</label>
          <input
            type="text"
            value={profile.topics}
            onChange={(e) => onChange({ ...profile, topics: e.target.value })}
            placeholder="Leadership, AI, Startups (comma separated)"
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Credentials & Social Proof</label>
          <textarea
            value={profile.credentials}
            onChange={(e) => onChange({ ...profile, credentials: e.target.value })}
            placeholder="Notable achievements, previous podcast appearances, publications..."
            rows={2}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Your Unique Angle</label>
          <textarea
            value={profile.uniqueAngle}
            onChange={(e) => onChange({ ...profile, uniqueAngle: e.target.value })}
            placeholder="What makes you different from other guests?"
            rows={2}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-slate-700">Website</label>
            <input
              type="url"
              value={profile.websiteUrl}
              onChange={(e) => onChange({ ...profile, websiteUrl: e.target.value })}
              placeholder="https://..."
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">LinkedIn</label>
            <input
              type="url"
              value={profile.linkedinUrl}
              onChange={(e) => onChange({ ...profile, linkedinUrl: e.target.value })}
              placeholder="https://linkedin.com/in/..."
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Twitter/X</label>
            <input
              type="url"
              value={profile.twitterUrl}
              onChange={(e) => onChange({ ...profile, twitterUrl: e.target.value })}
              placeholder="https://twitter.com/..."
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <button
          onClick={onSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
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
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="font-semibold text-slate-900">Email Configuration</h2>
        <p className="text-sm text-slate-500">
          Configure how your outreach emails are sent
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">Sender Name</label>
          <input
            type="text"
            value={settings.senderName}
            onChange={(e) => onChange({ ...settings, senderName: e.target.value })}
            placeholder="John from Acme"
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Email Signature</label>
          <textarea
            value={settings.signature}
            onChange={(e) => onChange({ ...settings, signature: e.target.value })}
            placeholder="Best regards,&#10;John Smith&#10;CEO, Acme Inc."
            rows={4}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </div>

        <div className="pt-4 border-t border-slate-200">
          <h4 className="font-medium text-slate-900 mb-4">Follow-up Schedule</h4>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-slate-700">First Follow-up (days)</label>
              <input
                type="number"
                value={settings.followUp1Days}
                onChange={(e) => onChange({ ...settings, followUp1Days: parseInt(e.target.value) })}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Second Follow-up (days)</label>
              <input
                type="number"
                value={settings.followUp2Days}
                onChange={(e) => onChange({ ...settings, followUp2Days: parseInt(e.target.value) })}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Final Follow-up (days)</label>
              <input
                type="number"
                value={settings.followUp3Days}
                onChange={(e) => onChange({ ...settings, followUp3Days: parseInt(e.target.value) })}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>
        </div>

        <button
          onClick={onSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          Save Email Settings
        </button>
      </div>
    </div>
  );
}

// ================== Integrations Tab ==================

function IntegrationsTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Connected Services</h2>
          <p className="text-sm text-slate-500">
            Connect your accounts to enable full functionality
          </p>
        </div>
        <div className="p-6 space-y-4">
          {/* Gmail */}
          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Mail className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h4 className="font-medium text-slate-900">Gmail</h4>
                <p className="text-sm text-slate-500">Send emails and track replies</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Connect
            </button>
          </div>

          {/* Anthropic */}
          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                AI
              </div>
              <div>
                <h4 className="font-medium text-slate-900">Anthropic (Claude)</h4>
                <p className="text-sm text-slate-500">AI-powered analysis and emails</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                placeholder="sk-ant-..."
                className="w-48 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <button className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
                Save
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Environment Variables Reference */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Environment Variables</h2>
          <p className="text-sm text-slate-500">Required for deployment</p>
        </div>
        <div className="p-4">
          <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-sm overflow-x-auto">
{`# Database
DATABASE_URL="postgresql://..."

# AI
ANTHROPIC_API_KEY="sk-ant-..."

# Gmail OAuth (optional)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."`}
          </pre>
        </div>
      </div>
    </div>
  );
}
