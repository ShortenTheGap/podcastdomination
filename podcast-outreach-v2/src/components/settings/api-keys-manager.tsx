"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Key,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
  Database,
  Server,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Setting {
  key: string;
  value: string;
  maskedValue: string;
  isSecret: boolean;
  description: string | null;
  category: string;
  updatedAt: string;
  source: "database" | "environment";
}

interface SettingsResponse {
  settings: Setting[];
  categories: Record<string, Setting[]>;
}

// Predefined API key configurations
const API_KEY_CONFIG = {
  ai: [
    { key: "ANTHROPIC_API_KEY", label: "Anthropic (Claude)", description: "AI-powered podcast analysis and email drafting", placeholder: "sk-ant-..." },
    { key: "OPENAI_API_KEY", label: "OpenAI (GPT)", description: "Alternative AI provider (optional)", placeholder: "sk-..." },
  ],
  email: [
    { key: "ZEROBOUNCE_API_KEY", label: "ZeroBounce", description: "Email verification service", placeholder: "..." },
    { key: "RESEND_API_KEY", label: "Resend", description: "Email sending service (alternative to Gmail)", placeholder: "re_..." },
    { key: "MILLIONVERIFIER_API_KEY", label: "MillionVerifier", description: "Email verification (backup)", placeholder: "..." },
  ],
  discovery: [
    { key: "HUNTER_API_KEY", label: "Hunter.io", description: "Email finder service", placeholder: "..." },
    { key: "PODCAST_INDEX_API_KEY", label: "PodcastIndex Key", description: "Podcast discovery API", placeholder: "..." },
    { key: "PODCAST_INDEX_API_SECRET", label: "PodcastIndex Secret", description: "Podcast discovery API secret", placeholder: "..." },
    { key: "LISTEN_NOTES_API_KEY", label: "ListenNotes", description: "Podcast search API", placeholder: "..." },
  ],
};

