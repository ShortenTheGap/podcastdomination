"use client";

// Weekly Workflow Dashboard - v1.0

import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Search,
  Shield,
  Target,
  Mail,
  CheckCircle2,
  Send,
  MessageSquare,
  TrendingUp,
  AlertCircle,
  Clock,
  ChevronRight
} from "lucide-react";

// Day configuration based on workflow guide
const WORKFLOW_DAYS = {
  0: { name: "Sunday", focus: "Rest", tasks: [], color: "gray" },
  1: {
    name: "Monday",
    focus: "Discovery & Safety",
    icon: Search,
    color: "blue",
    tasks: [
      { id: "discovery-refresh", label: "Review monthly discovery refresh (if 1st of month)", automated: false },
      { id: "safety-filter", label: "Run safety filter on new candidates", automated: true },
      { id: "remove-garbage", label: "Remove obvious garbage", automated: false },
      { id: "update-stop-rules", label: "Update stop rules for flagged shows", automated: false },
    ],
  },
  2: {
    name: "Tuesday",
    focus: "Tiering & Angles",
    icon: Target,
    color: "purple",
    tasks: [
      { id: "review-metadata", label: "Review metadata for new shows", automated: false },
      { id: "transcript-retrieval", label: "Attempt transcript retrieval", automated: true },
      { id: "ai-angle-analysis", label: "Run AI angle analysis", automated: true },
      { id: "assign-tiers", label: "Assign tiers (Tier 2 or Tier 3)", automated: true },
      { id: "tier1-addons", label: "Add Tier 1 add-ons where strong connections exist", automated: false },
    ],
  },
  3: {
    name: "Wednesday",
    focus: "Contact & Drafting",
    icon: Mail,
    color: "green",
    tasks: [
      { id: "verify-contacts", label: "Verify contact emails have source URLs", automated: false },
      { id: "ai-draft-generation", label: "Run AI draft generation for Tier 2 shows", automated: true },
      { id: "review-drafts", label: "Review and customize drafts", automated: false },
    ],
  },
  4: {
    name: "Thursday",
    focus: "QA & Sending",
    icon: CheckCircle2,
    color: "yellow",
    tasks: [
      { id: "qa-checklist", label: "Run QA checklist on all drafts", automated: true },
      { id: "approve-drafts", label: "Approve passing drafts", automated: false },
      { id: "send-emails", label: "Send approved emails (respect daily cap)", automated: true },
      { id: "log-sends", label: "Log send dates", automated: true },
    ],
  },
  5: {
    name: "Friday",
    focus: "Follow-ups & Replies",
    icon: MessageSquare,
    color: "orange",
    tasks: [
      { id: "review-replies", label: "Review reply queue", automated: false },
      { id: "handle-positive", label: "Handle positive replies → scheduling", automated: false },
      { id: "handle-negative", label: "Handle negative replies → suppression", automated: false },
      { id: "send-followups", label: "Send follow-ups for due shows", automated: true },
      { id: "escalate-backup", label: "Escalate to backup contacts if needed", automated: true },
    ],
  },
  6: { name: "Saturday", focus: "Rest", tasks: [], color: "gray" },
} as const;

type DayOfWeek = keyof typeof WORKFLOW_DAYS;

interface WorkflowMetrics {
  newShowsAdded: number;
  emailsSent: number;
  replyRate: number;
  bookings: number;
  stopRulesTriggered: number;
  pendingQA: number;
  followUpsDue: number;
  pendingReplies: number;
}

