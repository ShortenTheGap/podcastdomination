"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Send,
  Clock,
  CheckCircle,
  ChevronDown,
  Filter,
  MoreHorizontal,
  Sparkles,
  X,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Status groups for Kanban view
const STATUS_GROUPS = [
  {
    id: "new",
    label: "New",
    statuses: ["NOT_CONTACTED"],
    color: "bg-slate-500",
  },
  {
    id: "ready",
    label: "Ready to Send",
    statuses: ["READY", "READY_TO_DRAFT", "DRAFTED", "QA_APPROVED"],
    color: "bg-green-500",
  },
  {
    id: "sent",
    label: "Sent",
    statuses: ["SENT", "FOLLOW_UP_DUE", "FOLLOW_UP_SENT"],
    color: "bg-purple-500",
  },
  {
    id: "replied",
    label: "Replied",
    statuses: ["REPLIED"],
    color: "bg-emerald-500",
  },
  {
    id: "skipped",
    label: "Skipped",
    statuses: ["SKIPPED", "CLOSED"],
    color: "bg-red-500",
  },
];

export default function PipelinePage() {
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["podcasts", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      // Don't show suppressed podcasts by default
      params.set("suppressed", "false");
      const res = await fetch(`/api/podcasts?${params}`);
      return res.json();
    },
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-white">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">
            {data?.total || 0} podcasts
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex border border-slate-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "px-3 py-1.5 text-sm",
                viewMode === "table"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "px-3 py-1.5 text-sm",
                viewMode === "kanban"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              Board
            </button>
          </div>

          {/* Filter */}
          <FilterDropdown value={statusFilter} onChange={setStatusFilter} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
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
  if (podcasts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">No podcasts in pipeline</p>
        <p className="text-sm text-slate-400 mt-1">
          Add podcasts from the Discovery tab
        </p>
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead className="bg-slate-50 sticky top-0">
        <tr>
          <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">
            Podcast
          </th>
          <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">
            Status
          </th>
          <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">
            Contact
          </th>
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
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const handleRowClick = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest("button") ||
      (e.target as HTMLElement).closest(".action-menu")
    ) {
      return;
    }
    router.push(`/podcast/${podcast.id}`);
  };

  const handleMenuOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - 160,
      });
    }
    setMenuOpen(!menuOpen);
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/podcasts/${podcast.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["podcasts"] });
    },
  });

  return (
    <tr
      className="hover:bg-slate-50 cursor-pointer"
      onClick={handleRowClick}
    >
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-slate-900">{podcast.showName}</p>
          <p className="text-sm text-slate-500">
            {podcast.hostName || "Unknown host"}
          </p>
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={podcast.status} />
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-slate-600 truncate max-w-[200px]">
          {podcast.primaryEmail || "No email"}
        </p>
      </td>
      <td className="px-4 py-3">
        <button
          ref={buttonRef}
          onClick={handleMenuOpen}
          className="p-1 hover:bg-slate-200 rounded"
        >
          <MoreHorizontal className="h-4 w-4 text-slate-500" />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div
              className="fixed w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              <a
                href={podcast.primaryPlatformUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => setMenuOpen(false)}
              >
                View Podcast
              </a>
              <hr className="my-1 border-slate-200" />
              <button
                onClick={() => {
                  if (confirm("Remove this podcast from your pipeline?")) {
                    deleteMutation.mutate();
                  }
                  setMenuOpen(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; icon: any }> = {
    NOT_CONTACTED: {
      label: "New",
      color: "bg-slate-100 text-slate-700",
      icon: Sparkles,
    },
    READY: {
      label: "Ready",
      color: "bg-green-100 text-green-700",
      icon: CheckCircle,
    },
    READY_TO_DRAFT: {
      label: "Ready",
      color: "bg-green-100 text-green-700",
      icon: CheckCircle,
    },
    DRAFTED: {
      label: "Ready",
      color: "bg-green-100 text-green-700",
      icon: CheckCircle,
    },
    QA_APPROVED: {
      label: "Ready",
      color: "bg-green-100 text-green-700",
      icon: CheckCircle,
    },
    SKIPPED: {
      label: "Skipped",
      color: "bg-red-100 text-red-700",
      icon: X,
    },
    SENT: {
      label: "Sent",
      color: "bg-purple-100 text-purple-700",
      icon: Send,
    },
    FOLLOW_UP_DUE: {
      label: "Follow-up Due",
      color: "bg-amber-100 text-amber-700",
      icon: Clock,
    },
    REPLIED: {
      label: "Replied",
      color: "bg-emerald-100 text-emerald-700",
      icon: MessageSquare,
    },
    CLOSED: {
      label: "Closed",
      color: "bg-slate-100 text-slate-700",
      icon: CheckCircle,
    },
  };

  const { label, color, icon: Icon } = config[status] || config.NOT_CONTACTED;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        color
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function FilterDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const options = [
    { value: "", label: "All" },
    { value: "NOT_CONTACTED", label: "New" },
    { value: "READY", label: "Ready to Send" },
    { value: "SENT", label: "Sent" },
    { value: "REPLIED", label: "Replied" },
    { value: "SKIPPED", label: "Skipped" },
  ];

  const selectedLabel = options.find((o) => o.value === value)?.label || "All";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700"
      >
        <Filter className="h-4 w-4" />
        <span className="text-sm">{selectedLabel}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "block w-full text-left px-4 py-2 text-sm hover:bg-slate-100",
                  value === option.value
                    ? "text-blue-600 font-medium"
                    : "text-slate-700"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PipelineBoard({ podcasts }: { podcasts: any[] }) {
  const router = useRouter();

  return (
    <div className="flex gap-4 p-4 overflow-x-auto h-full">
      {STATUS_GROUPS.map((group) => {
        const groupPodcasts = podcasts.filter((p) =>
          group.statuses.includes(p.status)
        );

        return (
          <div
            key={group.id}
            className="flex-shrink-0 w-72 bg-slate-100 rounded-lg flex flex-col"
          >
            <div className="p-3 border-b border-slate-200 flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", group.color)} />
              <span className="font-medium text-slate-900">{group.label}</span>
              <span className="text-slate-500 text-sm ml-auto">
                {groupPodcasts.length}
              </span>
            </div>
            <div className="p-2 space-y-2 overflow-y-auto flex-1">
              {groupPodcasts.map((podcast) => (
                <div
                  key={podcast.id}
                  onClick={() => router.push(`/podcast/${podcast.id}`)}
                  className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                >
                  <p className="font-medium text-slate-900 truncate">
                    {podcast.showName}
                  </p>
                  <p className="text-sm text-slate-500 truncate">
                    {podcast.hostName || "Unknown host"}
                  </p>
                </div>
              ))}
              {groupPodcasts.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">
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