export function ApiKeysManager() {
  const queryClient = useQueryClient();
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Fetch all settings
  const { data, isLoading, error } = useQuery<SettingsResponse>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  // Save setting mutation
  const saveMutation = useMutation({
    mutationFn: async ({ key, value, category }: { key: string; value: string; category: string }) => {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          value,
          isSecret: true,
          category,
        }),
      });
      if (!res.ok) throw new Error("Failed to save setting");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setEditingKey(null);
      setNewValue("");
      setTestResults(prev => ({
        ...prev,
        [variables.key]: { success: true, message: "Saved to database!" },
      }));
    },
    onError: (error, variables) => {
      setTestResults(prev => ({
        ...prev,
        [variables.key]: { success: false, message: error.message },
      }));
    },
  });

  // Delete setting mutation
  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete setting");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  // Get setting by key
  const getSetting = (key: string): Setting | undefined => {
    return data?.settings.find(s => s.key === key);
  };

  // Toggle value visibility
  const toggleShowValue = (key: string) => {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Start editing
  const startEditing = (key: string) => {
    setEditingKey(key);
    setNewValue("");
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingKey(null);
    setNewValue("");
  };

  // Save new value
  const saveValue = (key: string, category: string) => {
    if (!newValue.trim()) return;
    saveMutation.mutate({ key, value: newValue.trim(), category });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[#0a9396]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#fce8e9] border border-[#9d2227] rounded-lg p-4">
        <p className="text-[#9d2227] flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Failed to load settings. Make sure the database is connected.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-[#d4f0e7] border border-[#94d2bd] rounded-lg p-4">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 text-[#0a9396] flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-[#02121a]">Secure API Key Storage</h3>
            <p className="text-sm text-[#006073] mt-1">
              API keys are encrypted and stored in the database. You can update them here without redeploying.
              Keys from environment variables will still work as fallbacks.
            </p>
          </div>
        </div>
      </div>

      {/* AI Services */}
      <ApiKeySection
        title="AI Services"
        description="Configure AI providers for podcast analysis and email generation"
        icon={<div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold text-xs">AI</div>}
        keys={API_KEY_CONFIG.ai}
        getSetting={getSetting}
        showValues={showValues}
        toggleShowValue={toggleShowValue}
        editingKey={editingKey}
        newValue={newValue}
        setNewValue={setNewValue}
        startEditing={startEditing}
        cancelEditing={cancelEditing}
        saveValue={saveValue}
        deleteMutation={deleteMutation}
        saveMutation={saveMutation}
        testResults={testResults}
        category="ai"
      />

      {/* Email Services */}
      <ApiKeySection
        title="Email Services"
        description="Configure email verification and sending services"
        icon={<div className="w-8 h-8 bg-[#0a9396] rounded-lg flex items-center justify-center text-white"><Key className="h-4 w-4" /></div>}
        keys={API_KEY_CONFIG.email}
        getSetting={getSetting}
        showValues={showValues}
        toggleShowValue={toggleShowValue}
        editingKey={editingKey}
        newValue={newValue}
        setNewValue={setNewValue}
        startEditing={startEditing}
        cancelEditing={cancelEditing}
        saveValue={saveValue}
        deleteMutation={deleteMutation}
        saveMutation={saveMutation}
        testResults={testResults}
        category="email"
      />

      {/* Discovery Services */}
      <ApiKeySection
        title="Discovery Services"
        description="Configure podcast discovery and email finder APIs"
        icon={<div className="w-8 h-8 bg-[#006073] rounded-lg flex items-center justify-center text-white"><Server className="h-4 w-4" /></div>}
        keys={API_KEY_CONFIG.discovery}
        getSetting={getSetting}
        showValues={showValues}
        toggleShowValue={toggleShowValue}
        editingKey={editingKey}
        newValue={newValue}
        setNewValue={setNewValue}
        startEditing={startEditing}
        cancelEditing={cancelEditing}
        saveValue={saveValue}
        deleteMutation={deleteMutation}
        saveMutation={saveMutation}
        testResults={testResults}
        category="discovery"
      />

      {/* Source Legend */}
      <div className="flex items-center gap-6 text-sm text-[#006073] px-2">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-[#0a9396]" />
          <span>Stored in database (encrypted)</span>
        </div>
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-[#cb6701]" />
          <span>From environment variable</span>
        </div>
      </div>
    </div>
  );
}

interface ApiKeySectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  keys: Array<{ key: string; label: string; description: string; placeholder: string }>;
  getSetting: (key: string) => Setting | undefined;
  showValues: Record<string, boolean>;
  toggleShowValue: (key: string) => void;
  editingKey: string | null;
  newValue: string;
  setNewValue: (value: string) => void;
  startEditing: (key: string) => void;
  cancelEditing: () => void;
  saveValue: (key: string, category: string) => void;
  deleteMutation: any;
  saveMutation: any;
  testResults: Record<string, { success: boolean; message: string }>;
  category: string;
}

function ApiKeySection({
  title,
  description,
  icon,
  keys,
  getSetting,
  showValues,
  toggleShowValue,
  editingKey,
  newValue,
  setNewValue,
  startEditing,
  cancelEditing,
  saveValue,
  deleteMutation,
  saveMutation,
  testResults,
  category,
}: ApiKeySectionProps) {
  return (
    <div className="bg-white border border-[#94d2bd] rounded-lg">
      <div className="px-6 py-4 border-b border-[#94d2bd] flex items-center gap-3">
        {icon}
        <div>
          <h2 className="font-semibold text-[#02121a]">{title}</h2>
          <p className="text-sm text-[#006073]">{description}</p>
        </div>
      </div>
      <div className="p-4 space-y-4">
        {keys.map(({ key, label, description: keyDesc, placeholder }) => {
          const setting = getSetting(key);
          const isEditing = editingKey === key;
          const hasValue = !!setting;
          const isFromDb = setting?.source === "database";
          const testResult = testResults[key];

          return (
            <div key={key} className="border border-[#94d2bd] rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-[#02121a]">{label}</h4>
                    {hasValue && (
                      <span className={cn(
                        "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
                        isFromDb 
                          ? "bg-[#d4f0e7] text-[#0a9396]"
                          : "bg-[#f5edd8] text-[#cb6701]"
                      )}>
                        {isFromDb ? <Database className="h-3 w-3" /> : <Server className="h-3 w-3" />}
                        {isFromDb ? "Database" : "Env"}
                      </span>
                    )}
                    {hasValue && (
                      <span className="flex items-center gap-1 text-xs text-[#0a9396] bg-[#d4f0e7] px-2 py-0.5 rounded-full">
                        <CheckCircle className="h-3 w-3" />
                        Configured
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#006073] mt-1">{keyDesc}</p>
                  
                  {/* Current value display */}
                  {hasValue && !isEditing && (
                    <div className="mt-3 flex items-center gap-2">
                      <code className="bg-[#f5edd8] px-3 py-1.5 rounded text-sm font-mono text-[#02121a]">
                        {showValues[key] ? setting.value || setting.maskedValue : setting.maskedValue}
                      </code>
                      <button
                        onClick={() => toggleShowValue(key)}
                        className="p-1.5 text-[#006073] hover:text-[#02121a] rounded"
                        title={showValues[key] ? "Hide" : "Show"}
                      >
                        {showValues[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  )}

                  {/* Edit form */}
                  {isEditing && (
                    <div className="mt-3 space-y-3">
                      <input
                        type="password"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder={placeholder}
                        className="w-full border border-[#94d2bd] rounded-lg px-3 py-2 text-sm text-[#02121a] placeholder:text-[#006073] font-mono"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveValue(key, category)}
                          disabled={!newValue.trim() || saveMutation.isPending}
                          className="px-3 py-1.5 bg-[#0a9396] text-white rounded-lg hover:bg-[#006073] disabled:opacity-50 flex items-center gap-2 text-sm"
                        >
                          {saveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Save to Database
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="px-3 py-1.5 border border-[#94d2bd] text-[#006073] rounded-lg hover:bg-[#f5edd8] text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Test result */}
                  {testResult && !isEditing && (
                    <div className={cn(
                      "mt-3 p-2 rounded text-sm flex items-center gap-2",
                      testResult.success ? "bg-[#d4f0e7] text-[#0a9396]" : "bg-[#fce8e9] text-[#9d2227]"
                    )}>
                      {testResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      {testResult.message}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => startEditing(key)}
                        className="px-3 py-1.5 border border-[#94d2bd] text-[#006073] rounded-lg hover:bg-[#f5edd8] text-sm flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        {hasValue ? "Update" : "Add"}
                      </button>
                      {isFromDb && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete ${label} from database? The environment variable will still be used as fallback.`)) {
                              deleteMutation.mutate(key);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-[#006073] hover:text-[#9d2227] rounded"
                          title="Delete from database"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

