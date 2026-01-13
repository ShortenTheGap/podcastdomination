"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  Filter,
  Search,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Status groups for Kanban-style view
const STATUS_GROUPS = [
  {
    id: "ready",
    label: "Ready to Send",
    statuses: ["QA_APPROVED"],
    color: "bg-green-500",
  },
  {
    id: "pending",
    label: "Pending Action",
    statuses: ["FOLLOW_UP_DUE", "ESCALATION_DUE"],
    color: "bg-yellow-500",
  },
  {
    id: "waiting",
    label: "Waiting Response",
    statuses: ["SENT", "FOLLOW_UP_SENT", "ESCALATED"],
    color: "bg-blue-500",
  },
  {
    id: "needs_work",
    label: "Needs Work",
    statuses: ["NOT_CONTACTED", "READY_TO_DRAFT", "DRAFTED"],
    color: "bg-gray-500",
  },
  {
    id: "closed",
    label: "Closed",
    statuses: ["REPLIED", "CLOSED"],
    color: "bg-purple-500",
  },
];

export default function PipelinePage() {
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [filters, setFilters] = useState({
    status: "",
    tier: "",
    outcome: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["podcasts", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.tier) params.set("tier", filters.tier);
      if (filters.outcome) params.set("outcome", filters.outcome);

      const res = await fetch(`/api/podcasts?${params}`);
      return res.json();
    },
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-white">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Outreach Pipeline</h1>
          <p className="text-sm text-slate-500">
            {data?.total || 0} podcasts in pipeline
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex border border-slate-300 rounded-lg">
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "px-3 py-1.5 text-sm text-slate-700",
                viewMode === "table" && "bg-slate-200"
              )}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "px-3 py-1.5 text-sm text-slate-700",
                viewMode === "kanban" && "bg-slate-200"
              )}
            >
              Board
            </button>
          </div>

          {/* Filters */}
          <FilterDropdown filters={filters} onChange={setFilters} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : viewMode === "table" ? (
          <PipelineTable podcasts={data?.podcasts || []} />
        ) : (
          <PipelineBoard podcasts={data?.podcasts || []} />
        )}
      </div>
    </div>
  );
}

function PipelineTable({ podcasts }: { podcasts: any[] }) {
  return (
    <table className="w-full">
      <thead className="bg-slate-100 sticky top-0">
        <tr>
          <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Show</th>
          <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Tier</th>
          <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Status</th>
          <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">
            Next Action
          </th>
          <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Contact</th>
          <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Outcome</th>
          <th className="w-12"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {podcasts.map((podcast) => (
          <PodcastRow key={podcast.id} podcast={podcast} />
        ))}
      </tbody>
    </table>
  );
}

