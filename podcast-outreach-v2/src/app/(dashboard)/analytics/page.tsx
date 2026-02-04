"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/analytics/export-button";
import {
  Send,
  Mail,
  MessageSquare,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Globe,
  Rss,
  Search,
  Database,
  AlertCircle,
  Eye,
  MousePointer,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OutreachPodcast {
  id: string;
  showName: string;
  hostName: string | null;
  primaryEmail: string | null;
  tier: string;
  status: string;
  responseType: string | null;
  emailSequence: EmailInSequence[];
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
}

interface EmailInSequence {
  id: string;
  type: string;
  subject: string;
  body: string;
  status: "draft" | "scheduled" | "sent" | "opened" | "replied";
  sentAt: string | null;
  scheduledFor: string | null;
  openedAt: string | null;
  repliedAt: string | null;
}

interface AnalyticsStats {
  sent: number;
  opened: number;
  replied: number;
  booked: number;
  openRate: number;
  replyRate: number;
  bookingRate: number;
  weeklyData: { week: string; sent: number; replied: number; booked: number }[];
  topPerformers: { name: string; status: string }[];
  recentActivity: { podcast: string; action: string; date: string }[];
}

function calculateAnalytics(campaigns: OutreachPodcast[]): AnalyticsStats {
  // Calculate email stats from all campaigns
  let totalSent = 0;
  let totalOpened = 0;
  let totalReplied = 0;
  let totalBooked = 0;

  const recentActivity: { podcast: string; action: string; date: string; timestamp: number }[] = [];
  const performerMap = new Map<string, { name: string; status: string; priority: number }>();

  // Get current date for weekly calculations
  const now = new Date();
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  // Initialize weekly data
  const weeklyData: { week: string; sent: number; replied: number; booked: number; startDate: Date }[] = [];
  for (let i = 0; i < 4; i++) {
    const weekStart = new Date(fourWeeksAgo);
    weekStart.setDate(weekStart.getDate() + (i * 7));
    weeklyData.push({
      week: `Week ${i + 1}`,
      sent: 0,
      replied: 0,
      booked: 0,
      startDate: weekStart,
    });
  }

  campaigns.forEach((campaign) => {
    // Check if campaign is booked
    if (campaign.status === "booked" || campaign.responseType === "booked") {
      totalBooked++;
      performerMap.set(campaign.id, {
        name: campaign.showName,
        status: "booked",
        priority: 3,
      });
    }

    // Process email sequence
    campaign.emailSequence?.forEach((email) => {
      if (email.status === "sent" || email.status === "opened" || email.status === "replied") {
        totalSent++;

        // Add to recent activity
        if (email.sentAt) {
          const sentDate = new Date(email.sentAt);
          recentActivity.push({
            podcast: campaign.showName,
            action: "Sent",
            date: email.sentAt,
            timestamp: sentDate.getTime(),
          });

          // Add to weekly data
          const weekIndex = weeklyData.findIndex((w, idx) => {
            const weekEnd = new Date(w.startDate);
            weekEnd.setDate(weekEnd.getDate() + 7);
            return sentDate >= w.startDate && sentDate < weekEnd;
          });
          if (weekIndex >= 0) {
            weeklyData[weekIndex].sent++;
          }
        }
      }

      if (email.status === "opened" || email.status === "replied") {
        totalOpened++;
        if (email.openedAt) {
          recentActivity.push({
            podcast: campaign.showName,
            action: "Opened",
            date: email.openedAt,
            timestamp: new Date(email.openedAt).getTime(),
          });
        }
      }

      if (email.status === "replied") {
        totalReplied++;
        if (email.repliedAt) {
          const repliedDate = new Date(email.repliedAt);
          recentActivity.push({
            podcast: campaign.showName,
            action: "Replied",
            date: email.repliedAt,
            timestamp: repliedDate.getTime(),
          });

          // Add to weekly data
          const weekIndex = weeklyData.findIndex((w) => {
            const weekEnd = new Date(w.startDate);
            weekEnd.setDate(weekEnd.getDate() + 7);
            return repliedDate >= w.startDate && repliedDate < weekEnd;
          });
          if (weekIndex >= 0) {
            weeklyData[weekIndex].replied++;
          }
        }

        // Track replied campaigns as performers if not already booked
        if (!performerMap.has(campaign.id) || performerMap.get(campaign.id)!.priority < 2) {
          performerMap.set(campaign.id, {
            name: campaign.showName,
            status: "replied",
            priority: 2,
          });
        }
      }
    });

    // Track booked in weekly data based on status change
    if (campaign.status === "booked" && campaign.lastContactedAt) {
      const bookedDate = new Date(campaign.lastContactedAt);
      const weekIndex = weeklyData.findIndex((w) => {
        const weekEnd = new Date(w.startDate);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return bookedDate >= w.startDate && bookedDate < weekEnd;
      });
      if (weekIndex >= 0) {
        weeklyData[weekIndex].booked++;
      }
    }
  });

  // Calculate rates
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 1000) / 10 : 0;
  const replyRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 1000) / 10 : 0;
  const bookingRate = totalSent > 0 ? Math.round((totalBooked / totalSent) * 1000) / 10 : 0;

  // Sort and format recent activity
  const sortedActivity = recentActivity
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)
    .map((a) => ({
      podcast: a.podcast,
      action: a.action,
      date: formatRelativeTime(a.date),
    }));

  // Get top performers
  const topPerformers = Array.from(performerMap.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map(({ name, status }) => ({ name, status }));

  return {
    sent: totalSent,
    opened: totalOpened,
    replied: totalReplied,
    booked: totalBooked,
    openRate,
    replyRate,
    bookingRate,
    weeklyData: weeklyData.map(({ week, sent, replied, booked }) => ({ week, sent, replied, booked })),
    topPerformers,
    recentActivity: sortedActivity,
  };
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

// Interface for tracking stats from database
interface TrackingStats {
  summary: {
    totalSent: number;
    totalOpened: number;
    totalReplied: number;
    totalBounced: number;
    openRate: number;
    replyRate: number;
    bounceRate: number;
  };
  weeklyData: Array<{
    week: string;
    sent: number;
    opened: number;
    replied: number;
    bounced: number;
    openRate: number;
    replyRate: number;
  }>;
  sourceAnalysis: {
    bySource: Array<{ source: string; count: number; percentage: number }>;
    totalWithEmail: number;
    totalWithoutEmail: number;
  };
  recentEvents: Array<{
    podcastId: string;
    podcastName: string;
    type: "opened" | "replied" | "bounced";
    eventAt: string;
  }>;
}

// Get icon and color for email source
function getSourceIcon(source: string) {
  switch (source) {
    case "Website Contact Page":
    case "Website Scrape":
      return { icon: Globe, color: "text-blue-600", bgColor: "bg-blue-100" };
    case "RSS Feed":
      return { icon: Rss, color: "text-orange-600", bgColor: "bg-orange-100" };
    case "Hunter.io":
      return { icon: Search, color: "text-purple-600", bgColor: "bg-purple-100" };
    case "Apple Podcasts":
      return { icon: Database, color: "text-pink-600", bgColor: "bg-pink-100" };
    case "Personal Email":
      return { icon: Mail, color: "text-green-600", bgColor: "bg-green-100" };
    default:
      return { icon: Mail, color: "text-slate-600", bgColor: "bg-slate-100" };
  }
}

export default function AnalyticsPage() {
  // Fetch real campaign data
  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ["outreach-campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/outreach/campaigns");
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  // Fetch database tracking stats
  const { data: trackingData, isLoading: isLoadingTracking } = useQuery<TrackingStats>({
    queryKey: ["tracking-stats"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/tracking?days=90");
      if (!res.ok) throw new Error("Failed to fetch tracking stats");
      return res.json();
    },
  });

  // Calculate stats from real data
  const stats = campaignsData?.campaigns
    ? calculateAnalytics(campaignsData.campaigns)
    : null;

  // Find max for scaling weekly chart
  const maxWeekly = stats
    ? Math.max(...stats.weeklyData.map((w) => w.sent + w.replied + w.booked), 1)
    : 1;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[#0a9396]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#02121a]">Analytics</h1>
          <p className="text-sm text-[#006073]">
            Track your outreach performance and conversion rates
          </p>
        </div>
        <ExportButton />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#006073]">
              Emails Sent
            </CardTitle>
            <Send className="h-4 w-4 text-[#0a9396]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#02121a]">{stats?.sent || 0}</div>
            <p className="text-xs text-[#006073]">Total sent emails</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#006073]">
              Open Rate
            </CardTitle>
            <Mail className="h-4 w-4 text-[#0a9396]" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-[#02121a]">{stats?.openRate || 0}%</div>
              {stats && stats.openRate > 50 && <TrendingUp className="h-4 w-4 text-[#0a9396]" />}
            </div>
            <p className="text-xs text-[#006073]">
              {stats?.opened || 0} of {stats?.sent || 0} opened
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#006073]">
              Reply Rate
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-[#0a9396]" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-[#02121a]">{stats?.replyRate || 0}%</div>
              {stats && stats.replyRate > 20 && <TrendingUp className="h-4 w-4 text-[#0a9396]" />}
            </div>
            <p className="text-xs text-[#006073]">
              {stats?.replied || 0} replies received
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[#006073]">
              Bookings
            </CardTitle>
            <Calendar className="h-4 w-4 text-[#0a9396]" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-[#02121a]">{stats?.booked || 0}</div>
              {stats && stats.booked > 0 && <TrendingUp className="h-4 w-4 text-[#0a9396]" />}
            </div>
            <p className="text-xs text-[#006073]">
              {stats?.bookingRate || 0}% conversion rate
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[#02121a]">Weekly Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.weeklyData && stats.weeklyData.some(w => w.sent > 0) ? (
              <>
                <div className="space-y-4">
                  {stats.weeklyData.map((week) => (
                    <div key={week.week} className="flex items-center gap-4">
                      <div className="w-20 text-sm text-[#006073]">{week.week}</div>
                      <div className="flex-1">
                        <div className="flex gap-1 h-6">
                          <div
                            className="bg-[#ead7a5] rounded"
                            style={{ width: `${(week.sent / maxWeekly) * 100}%` }}
                            title={`${week.sent} sent`}
                          />
                          <div
                            className="bg-[#0a9396] rounded"
                            style={{ width: `${(week.replied / maxWeekly) * 100}%` }}
                            title={`${week.replied} replied`}
                          />
                          <div
                            className="bg-[#94d2bd] rounded"
                            style={{ width: `${(week.booked / maxWeekly) * 100}%` }}
                            title={`${week.booked} booked`}
                          />
                        </div>
                      </div>
                      <div className="text-sm text-[#006073] w-24 text-right">
                        {week.sent} sent
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-4 mt-4 text-xs text-[#006073]">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-[#ead7a5] rounded" />
                    <span>Sent</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-[#0a9396] rounded" />
                    <span>Replied</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-[#94d2bd] rounded" />
                    <span>Booked</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-[#006073]">
                <p>No email activity yet</p>
                <p className="text-sm mt-1">Start sending emails to see weekly performance</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Performers & Recent Activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-[#02121a]">Top Performers</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.topPerformers && stats.topPerformers.length > 0 ? (
                <div className="space-y-3">
                  {stats.topPerformers.map((podcast, i) => (
                    <div
                      key={podcast.name}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-[#006073]">
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-[#02121a]">{podcast.name}</span>
                      </div>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          podcast.status === "booked"
                            ? "bg-[#94d2bd] text-[#02121a]"
                            : "bg-[#0a9396]/20 text-[#006073]"
                        )}
                      >
                        {podcast.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-[#006073]">
                  <p>No responses yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-[#02121a]">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {stats.recentActivity.map((activity, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm"
                    >
                      <div>
                        <span className="font-medium text-[#02121a]">{activity.podcast}</span>
                        <span className="text-[#006073]"> - {activity.action}</span>
                      </div>
                      <span className="text-[#006073]">{activity.date}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-[#006073]">
                  <p>No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Email Source & Tracking Section */}
      <div className="mt-8 pt-6 border-t border-[#94d2bd]">
        <h2 className="text-xl font-bold text-[#02121a] mb-4">Email Discovery & Tracking</h2>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Email Source Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-[#02121a] flex items-center gap-2">
                <Search className="h-5 w-5 text-[#0a9396]" />
                Email Source Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingTracking ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0a9396]" />
                </div>
              ) : trackingData?.sourceAnalysis?.bySource && trackingData.sourceAnalysis.bySource.length > 0 ? (
                <div className="space-y-4">
                  {/* Stats summary */}
                  <div className="flex gap-4 text-sm mb-4">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-[#02121a]">{trackingData.sourceAnalysis.totalWithEmail}</span>
                      <span className="text-[#006073]">with email</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-[#9d2227]">{trackingData.sourceAnalysis.totalWithoutEmail}</span>
                      <span className="text-[#006073]">without email</span>
                    </div>
                  </div>

                  {/* Source bars */}
                  <div className="space-y-3">
                    {trackingData.sourceAnalysis.bySource.map((source) => {
                      const { icon: Icon, color, bgColor } = getSourceIcon(source.source);
                      return (
                        <div key={source.source} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className={cn("p-1 rounded", bgColor)}>
                                <Icon className={cn("h-3 w-3", color)} />
                              </div>
                              <span className="text-[#02121a] font-medium">{source.source}</span>
                            </div>
                            <div className="text-[#006073]">
                              {source.count} ({source.percentage}%)
                            </div>
                          </div>
                          <div className="h-2 bg-[#ead7a5]/50 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", bgColor)}
                              style={{ width: `${source.percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs text-[#006073] mt-4">
                    Shows how emails were discovered across your podcast contacts
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-[#006073]">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No email source data yet</p>
                  <p className="text-sm mt-1">Start finding emails to see breakdown</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Database Tracking Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-[#02121a] flex items-center gap-2">
                <Eye className="h-5 w-5 text-[#0a9396]" />
                Email Tracking (Database)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingTracking ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0a9396]" />
                </div>
              ) : trackingData?.summary ? (
                <div className="space-y-4">
                  {/* Tracking stats grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-[#94d2bd]/20 rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Eye className="h-4 w-4 text-[#0a9396]" />
                      </div>
                      <div className="text-xl font-bold text-[#02121a]">{trackingData.summary.openRate}%</div>
                      <div className="text-xs text-[#006073]">Open Rate</div>
                    </div>
                    <div className="text-center p-3 bg-[#0a9396]/10 rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <MessageSquare className="h-4 w-4 text-[#0a9396]" />
                      </div>
                      <div className="text-xl font-bold text-[#02121a]">{trackingData.summary.replyRate}%</div>
                      <div className="text-xs text-[#006073]">Reply Rate</div>
                    </div>
                    <div className="text-center p-3 bg-[#9d2227]/10 rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <XCircle className="h-4 w-4 text-[#9d2227]" />
                      </div>
                      <div className="text-xl font-bold text-[#02121a]">{trackingData.summary.bounceRate}%</div>
                      <div className="text-xs text-[#006073]">Bounce Rate</div>
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="flex justify-between text-sm border-t border-[#94d2bd]/50 pt-3">
                    <span className="text-[#006073]">Total Sent</span>
                    <span className="font-medium text-[#02121a]">{trackingData.summary.totalSent}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#006073]">Total Opened</span>
                    <span className="font-medium text-[#0a9396]">{trackingData.summary.totalOpened}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#006073]">Total Replied</span>
                    <span className="font-medium text-[#006073]">{trackingData.summary.totalReplied}</span>
                  </div>

                  {/* Recent tracking events */}
                  {trackingData.recentEvents && trackingData.recentEvents.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[#94d2bd]/50">
                      <h4 className="text-sm font-medium text-[#02121a] mb-2">Recent Events</h4>
                      <div className="space-y-2">
                        {trackingData.recentEvents.slice(0, 5).map((event, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              {event.type === "opened" && <Eye className="h-3 w-3 text-[#0a9396]" />}
                              {event.type === "replied" && <MessageSquare className="h-3 w-3 text-[#006073]" />}
                              {event.type === "bounced" && <XCircle className="h-3 w-3 text-[#9d2227]" />}
                              <span className="text-[#02121a] truncate max-w-[150px]">{event.podcastName}</span>
                            </div>
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-medium",
                              event.type === "opened" && "bg-[#0a9396]/10 text-[#0a9396]",
                              event.type === "replied" && "bg-[#006073]/10 text-[#006073]",
                              event.type === "bounced" && "bg-[#9d2227]/10 text-[#9d2227]"
                            )}>
                              {event.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-[#006073]">
                  <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No tracking data yet</p>
                  <p className="text-sm mt-1">Email opens and clicks will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tracking how-it-works info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-[#02121a] flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-[#cb6701]" />
              How Email Tracking Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 bg-[#ead7a5]/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-5 w-5 text-[#0a9396]" />
                  <span className="font-medium text-[#02121a]">Open Tracking</span>
                </div>
                <p className="text-sm text-[#006073]">
                  A tiny invisible pixel image is embedded in each email. When loaded, it records the open event.
                </p>
              </div>
              <div className="p-4 bg-[#0a9396]/10 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <MousePointer className="h-5 w-5 text-[#0a9396]" />
                  <span className="font-medium text-[#02121a]">Click Tracking</span>
                </div>
                <p className="text-sm text-[#006073]">
                  Links in your emails are wrapped with tracking redirects that record clicks before sending recipients to the destination.
                </p>
              </div>
              <div className="p-4 bg-[#94d2bd]/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-5 w-5 text-[#006073]" />
                  <span className="font-medium text-[#02121a]">Reply Detection</span>
                </div>
                <p className="text-sm text-[#006073]">
                  Gmail webhook integration monitors your inbox for replies to outreach emails and updates status automatically.
                </p>
              </div>
            </div>
            <p className="text-xs text-[#006073] mt-4">
              Note: Some email clients block tracking pixels. Open rates may be underreported. Reply tracking is the most reliable metric.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
