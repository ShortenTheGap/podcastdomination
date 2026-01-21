"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  ChevronRight,
  Loader2,
  Edit,
  Eye,
  MessageSquare,
  Archive,
  RefreshCw,
  User,
  AlertCircle,
  Sparkles,
  Wand2,
  Save,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

// LocalStorage key for backup persistence
const CAMPAIGNS_STORAGE_KEY = "outreach-campaigns-backup";

interface LocalStorageBackup {
  campaigns: OutreachPodcast[];
  savedAt: string;
  // Hash of campaign statuses to detect changes
  statusHash: string;
}

// Create a hash of campaign statuses to detect changes
function createStatusHash(campaigns: OutreachPodcast[]): string {
  return campaigns.map(c => `${c.id}:${c.status}`).sort().join('|');
}

// Save campaigns to localStorage as backup
function saveToLocalStorage(campaigns: OutreachPodcast[]): void {
  try {
    const backup: LocalStorageBackup = {
      campaigns,
      savedAt: new Date().toISOString(),
      statusHash: createStatusHash(campaigns),
    };
    localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(backup));
    console.log("[LocalStorage] Backed up", campaigns.length, "campaigns at", backup.savedAt);
  } catch (e) {
    console.warn("[LocalStorage] Failed to save backup:", e);
  }
}

// Load campaigns from localStorage backup with timestamp
function loadFromLocalStorage(): LocalStorageBackup | null {
  try {
    const stored = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as LocalStorageBackup;
      if (data.campaigns && Array.isArray(data.campaigns) && data.campaigns.length > 0) {
        console.log("[LocalStorage] Found backup with", data.campaigns.length, "campaigns (saved at", data.savedAt, ")");
        return data;
      }
    }
  } catch (e) {
    console.warn("[LocalStorage] Failed to load backup:", e);
  }
  return null;
}

// Types for the outreach system
interface OutreachPodcast {
  id: string;
  showName: string;
  hostName: string | null;
  primaryEmail: string | null;
  tier: string;
  status: OutreachStage;
  responseType: ResponseType | null;
  emailSequence: EmailInSequence[];
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
}

interface EmailInSequence {
  id: string;
  type: "initial" | "follow_up_1" | "follow_up_2" | "follow_up_3" | "nurture" | "closing";
  subject: string;
  body: string;
  status: "draft" | "scheduled" | "sent" | "opened" | "replied";
  sentAt: string | null;
  scheduledFor: string | null;
  openedAt: string | null;
  repliedAt: string | null;
}

type OutreachStage =
  | "not_started"
  | "drafting"
  | "ready_to_send"
  | "sent_awaiting"
  | "follow_up_due"
  | "responded"
  | "booked"
  | "closed";

type ResponseType = "no_response" | "not_interested" | "interested_not_booked" | "booked" | "opted_out";

// Pipeline stage configuration
const PIPELINE_STAGES: { id: OutreachStage; label: string; color: string; icon: React.ReactNode }[] = [
  { id: "not_started", label: "Not Started", color: "bg-[#ead7a5]", icon: <Clock className="h-4 w-4" /> },
  { id: "drafting", label: "Drafting", color: "bg-[#0a9396]/20", icon: <Edit className="h-4 w-4" /> },
  { id: "ready_to_send", label: "Ready to Send", color: "bg-[#ed9b05]/30", icon: <Mail className="h-4 w-4" /> },
  { id: "sent_awaiting", label: "Awaiting Response", color: "bg-[#006073]/20", icon: <Send className="h-4 w-4" /> },
  { id: "follow_up_due", label: "Follow-up Due", color: "bg-[#cb6701]/30", icon: <RefreshCw className="h-4 w-4" /> },
  { id: "responded", label: "Responded", color: "bg-[#94d2bd]/50", icon: <MessageSquare className="h-4 w-4" /> },
  { id: "booked", label: "Booked", color: "bg-[#94d2bd]", icon: <CheckCircle className="h-4 w-4" /> },
  { id: "closed", label: "Closed", color: "bg-[#006073]/30", icon: <Archive className="h-4 w-4" /> },
];

// Response branch configuration
const RESPONSE_BRANCHES = [
  { id: "no_response", label: "No Response", description: "Continue follow-up sequence", color: "text-[#cb6701]", bgColor: "bg-[#ed9b05]/20" },
  { id: "not_interested", label: "Not Interested", description: "Close outreach", color: "text-[#9d2227]", bgColor: "bg-[#9d2227]/10" },
  { id: "interested_not_booked", label: "Interested (Not Booked)", description: "Nurture sequence", color: "text-[#0a9396]", bgColor: "bg-[#0a9396]/10" },
  { id: "booked", label: "Booked!", description: "Success - scheduled", color: "text-[#006073]", bgColor: "bg-[#94d2bd]/30" },
  { id: "opted_out", label: "Opted Out", description: "Do not contact", color: "text-[#006073]", bgColor: "bg-[#ead7a5]" },
];

// Sync campaigns to server (persistent storage) with retry logic
async function syncCampaignsToServer(campaigns: OutreachPodcast[], retries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch("/api/outreach/campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaigns }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      console.log("[Sync] Campaigns synced to server successfully");
      return true;
    } catch (error) {
      console.error(`[Sync] Attempt ${attempt}/${retries} failed:`, error);
      if (attempt < retries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
      }
    }
  }
  console.error("[Sync] All retry attempts failed");
  return false;
}