export default function WorkflowPage() {
  const today = new Date().getDay() as DayOfWeek;
  const currentDay = WORKFLOW_DAYS[today];

  // Fetch workflow metrics
  const { data: metrics, isLoading } = useQuery<WorkflowMetrics>({
    queryKey: ["workflow-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/workflow/metrics");
      if (!res.ok) throw new Error("Failed to fetch metrics");
      return res.json();
    },
    // Fallback to mock data if API doesn't exist yet
    placeholderData: {
      newShowsAdded: 0,
      emailsSent: 0,
      replyRate: 0,
      bookings: 0,
      stopRulesTriggered: 0,
      pendingQA: 0,
      followUpsDue: 0,
      pendingReplies: 0,
    },
  });

  const runAutomatedTask = async (taskId: string) => {
    try {
      const res = await fetch("/api/cron/daily-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) throw new Error("Task failed");
      // Refresh metrics
    } catch (error) {
      console.error("Failed to run task:", error);
    }
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      blue: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
      purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
      green: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
      yellow: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
      orange: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
      gray: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200" },
    };
    return colors[color] || colors.gray;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Weekly Workflow</h1>
        <p className="text-gray-600 mt-1">
          Track daily tasks and automate repetitive operations
        </p>
      </div>

      {/* Today's Focus Card */}
      <div className={`rounded-lg border-2 p-6 mb-8 ${getColorClasses(currentDay.color).bg} ${getColorClasses(currentDay.color).border}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Calendar className={`w-6 h-6 ${getColorClasses(currentDay.color).text}`} />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Today: {currentDay.name}
              </h2>
              <p className={`text-sm font-medium ${getColorClasses(currentDay.color).text}`}>
                {currentDay.focus}
              </p>
            </div>
          </div>
          {"icon" in currentDay && currentDay.icon && (
            <currentDay.icon className={`w-10 h-10 ${getColorClasses(currentDay.color).text} opacity-50`} />
          )}
        </div>

        {"tasks" in currentDay && currentDay.tasks.length > 0 ? (
          <div className="space-y-3">
            {currentDay.tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-gray-700">{task.label}</span>
                  {task.automated && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      Automated
                    </span>
                  )}
                </div>
                {task.automated && (
                  <button
                    onClick={() => runAutomatedTask(task.id)}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    Run <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-700 italic">No scheduled tasks for today</p>
        )}
      </div>

      {/* Weekly Metrics */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Weekly Metrics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard
            label="New Shows"
            value={metrics?.newShowsAdded ?? 0}
            icon={<Search className="w-4 h-4" />}
          />
          <MetricCard
            label="Emails Sent"
            value={metrics?.emailsSent ?? 0}
            icon={<Send className="w-4 h-4" />}
          />
          <MetricCard
            label="Reply Rate"
            value={`${((metrics?.replyRate ?? 0) * 100).toFixed(1)}%`}
            icon={<MessageSquare className="w-4 h-4" />}
          />
          <MetricCard
            label="Bookings"
            value={metrics?.bookings ?? 0}
            icon={<CheckCircle2 className="w-4 h-4" />}
            highlight
          />
          <MetricCard
            label="Stop Rules"
            value={metrics?.stopRulesTriggered ?? 0}
            icon={<Shield className="w-4 h-4" />}
            warning={metrics?.stopRulesTriggered ? metrics.stopRulesTriggered > 0 : false}
          />
        </div>
      </div>

      {/* Action Items */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Action Items
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ActionCard
            label="Pending QA"
            count={metrics?.pendingQA ?? 0}
            href="/drafts?status=pending"
            color="yellow"
          />
          <ActionCard
            label="Follow-ups Due"
            count={metrics?.followUpsDue ?? 0}
            href="/?status=FOLLOW_UP_DUE"
            color="orange"
          />
          <ActionCard
            label="Pending Replies"
            count={metrics?.pendingReplies ?? 0}
            href="/?status=REPLIED"
            color="green"
          />
        </div>
      </div>

      {/* Week Overview */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Week Overview
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {([1, 2, 3, 4, 5] as DayOfWeek[]).map((day) => {
            const dayConfig = WORKFLOW_DAYS[day];
            const isToday = day === today;
            const colors = getColorClasses(dayConfig.color);

            return (
              <div
                key={day}
                className={`rounded-lg border p-4 ${
                  isToday ? `${colors.bg} ${colors.border} border-2` : "bg-white border-gray-200"
                }`}
              >
                <div className="font-medium text-gray-900">{dayConfig.name}</div>
                <div className={`text-sm ${colors.text}`}>{dayConfig.focus}</div>
                {"tasks" in dayConfig && (
                  <div className="text-xs text-gray-700 mt-2">
                    {dayConfig.tasks.length} tasks
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  highlight = false,
  warning = false,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight
          ? "bg-green-50 border-green-200"
          : warning
          ? "bg-red-50 border-red-200"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center gap-2 text-gray-600 mb-1">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div
        className={`text-2xl font-bold ${
          highlight ? "text-green-700" : warning ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ActionCard({
  label,
  count,
  href,
  color,
}: {
  label: string;
  count: number;
  href: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    yellow: "bg-yellow-50 border-yellow-200 hover:bg-yellow-100",
    orange: "bg-orange-50 border-orange-200 hover:bg-orange-100",
    green: "bg-green-50 border-green-200 hover:bg-green-100",
  };

  return (
    <a
      href={href}
      className={`rounded-lg border p-4 flex items-center justify-between ${colors[color]} transition-colors`}
    >
      <div>
        <div className="text-sm text-gray-600">{label}</div>
        <div className="text-2xl font-bold text-gray-900">{count}</div>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-600" />
    </a>
  );
}