function PodcastRow({ podcast }: { podcast: any }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${podcast.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: async (tier: string) => {
      const res = await fetch(`/api/podcasts/${podcast.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
      setMenuOpen(false);
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "QA_APPROVED":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "SENT":
      case "FOLLOW_UP_SENT":
        return <Send className="h-4 w-4 text-blue-500" />;
      case "FOLLOW_UP_DUE":
      case "ESCALATION_DUE":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-slate-900">{podcast.showName}</p>
          <p className="text-sm text-slate-500">
            {podcast.hostName || "Unknown host"}
          </p>
        </div>
      </td>
      <td className="px-4 py-3">
        <TierBadge tier={podcast.tier} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {getStatusIcon(podcast.status)}
          <span className="text-sm text-slate-700">{formatStatus(podcast.status)}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        {podcast.nextAction && podcast.nextAction !== "NONE" ? (
          <div>
            <p className="text-sm font-medium text-slate-700">
              {formatAction(podcast.nextAction)}
            </p>
            {podcast.nextActionDate && (
              <p className="text-xs text-slate-500">
                {new Date(podcast.nextActionDate).toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-slate-700 truncate max-w-[200px]">
          {podcast.primaryEmail || "—"}
        </p>
      </td>
      <td className="px-4 py-3">
        <OutcomeBadge outcome={podcast.outcome} />
      </td>
      <td className="px-4 py-3 relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1 hover:bg-slate-200 rounded"
        >
          <MoreHorizontal className="h-4 w-4 text-slate-500" />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
              <a
                href={podcast.primaryPlatformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => setMenuOpen(false)}
              >
                View on Apple Podcasts
              </a>
              <hr className="my-1 border-slate-200" />
              <div className="px-4 py-1 text-xs text-slate-500 font-medium">Set Tier</div>
              <button
                onClick={() => updateTierMutation.mutate("TIER_1")}
                className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Tier 1 (Strong fit)
              </button>
              <button
                onClick={() => updateTierMutation.mutate("TIER_2")}
                className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Tier 2 (Good fit)
              </button>
              <button
                onClick={() => updateTierMutation.mutate("TIER_3")}
                className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Tier 3 (Weak fit)
              </button>
              <hr className="my-1 border-slate-200" />
              <button
                onClick={() => {
                  if (confirm("Delete this podcast from your pipeline?")) {
                    deleteMutation.mutate();
                  }
                  setMenuOpen(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Remove from Pipeline
              </button>
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    TIER_1: "bg-emerald-100 text-emerald-700",
    TIER_2: "bg-green-100 text-green-700",
    TIER_3: "bg-red-100 text-red-700",
    PENDING: "bg-gray-100 text-gray-700",
  };

  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded text-xs font-medium",
        colors[tier] || colors.PENDING
      )}
    >
      {tier.replace("_", " ")}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-700",
    BOOKED: "bg-green-100 text-green-700",
    DECLINED: "bg-red-100 text-red-700",
    NO_RESPONSE: "bg-gray-100 text-gray-700",
    SUPPRESSED: "bg-orange-100 text-orange-700",
  };

  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded text-xs font-medium",
        colors[outcome] || "bg-gray-100"
      )}
    >
      {outcome.replace("_", " ")}
    </span>
  );
}

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function formatAction(action: string): string {
  const labels: Record<string, string> = {
    DRAFT: "Create Draft",
    QA: "Review Draft",
    SEND: "Send Email",
    FOLLOW_UP: "Send Follow-up",
    ESCALATE: "Try Backup Contact",
    CLOSE: "Close Out",
  };
  return labels[action] || action;
}

function FilterDropdown({
  filters,
  onChange,
}: {
  filters: { status: string; tier: string; outcome: string };
  onChange: (filters: { status: string; tier: string; outcome: string }) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 border rounded-lg hover:bg-muted"
      >
        <Filter className="h-4 w-4" />
        <span className="text-sm">Filters</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-background border rounded-lg shadow-lg p-4 z-10">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Status</label>
              <select
                className="w-full mt-1 border rounded px-2 py-1 text-sm"
                value={filters.status}
                onChange={(e) =>
                  onChange({ ...filters, status: e.target.value })
                }
              >
                <option value="">All</option>
                <option value="NOT_CONTACTED">Not Contacted</option>
                <option value="READY_TO_DRAFT">Ready to Draft</option>
                <option value="DRAFTED">Drafted</option>
                <option value="QA_APPROVED">QA Approved</option>
                <option value="SENT">Sent</option>
                <option value="FOLLOW_UP_DUE">Follow-up Due</option>
                <option value="REPLIED">Replied</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Tier</label>
              <select
                className="w-full mt-1 border rounded px-2 py-1 text-sm"
                value={filters.tier}
                onChange={(e) => onChange({ ...filters, tier: e.target.value })}
              >
                <option value="">All</option>
                <option value="TIER_1">Tier 1</option>
                <option value="TIER_2">Tier 2</option>
                <option value="TIER_3">Tier 3</option>
                <option value="PENDING">Pending</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Outcome</label>
              <select
                className="w-full mt-1 border rounded px-2 py-1 text-sm"
                value={filters.outcome}
                onChange={(e) =>
                  onChange({ ...filters, outcome: e.target.value })
                }
              >
                <option value="">All</option>
                <option value="OPEN">Open</option>
                <option value="BOOKED">Booked</option>
                <option value="DECLINED">Declined</option>
                <option value="NO_RESPONSE">No Response</option>
              </select>
            </div>

            <button
              onClick={() => onChange({ status: "", tier: "", outcome: "" })}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineBoard({ podcasts }: { podcasts: any[] }) {
  return (
    <div className="flex gap-4 p-4 overflow-x-auto">
      {STATUS_GROUPS.map((group) => {
        const groupPodcasts = podcasts.filter((p) =>
          group.statuses.includes(p.status)
        );

        return (
          <div
            key={group.id}
            className="flex-shrink-0 w-80 bg-muted/30 rounded-lg"
          >
            <div className="p-3 border-b flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", group.color)} />
              <span className="font-medium">{group.label}</span>
              <span className="text-muted-foreground text-sm ml-auto">
                {groupPodcasts.length}
              </span>
            </div>
            <div className="p-2 space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
              {groupPodcasts.map((podcast) => (
                <PodcastCard key={podcast.id} podcast={podcast} />
              ))}
              {groupPodcasts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No podcasts
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PodcastCard({ podcast }: { podcast: any }) {
  return (
    <div className="bg-background p-3 rounded-lg border shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <p className="font-medium truncate">{podcast.showName}</p>
      <p className="text-sm text-muted-foreground truncate">
        {podcast.hostName || "Unknown host"}
      </p>
      <div className="flex items-center gap-2 mt-2">
        <TierBadge tier={podcast.tier} />
        {podcast.nextAction && podcast.nextAction !== "NONE" && (
          <span className="text-xs text-muted-foreground">
            {formatAction(podcast.nextAction)}
          </span>
        )}
      </div>
    </div>
  );
}