export default function OutreachPage() {
  const [viewMode, setViewMode] = useState<"pipeline" | "list">("pipeline");
  const [selectedPodcast, setSelectedPodcast] = useState<OutreachPodcast | null>(null);
  const [filterStage, setFilterStage] = useState<OutreachStage | "all">("all");
  const [draggedPodcast, setDraggedPodcast] = useState<OutreachPodcast | null>(null);
  const [dragOverStage, setDragOverStage] = useState<OutreachStage | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Local state for campaigns - server is the source of truth
  const [localCampaigns, setLocalCampaigns] = useState<OutreachPodcast[]>([]);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Debounce timer for auto-sync
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Track pending campaigns to sync (ensures we always sync the latest)
  const pendingCampaignsRef = useRef<OutreachPodcast[] | null>(null);

  const queryClient = useQueryClient();

  // Fetch outreach data from server (source of truth)
  const { data: outreachData, isLoading, refetch } = useQuery({
    queryKey: ["outreach-campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/outreach/campaigns");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Initialize campaigns from server data OR localStorage backup
  // CRITICAL: Compare timestamps to use the most recent data
  useEffect(() => {
    if (!outreachData?.campaigns) return;

    const serverCampaigns = outreachData.campaigns;
    const localBackup = loadFromLocalStorage();

    // If server is empty but we have local backup, restore it
    if (serverCampaigns.length === 0 && localBackup) {
      console.log("[Recovery] Server empty, restoring from localStorage backup");
      setLocalCampaigns(localBackup.campaigns);
      // Sync backup to server to restore data
      syncCampaignsToServer(localBackup.campaigns).then(success => {
        if (success) {
          console.log("[Recovery] Successfully restored campaigns to server");
          setLastSyncTime(new Date());
        }
      });
      return;
    }

    // If we have both server data and local backup, compare them
    if (serverCampaigns.length > 0 && localBackup) {
      const serverHash = createStatusHash(serverCampaigns);
      const localHash = localBackup.statusHash;

      // If hashes differ, local has unsaved changes - use local
      if (serverHash !== localHash) {
        const localTime = new Date(localBackup.savedAt).getTime();
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

        // Only use local if it was saved within the last 5 minutes (recent changes)
        if (localTime > fiveMinutesAgo) {
          console.log("[Recovery] Local backup has newer changes, using local data");
          console.log("[Recovery] Server hash:", serverHash);
          console.log("[Recovery] Local hash:", localHash);
          setLocalCampaigns(localBackup.campaigns);
          // Immediately sync local to server
          syncCampaignsToServer(localBackup.campaigns).then(success => {
            if (success) {
              console.log("[Recovery] Successfully synced local changes to server");
              setLastSyncTime(new Date());
              setHasUnsyncedChanges(false);
            }
          });
          return;
        }
      }
    }

    // Default: use server data
    setLocalCampaigns(serverCampaigns);
    setLastSyncTime(new Date());
    // Update localStorage backup with server data
    if (serverCampaigns.length > 0) {
      saveToLocalStorage(serverCampaigns);
    }
  }, [outreachData]);

  // Auto-sync function with debouncing
  // Uses a ref to always sync the latest campaigns, avoiding stale closure issues
  const scheduleSync = useCallback((campaigns: OutreachPodcast[]) => {
    // Always update the pending campaigns to the latest
    pendingCampaignsRef.current = campaigns;

    // Immediately save to localStorage as backup (no debounce for local backup)
    saveToLocalStorage(campaigns);

    // Clear any existing timer
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    // Set flag for unsaved changes
    setHasUnsyncedChanges(true);
    setSyncError(null);

    // Schedule sync after 500ms of inactivity (reduced from 1000ms for faster feedback)
    syncTimerRef.current = setTimeout(async () => {
      // Use the latest pending campaigns
      const campaignsToSync = pendingCampaignsRef.current;
      if (!campaignsToSync) return;

      setIsSyncing(true);
      const success = await syncCampaignsToServer(campaignsToSync);
      setIsSyncing(false);

      if (success) {
        setHasUnsyncedChanges(false);
        setLastSyncTime(new Date());
        pendingCampaignsRef.current = null;
      } else {
        setSyncError("Failed to save changes. Click to retry.");
      }
    }, 500);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  // Force sync before page unload using sendBeacon for reliability
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Always try to sync current local campaigns on unload
      // This catches any changes that might not have been synced
      const campaignsToSync = pendingCampaignsRef.current || (hasUnsyncedChanges ? localCampaigns : null);
      if (campaignsToSync && campaignsToSync.length > 0) {
        // Use sendBeacon with proper content type for reliable sync on page unload
        // sendBeacon is designed to survive page navigation
        const blob = new Blob(
          [JSON.stringify({ campaigns: campaignsToSync })],
          { type: 'application/json' }
        );
        const sent = navigator.sendBeacon("/api/outreach/campaigns", blob);
        console.log("[Unload] sendBeacon result:", sent);
      }
    };

    // Also sync when tab becomes hidden (user switches tabs or navigates)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const campaignsToSync = pendingCampaignsRef.current || (hasUnsyncedChanges ? localCampaigns : null);
        if (campaignsToSync && campaignsToSync.length > 0) {
          // Use sendBeacon for visibility change too - more reliable than fetch
          const blob = new Blob(
            [JSON.stringify({ campaigns: campaignsToSync })],
            { type: 'application/json' }
          );
          navigator.sendBeacon("/api/outreach/campaigns", blob);
          console.log("[Visibility] Sent beacon on tab hide");
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasUnsyncedChanges, localCampaigns]);

  // Helper to update campaigns and sync to server
  const updateLocalCampaigns = useCallback((updater: (prev: OutreachPodcast[]) => OutreachPodcast[]) => {
    setLocalCampaigns(prev => {
      const updated = updater(prev);
      // Schedule sync to server
      scheduleSync(updated);
      return updated;
    });
  }, [scheduleSync]);

  // Function to update campaign stage locally and sync IMMEDIATELY
  // Stage changes (drag-drop) sync immediately to ensure persistence
  const updateCampaignStage = useCallback((podcastId: string, newStage: OutreachStage) => {
    setLocalCampaigns(prev => {
      const updated = prev.map(campaign =>
        campaign.id === podcastId
          ? { ...campaign, status: newStage }
          : campaign
      );

      // Save to localStorage immediately
      saveToLocalStorage(updated);

      // Sync to server IMMEDIATELY (no debounce for stage changes)
      // This ensures drag operations are saved even if user navigates away quickly
      setIsSyncing(true);
      setHasUnsyncedChanges(true);

      syncCampaignsToServer(updated).then(success => {
        setIsSyncing(false);
        if (success) {
          setHasUnsyncedChanges(false);
          setLastSyncTime(new Date());
          pendingCampaignsRef.current = null;
          console.log("[Sync] Stage change saved successfully");
        } else {
          setSyncError("Failed to save. Click to retry.");
          // Keep in pending so visibility/unload handlers can retry
          pendingCampaignsRef.current = updated;
        }
      });

      return updated;
    });
  }, []);

  // Manual sync function
  const handleManualSync = async () => {
    setSyncError(null);
    setIsSyncing(true);
    const success = await syncCampaignsToServer(localCampaigns);
    setIsSyncing(false);
    if (success) {
      setHasUnsyncedChanges(false);
      setLastSyncTime(new Date());
      pendingCampaignsRef.current = null;
    } else {
      setSyncError("Failed to save. Click to retry.");
    }
  };

  // Drag handlers
  const handleDragStart = (podcast: OutreachPodcast) => {
    setDraggedPodcast(podcast);
  };

  const handleDragOver = (e: React.DragEvent, stageId: OutreachStage) => {
    e.preventDefault();
    setDragOverStage(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: OutreachStage) => {
    e.preventDefault();
    if (draggedPodcast && draggedPodcast.status !== targetStage) {
      updateCampaignStage(draggedPodcast.id, targetStage);
    }
    setDraggedPodcast(null);
    setDragOverStage(null);
  };

  const handleDragEnd = () => {
    setDraggedPodcast(null);
    setDragOverStage(null);
  };

  // Use local campaigns as the source of truth for UI
  const podcasts: OutreachPodcast[] = localCampaigns;

  // Group podcasts by stage for pipeline view
  const podcastsByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage.id] = podcasts.filter((p) => p.status === stage.id);
    return acc;
  }, {} as Record<OutreachStage, OutreachPodcast[]>);

  // Stats
  const stats = {
    total: podcasts.length,
    awaiting: podcasts.filter((p) => p.status === "sent_awaiting").length,
    followUpDue: podcasts.filter((p) => p.status === "follow_up_due").length,
    responded: podcasts.filter((p) => p.status === "responded").length,
    booked: podcasts.filter((p) => p.status === "booked").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#02121a]">Email Campaigns</h1>
          <p className="text-sm text-[#006073]">
            Manage outreach emails and follow-up sequences per podcast
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sync Status */}
          <div className="flex items-center gap-2 text-sm">
            {isSyncing ? (
              <span className="flex items-center gap-1 text-[#0a9396]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            ) : syncError ? (
              <button
                onClick={handleManualSync}
                className="flex items-center gap-1 text-[#9d2227] hover:text-[#b02013]"
              >
                <AlertCircle className="h-4 w-4" />
                {syncError}
              </button>
            ) : hasUnsyncedChanges ? (
              <button
                onClick={handleManualSync}
                className="flex items-center gap-1 text-[#cb6701] hover:text-[#bb3f03]"
              >
                <Save className="h-4 w-4" />
                Saving...
              </button>
            ) : lastSyncTime ? (
              <span className="flex items-center gap-1 text-[#006073]">
                <CheckCircle className="h-4 w-4" />
                Saved
              </span>
            ) : null}
          </div>

          {/* View Toggle */}
          <div className="flex bg-[#ead7a5] rounded-lg p-1">
            <button
              onClick={() => setViewMode("pipeline")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                viewMode === "pipeline"
                  ? "bg-white shadow text-[#02121a]"
                  : "text-[#006073] hover:text-[#02121a]"
              )}
            >
              Pipeline
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                viewMode === "list"
                  ? "bg-white shadow text-[#02121a]"
                  : "text-[#006073] hover:text-[#02121a]"
              )}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard label="Total Campaigns" value={stats.total} icon={<Mail className="h-5 w-5" />} />
        <StatCard label="Awaiting Response" value={stats.awaiting} icon={<Clock className="h-5 w-5" />} color="teal" />
        <StatCard label="Follow-up Due" value={stats.followUpDue} icon={<RefreshCw className="h-5 w-5" />} color="orange" />
        <StatCard label="Responded" value={stats.responded} icon={<MessageSquare className="h-5 w-5" />} color="mint" />
        <StatCard label="Booked" value={stats.booked} icon={<CheckCircle className="h-5 w-5" />} color="green" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[#0a9396]" />
        </div>
      ) : viewMode === "pipeline" ? (
        // Pipeline View
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((stage) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              podcasts={podcastsByStage[stage.id] || []}
              onSelectPodcast={setSelectedPodcast}
              isDragOver={dragOverStage === stage.id}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              draggedPodcastId={draggedPodcast?.id || null}
            />
          ))}
        </div>
      ) : (
        // List View
        <div className="bg-white border border-[#94d2bd] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#ead7a5] border-b border-[#94d2bd]">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#02121a]">Podcast</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#02121a]">Stage</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#02121a]">Emails Sent</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#02121a]">Response</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#02121a]">Last Contact</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-[#02121a]">Next Action</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#94d2bd]">
                {podcasts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[#006073]">
                      No outreach campaigns yet. Add podcasts from the Discovery page.
                    </td>
                  </tr>
                ) : (
                  podcasts.map((podcast) => (
                    <OutreachTableRow
                      key={podcast.id}
                      podcast={podcast}
                      onClick={() => setSelectedPodcast(podcast)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Podcast Detail Sidebar */}
      {selectedPodcast && (
        <PodcastOutreachDetail
          podcast={selectedPodcast}
          onClose={() => setSelectedPodcast(null)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
            refetch();
          }}
          onUpdateCampaign={(id, updates) => {
            // Update local campaigns and sync to server
            updateLocalCampaigns(prev =>
              prev.map(campaign =>
                campaign.id === id
                  ? { ...campaign, ...updates }
                  : campaign
              )
            );
            // Also update the selected podcast so the sidebar reflects changes
            setSelectedPodcast(prev =>
              prev && prev.id === id
                ? { ...prev, ...updates }
                : prev
            );
          }}
        />
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  icon,
  color = "slate",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: "slate" | "teal" | "orange" | "mint" | "green";
}) {
  const colors = {
    slate: "bg-[#ead7a5] text-[#02121a]",
    teal: "bg-[#006073]/20 text-[#006073]",
    orange: "bg-[#cb6701]/20 text-[#cb6701]",
    mint: "bg-[#94d2bd]/30 text-[#006073]",
    green: "bg-[#94d2bd] text-[#02121a]",
  };

  return (
    <div className="bg-white border border-[#94d2bd] rounded-lg p-4">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", colors[color])}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-[#02121a]">{value}</p>
          <p className="text-sm text-[#006073]">{label}</p>
        </div>
      </div>
    </div>
  );
}

// Pipeline Column Component
function PipelineColumn({
  stage,
  podcasts,
  onSelectPodcast,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  draggedPodcastId,
}: {
  stage: { id: OutreachStage; label: string; color: string; icon: React.ReactNode };
  podcasts: OutreachPodcast[];
  onSelectPodcast: (podcast: OutreachPodcast) => void;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStart: (podcast: OutreachPodcast) => void;
  onDragEnd: () => void;
  draggedPodcastId: string | null;
}) {
  return (
    <div className="flex-shrink-0 w-72">
      <div className={cn("rounded-t-lg px-3 py-2 flex items-center gap-2", stage.color)}>
        {stage.icon}
        <span className="font-medium text-[#02121a]">{stage.label}</span>
        <span className="ml-auto bg-white/60 px-2 py-0.5 rounded text-sm font-medium">
          {podcasts.length}
        </span>
      </div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "bg-[#f5edd8] border border-t-0 border-[#94d2bd] rounded-b-lg p-2 min-h-[400px] space-y-2 transition-colors",
          isDragOver && "bg-[#94d2bd]/30 border-[#0a9396] border-2 border-dashed"
        )}
      >
        {podcasts.length === 0 ? (
          <p className={cn(
            "text-center text-sm py-8",
            isDragOver ? "text-[#0a9396]" : "text-[#006073]"
          )}>
            {isDragOver ? "Drop here" : "No podcasts"}
          </p>
        ) : (
          podcasts.map((podcast) => (
            <PipelineCard
              key={podcast.id}
              podcast={podcast}
              onClick={() => onSelectPodcast(podcast)}
              onDragStart={() => onDragStart(podcast)}
              onDragEnd={onDragEnd}
              isDragging={draggedPodcastId === podcast.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Pipeline Card Component
function PipelineCard({
  podcast,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  podcast: OutreachPodcast;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const sentCount = podcast.emailSequence?.filter((e) => e.status === "sent" || e.status === "opened" || e.status === "replied").length || 0;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", podcast.id);
    onDragStart();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "bg-white border border-[#94d2bd] rounded-lg p-3 hover:border-[#0a9396] hover:shadow-sm transition-all cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 shadow-lg ring-2 ring-[#0a9396]"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-[#02121a] text-sm line-clamp-1">{podcast.showName}</h4>
        <span
          className={cn(
            "text-xs px-1.5 py-0.5 rounded font-medium",
            podcast.tier === "TIER_1"
              ? "bg-[#94d2bd] text-[#02121a]"
              : podcast.tier === "TIER_2"
              ? "bg-[#0a9396]/20 text-[#006073]"
              : "bg-[#ead7a5] text-[#02121a]"
          )}
        >
          {podcast.tier?.replace("_", " ")}
        </span>
      </div>

      {podcast.hostName && (
        <p className="text-xs text-[#006073] mb-2 flex items-center gap-1">
          <User className="h-3 w-3" />
          {podcast.hostName}
        </p>
      )}

      <div className="flex items-center gap-2 text-xs text-[#006073]">
        <Mail className="h-3 w-3" />
        <span>{sentCount} email{sentCount !== 1 ? "s" : ""} sent</span>
      </div>

      {podcast.nextFollowUpAt && (
        <div className="mt-2 flex items-center gap-1 text-xs text-[#cb6701]">
          <Calendar className="h-3 w-3" />
          Follow-up: {new Date(podcast.nextFollowUpAt).toLocaleDateString()}
        </div>
      )}

      {podcast.responseType && (
        <div className="mt-2">
          <ResponseBadge type={podcast.responseType} />
        </div>
      )}
    </div>
  );
}

// Table Row Component
function OutreachTableRow({
  podcast,
  onClick,
}: {
  podcast: OutreachPodcast;
  onClick: () => void;
}) {
  const stage = PIPELINE_STAGES.find((s) => s.id === podcast.status);
  const sentCount = podcast.emailSequence?.filter((e) => ["sent", "opened", "replied"].includes(e.status)).length || 0;

  return (
    <tr
      onClick={onClick}
      className="hover:bg-[#ead7a5] cursor-pointer transition-colors"
    >
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-[#02121a]">{podcast.showName}</p>
          {podcast.hostName && (
            <p className="text-sm text-[#006073]">{podcast.hostName}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm", stage?.color)}>
          {stage?.icon}
          {stage?.label}
        </span>
      </td>
      <td className="px-4 py-3 text-[#02121a]">{sentCount}</td>
      <td className="px-4 py-3">
        {podcast.responseType ? (
          <ResponseBadge type={podcast.responseType} />
        ) : (
          <span className="text-[#006073]">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-[#006073]">
        {podcast.lastContactedAt
          ? new Date(podcast.lastContactedAt).toLocaleDateString()
          : "-"}
      </td>
      <td className="px-4 py-3 text-sm text-[#006073]">
        {podcast.nextFollowUpAt ? (
          <span className="text-[#cb6701]">
            Follow-up {new Date(podcast.nextFollowUpAt).toLocaleDateString()}
          </span>
        ) : (
          "-"
        )}
      </td>
      <td className="px-4 py-3">
        <button className="p-1 hover:bg-[#ead7a5] rounded">
          <ChevronRight className="h-4 w-4 text-[#006073]" />
        </button>
      </td>
    </tr>
  );
}

// Response Badge Component
function ResponseBadge({ type }: { type: ResponseType }) {
  const branch = RESPONSE_BRANCHES.find((b) => b.id === type);
  if (!branch) return null;

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium", branch.bgColor, branch.color)}>
      {type === "booked" && <CheckCircle className="h-3 w-3" />}
      {type === "not_interested" && <XCircle className="h-3 w-3" />}
      {type === "opted_out" && <AlertCircle className="h-3 w-3" />}
      {branch.label}
    </span>
  );
}

// Podcast Outreach Detail Sidebar
function PodcastOutreachDetail({
  podcast,
  onClose,
  onUpdate,
  onUpdateCampaign,
}: {
  podcast: OutreachPodcast;
  onClose: () => void;
  onUpdate: () => void;
  onUpdateCampaign: (id: string, updates: Partial<OutreachPodcast>) => void;
}) {
  const [selectedResponse, setSelectedResponse] = useState<ResponseType | null>(podcast.responseType);
  const [editingEmail, setEditingEmail] = useState<EmailInSequence | null>(null);
  const [viewingEmail, setViewingEmail] = useState<EmailInSequence | null>(null);

  const updateResponse = useMutation({
    mutationFn: async (response: ResponseType | null) => {
      const res = await fetch(`/api/outreach/campaigns/${podcast.id}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseType: response, clearResponse: response === null }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      // Update local state
      onUpdateCampaign(podcast.id, { responseType: selectedResponse });
    },
  });

  const handleResponseChange = (response: ResponseType) => {
    // Toggle off if clicking the same option
    const newValue = selectedResponse === response ? null : response;
    setSelectedResponse(newValue);
    updateResponse.mutate(newValue);
  };

  const handleEmailSaved = (email: EmailInSequence) => {
    // Update local campaign state with new/updated email
    const existingIndex = podcast.emailSequence?.findIndex(e => e.type === email.type) ?? -1;
    let newSequence: EmailInSequence[];
    if (existingIndex >= 0) {
      newSequence = [...(podcast.emailSequence || [])];
      newSequence[existingIndex] = email;
    } else {
      newSequence = [...(podcast.emailSequence || []), email];
    }
    onUpdateCampaign(podcast.id, { emailSequence: newSequence });
    setEditingEmail(null);
  };

  const handleEditEmail = (email: EmailInSequence) => {
    setEditingEmail(email);
  };

  const handleCancelEdit = () => {
    setEditingEmail(null);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-white border-l border-[#94d2bd] shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#94d2bd] flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#02121a]">{podcast.showName}</h2>
          {podcast.hostName && (
            <p className="text-sm text-[#006073]">Host: {podcast.hostName}</p>
          )}
          <p className="text-sm text-[#006073] mt-1">
            {podcast.primaryEmail || "No email"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-[#ead7a5] rounded-lg transition-colors"
        >
          <XCircle className="h-5 w-5 text-[#006073]" />
        </button>
      </div>

      {/* Response Branch Selector */}
      <div className="px-6 py-4 border-b border-[#94d2bd]">
        <h3 className="text-sm font-medium text-[#02121a] mb-3">Response Status</h3>
        <div className="grid grid-cols-2 gap-2">
          {RESPONSE_BRANCHES.map((branch) => (
            <button
              key={branch.id}
              onClick={() => handleResponseChange(branch.id as ResponseType)}
              className={cn(
                "p-3 rounded-lg border text-left transition-all",
                selectedResponse === branch.id
                  ? "border-[#0a9396] bg-[#94d2bd]/20"
                  : "border-[#94d2bd] hover:border-[#0a9396]"
              )}
            >
              <p className={cn("font-medium text-sm", branch.color)}>{branch.label}</p>
              <p className="text-xs text-[#006073] mt-0.5">{branch.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Section Header */}
      <div className="border-b border-[#94d2bd] px-6 py-3">
        <h3 className="text-sm font-medium text-[#02121a]">Email Sequence</h3>
      </div>

      {/* View Email Modal */}
      {viewingEmail && (
        <div className="absolute inset-0 bg-[#02121a]/50 z-10 flex items-center justify-center p-6">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[#94d2bd] flex items-center justify-between">
              <h3 className="font-semibold text-[#02121a]">Email Details</h3>
              <button onClick={() => setViewingEmail(null)} className="p-1 hover:bg-[#ead7a5] rounded">
                <XCircle className="h-5 w-5 text-[#006073]" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-[#006073]">Subject</p>
                <p className="font-medium text-[#02121a]">{viewingEmail.subject}</p>
              </div>
              <div>
                <p className="text-sm text-[#006073]">Body</p>
                <p className="text-[#02121a] whitespace-pre-wrap">{viewingEmail.body}</p>
              </div>
              {viewingEmail.sentAt && (
                <div>
                  <p className="text-sm text-[#006073]">Sent</p>
                  <p className="text-[#02121a]">{new Date(viewingEmail.sentAt).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {editingEmail ? (
          <ComposeEmail
            podcast={podcast}
            onSent={handleEmailSaved}
            editingEmail={editingEmail}
            onCancel={handleCancelEdit}
          />
        ) : (
          <EmailSequenceTimeline
            podcast={podcast}
            onUpdate={onUpdate}
            onEditEmail={handleEditEmail}
            onViewEmail={setViewingEmail}
            onUpdateCampaign={onUpdateCampaign}
          />
        )}
      </div>
    </div>
  );
}

// Email Sequence Timeline
function EmailSequenceTimeline({
  podcast,
  onUpdate,
  onEditEmail,
  onViewEmail,
  onUpdateCampaign,
}: {
  podcast: OutreachPodcast;
  onUpdate: () => void;
  onEditEmail: (email: EmailInSequence) => void;
  onViewEmail: (email: EmailInSequence) => void;
  onUpdateCampaign: (id: string, updates: Partial<OutreachPodcast>) => void;
}) {
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [isGeneratingSequence, setIsGeneratingSequence] = useState(false);
  const [isStartingCampaign, setIsStartingCampaign] = useState(false);
  const sequence = podcast.emailSequence || [];

  // Define the sequence template based on response type
  const getSequenceTemplate = () => {
    if (podcast.responseType === "interested_not_booked") {
      return [
        { type: "initial", label: "Initial Outreach" },
        { type: "nurture", label: "Nurture Email" },
      ];
    }
    return [
      { type: "initial", label: "Initial Outreach" },
      { type: "follow_up_1", label: "Follow-up #1" },
      { type: "follow_up_2", label: "Follow-up #2" },
      { type: "follow_up_3", label: "Final Follow-up" },
    ];
  };

  const template = getSequenceTemplate();

  // Check if we have any emails in the sequence
  const hasEmails = sequence.length > 0;
  const allEmailsGenerated = template.every(step =>
    sequence.some(e => e.type === step.type)
  );

  const handleGenerateAllEmails = async () => {
    setIsGeneratingSequence(true);
    try {
      // Load guest profile and email settings from localStorage (these would be saved from settings page)
      let guestProfile = {};
      let emailSettings = {};

      if (typeof window !== "undefined") {
        const storedProfile = localStorage.getItem("guest-profile");
        const storedEmailSettings = localStorage.getItem("email-settings");
        if (storedProfile) {
          try { guestProfile = JSON.parse(storedProfile); } catch {}
        }
        if (storedEmailSettings) {
          try { emailSettings = JSON.parse(storedEmailSettings); } catch {}
        }
      }

      const res = await fetch("/api/ai/generate-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podcastId: podcast.id,
          podcastName: podcast.showName,
          hostName: podcast.hostName,
          podcastEmail: podcast.primaryEmail,
          guestProfile,
          emailSettings,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.emailSequence) {
          onUpdateCampaign(podcast.id, {
            emailSequence: data.emailSequence,
            status: "drafting" as OutreachStage,
          });
        }
      } else {
        // Fallback to basic templates if AI fails
        const fallbackSequence: EmailInSequence[] = [
          {
            id: `email-initial-${Date.now()}`,
            type: "initial",
            subject: `Guest opportunity for ${podcast.showName}`,
            body: `Hi ${podcast.hostName || "there"},\n\nI recently came across ${podcast.showName} and was impressed by your content.\n\nI'd love to explore the possibility of being a guest on your show. Would you be open to a quick call to discuss this further?\n\nBest regards`,
            status: "draft",
            sentAt: null,
            scheduledFor: null,
            openedAt: null,
            repliedAt: null,
          },
          {
            id: `email-fu1-${Date.now()}`,
            type: "follow_up_1",
            subject: `Following up - ${podcast.showName}`,
            body: `Hi ${podcast.hostName || "there"},\n\nI wanted to follow up on my previous email about being a guest on ${podcast.showName}.\n\nI understand you're busy, but I'd love to explore this opportunity if you're interested.\n\nBest regards`,
            status: "draft",
            sentAt: null,
            scheduledFor: null,
            openedAt: null,
            repliedAt: null,
          },
          {
            id: `email-fu2-${Date.now()}`,
            type: "follow_up_2",
            subject: `Quick check-in - ${podcast.showName}`,
            body: `Hi ${podcast.hostName || "there"},\n\nJust a quick check-in about the guest opportunity.\n\nIf now isn't a good time, no worries at all. Let me know if you'd like me to reach out again in the future.\n\nBest regards`,
            status: "draft",
            sentAt: null,
            scheduledFor: null,
            openedAt: null,
            repliedAt: null,
          },
          {
            id: `email-fu3-${Date.now()}`,
            type: "follow_up_3",
            subject: `Last note - ${podcast.showName}`,
            body: `Hi ${podcast.hostName || "there"},\n\nThis will be my last follow-up regarding being a guest on ${podcast.showName}.\n\nIf you're ever looking for guests in the future, please feel free to reach out. I'd be happy to chat.\n\nAll the best`,
            status: "draft",
            sentAt: null,
            scheduledFor: null,
            openedAt: null,
            repliedAt: null,
          },
        ];
        onUpdateCampaign(podcast.id, {
          emailSequence: fallbackSequence,
          status: "drafting" as OutreachStage,
        });
      }
    } catch (error) {
      console.error("Failed to generate email sequence:", error);
    }
    setIsGeneratingSequence(false);
  };

  const handleSendNow = async (email: EmailInSequence) => {
    setSendingEmailId(email.id);
    try {
      const res = await fetch(`/api/outreach/campaigns/${podcast.id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: email.id,
          type: email.type,
          subject: email.subject,
          body: email.body,
          status: "sent",
          action: "send",
        }),
      });
      if (res.ok) {
        // Update local state
        const updatedEmail: EmailInSequence = {
          ...email,
          status: "sent",
          sentAt: new Date().toISOString(),
        };
        const newSequence = podcast.emailSequence?.map(e =>
          e.id === email.id ? updatedEmail : e
        ) || [];
        onUpdateCampaign(podcast.id, {
          emailSequence: newSequence,
          lastContactedAt: new Date().toISOString(),
          status: "sent_awaiting" as OutreachStage,
        });
      }
    } catch (error) {
      console.error("Failed to send email:", error);
    }
    setSendingEmailId(null);
  };

  // Check if campaign can be started (all emails generated and initial not sent)
  const initialEmail = sequence.find(e => e.type === "initial");
  const campaignNotStarted = initialEmail && initialEmail.status === "draft";
  const canStartCampaign = allEmailsGenerated && campaignNotStarted;

  const handleStartCampaign = async () => {
    if (!initialEmail) return;

    setIsStartingCampaign(true);
    try {
      // Load email settings from localStorage for follow-up timing
      let emailSettings = {
        followUp1Days: 5,
        followUp2Days: 7,
        followUp3Days: 14,
      };

      if (typeof window !== "undefined") {
        const storedEmailSettings = localStorage.getItem("email-settings");
        if (storedEmailSettings) {
          try {
            const parsed = JSON.parse(storedEmailSettings);
            emailSettings = {
              followUp1Days: parsed.followUp1Days || 5,
              followUp2Days: parsed.followUp2Days || 7,
              followUp3Days: parsed.followUp3Days || 14,
            };
          } catch {}
        }
      }

      // Send the initial outreach email
      const res = await fetch(`/api/outreach/campaigns/${podcast.id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initialEmail.id,
          type: initialEmail.type,
          subject: initialEmail.subject,
          body: initialEmail.body,
          status: "sent",
          action: "send",
        }),
      });

      if (res.ok) {
        const now = new Date();

        // Calculate scheduled dates for follow-up emails
        const followUp1Date = new Date(now);
        followUp1Date.setDate(followUp1Date.getDate() + emailSettings.followUp1Days);

        const followUp2Date = new Date(followUp1Date);
        followUp2Date.setDate(followUp2Date.getDate() + emailSettings.followUp2Days);

        const followUp3Date = new Date(followUp2Date);
        followUp3Date.setDate(followUp3Date.getDate() + emailSettings.followUp3Days);

        // Update all emails in the sequence
        const newSequence = sequence.map(email => {
          if (email.type === "initial") {
            return {
              ...email,
              status: "sent" as const,
              sentAt: now.toISOString(),
            };
          } else if (email.type === "follow_up_1") {
            return {
              ...email,
              status: "scheduled" as const,
              scheduledFor: followUp1Date.toISOString(),
            };
          } else if (email.type === "follow_up_2") {
            return {
              ...email,
              status: "scheduled" as const,
              scheduledFor: followUp2Date.toISOString(),
            };
          } else if (email.type === "follow_up_3") {
            return {
              ...email,
              status: "scheduled" as const,
              scheduledFor: followUp3Date.toISOString(),
            };
          }
          return email;
        });

        // Update campaign: mark as sent_awaiting and set next follow-up date
        onUpdateCampaign(podcast.id, {
          emailSequence: newSequence,
          lastContactedAt: now.toISOString(),
          nextFollowUpAt: followUp1Date.toISOString(),
          status: "sent_awaiting" as OutreachStage,
        });
      }
    } catch (error) {
      console.error("Failed to start campaign:", error);
    }
    setIsStartingCampaign(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-slate-900">Email Timeline</h4>
        {!allEmailsGenerated && (
          <button
            onClick={handleGenerateAllEmails}
            disabled={isGeneratingSequence}
            className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isGeneratingSequence ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Generate All Emails
              </>
            )}
          </button>
        )}
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

        {template.map((step, index) => {
          const email = sequence.find((e) => e.type === step.type);
          const isCompleted = email && ["sent", "opened", "replied"].includes(email.status);
          const isPending = email && email.status === "draft";
          const isScheduled = email && email.status === "scheduled";
          const isSending = email && sendingEmailId === email.id;

          return (
            <div key={step.type} className="relative pl-10 pb-6 last:pb-0">
              {/* Timeline dot */}
              <div
                className={cn(
                  "absolute left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center",
                  isCompleted
                    ? "bg-green-500 border-green-500"
                    : isPending
                    ? "bg-blue-500 border-blue-500"
                    : isScheduled
                    ? "bg-amber-500 border-amber-500"
                    : "bg-white border-slate-300"
                )}
              >
                {isCompleted && <CheckCircle className="h-3 w-3 text-white" />}
                {isPending && <Edit className="h-3 w-3 text-white" />}
                {isScheduled && <Clock className="h-3 w-3 text-white" />}
              </div>

              {/* Content */}
              <div
                className={cn(
                  "bg-slate-50 border border-slate-200 rounded-lg p-4",
                  !email && "border-dashed"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-slate-900">{step.label}</h5>
                  {email?.sentAt && (
                    <span className="text-xs text-slate-500">
                      Sent {new Date(email.sentAt).toLocaleDateString()}
                    </span>
                  )}
                  {email?.scheduledFor && !email.sentAt && (
                    <span className="text-xs text-amber-600">
                      Scheduled {new Date(email.scheduledFor).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {email ? (
                  <>
                    <p className="text-sm font-medium text-slate-700 mb-1">
                      {email.subject}
                    </p>
                    <p className="text-sm text-slate-600 line-clamp-2">{email.body}</p>

                    {/* Status indicators */}
                    <div className="flex items-center gap-3 mt-3 text-xs">
                      {email.status === "sent" && (
                        <span className="text-blue-600 flex items-center gap-1">
                          <Send className="h-3 w-3" /> Sent
                        </span>
                      )}
                      {email.status === "opened" && (
                        <span className="text-green-600 flex items-center gap-1">
                          <Eye className="h-3 w-3" /> Opened
                        </span>
                      )}
                      {email.status === "replied" && (
                        <span className="text-purple-600 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> Replied
                        </span>
                      )}
                    </div>

                    {email.status === "draft" && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => onEditEmail(email)}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-slate-500">Not created yet</p>
                    <p className="text-xs text-slate-400 mt-1">Use &quot;Generate All Emails&quot; above</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Start Campaign Button - shows when all 4 emails are generated */}
      {canStartCampaign && (
        <div className="mt-6 pt-4 border-t border-slate-200">
          <button
            onClick={handleStartCampaign}
            disabled={isStartingCampaign}
            className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-teal-600 text-white font-medium rounded-lg hover:from-green-700 hover:to-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
          >
            {isStartingCampaign ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Starting Campaign...
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                Start Campaign
              </>
            )}
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">
            This will send the initial email and schedule follow-ups automatically
          </p>
        </div>
      )}
    </div>
  );
}

// Compose Email Component - Used for editing existing emails
function ComposeEmail({
  podcast,
  onSent,
  editingEmail,
  onCancel,
}: {
  podcast: OutreachPodcast;
  onSent: (email: EmailInSequence) => void;
  editingEmail: EmailInSequence;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState(editingEmail.subject);
  const [body, setBody] = useState(editingEmail.body);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Update form when editing email changes
  useEffect(() => {
    setSubject(editingEmail.subject);
    setBody(editingEmail.body);
  }, [editingEmail]);

  const emailTypeLabels: Record<string, string> = {
    initial: "Initial Outreach",
    follow_up_1: "Follow-up #1",
    follow_up_2: "Follow-up #2",
    follow_up_3: "Final Follow-up",
    nurture: "Nurture Email",
    closing: "Closing Email",
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/outreach/campaigns/${podcast.id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEmail.id,
          type: editingEmail.type,
          subject,
          body,
          status: "draft",
        }),
      });
      if (res.ok) {
        const savedEmail: EmailInSequence = {
          ...editingEmail,
          subject,
          body,
        };
        onSent(savedEmail);
      }
    } catch (error) {
      console.error("Failed to save email:", error);
    }
    setIsSaving(false);
  };

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podcastId: podcast.id,
          podcastName: podcast.showName,
          hostName: podcast.hostName,
          emailType: editingEmail.type,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.subject) setSubject(data.subject);
        if (data.body) setBody(data.body);
      } else {
        // Fallback to template if AI fails
        const templates: Record<string, { subject: string; body: string }> = {
          initial: {
            subject: `Podcast Guest Opportunity - ${podcast.showName}`,
            body: `Hi ${podcast.hostName || "there"},\n\nI hope this email finds you well. I recently came across ${podcast.showName} and was impressed by your content.\n\nI'd love to explore the possibility of being a guest on your show. I believe my expertise in [your area] would provide valuable insights for your audience.\n\nWould you be open to a quick call to discuss this further?\n\nBest regards`,
          },
          follow_up_1: {
            subject: `Following up - Guest appearance on ${podcast.showName}`,
            body: `Hi ${podcast.hostName || "there"},\n\nI wanted to follow up on my previous email about potentially being a guest on ${podcast.showName}.\n\nI understand you're busy, but I'd love to explore this opportunity if you're interested.\n\nLet me know if you'd like to chat!\n\nBest regards`,
          },
          follow_up_2: {
            subject: `Quick check-in - ${podcast.showName}`,
            body: `Hi ${podcast.hostName || "there"},\n\nJust wanted to check in one more time about the guest opportunity on ${podcast.showName}.\n\nIf now isn't a good time, no worries at all. Just let me know if you'd like me to reach out again in the future.\n\nBest regards`,
          },
          follow_up_3: {
            subject: `Last note - ${podcast.showName}`,
            body: `Hi ${podcast.hostName || "there"},\n\nThis will be my last follow-up regarding being a guest on ${podcast.showName}.\n\nIf you're ever looking for guests in the future, please feel free to reach out.\n\nAll the best`,
          },
        };
        const template = templates[editingEmail.type] || templates.initial;
        setSubject(template.subject);
        setBody(template.body);
      }
    } catch (error) {
      console.error("Failed to generate AI content:", error);
      // Use basic template on error
      setSubject(`Regarding ${podcast.showName}`);
      setBody(`Hi ${podcast.hostName || "there"},\n\n[Your message here]\n\nBest regards`);
    }
    setIsGenerating(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
          Editing: {emailTypeLabels[editingEmail.type] || editingEmail.type}
        </div>
        <button
          onClick={onCancel}
          className="text-sm text-slate-600 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">To</label>
        <input
          type="text"
          value={podcast.primaryEmail || "No email"}
          disabled
          className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-600"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Enter email subject..."
          className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your email..."
          rows={12}
          className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !subject || !body}
          className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit className="h-4 w-4" />}
          Update Draft
        </button>
        <button
          onClick={handleGenerateAI}
          disabled={isGenerating}
          className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Regenerate with AI
        </button>
      </div>
    </div>
  );
}
