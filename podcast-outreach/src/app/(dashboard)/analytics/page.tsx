"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Mail,
  MessageSquare,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

export default function AnalyticsPage() {
  const { data: stats } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      // Mock data for now - replace with actual API call
      return {
        sent: 45,
        opened: 32,
        replied: 12,
        booked: 5,
        openRate: 71.1,
        replyRate: 26.7,
        bookingRate: 11.1,
        previousOpenRate: 65.0,
        previousReplyRate: 28.0,
        previousBookingRate: 10.0,
        weeklyData: [
          { week: "Week 1", sent: 10, replied: 2, booked: 1 },
          { week: "Week 2", sent: 12, replied: 4, booked: 1 },
          { week: "Week 3", sent: 8, replied: 2, booked: 1 },
          { week: "Week 4", sent: 15, replied: 4, booked: 2 },
        ],
        topPerformers: [
          { name: "Tech Talks Daily", status: "booked" },
          { name: "Startup Stories", status: "replied" },
          { name: "Business Insights", status: "replied" },
        ],
        recentActivity: [
          { podcast: "AI Frontiers", action: "Sent", date: "2 hours ago" },
          { podcast: "Growth Masters", action: "Replied", date: "5 hours ago" },
          { podcast: "Scale Up Show", action: "Opened", date: "1 day ago" },
        ],
      };
    },
  });

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (current < previous) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-700">
          Track your outreach performance and conversion rates
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">
              Emails Sent
            </CardTitle>
            <Send className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.sent || 0}</div>
            <p className="text-xs text-gray-700">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">
              Open Rate
            </CardTitle>
            <Mail className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{stats?.openRate || 0}%</div>
              {stats && getTrendIcon(stats.openRate, stats.previousOpenRate)}
            </div>
            <p className="text-xs text-gray-700">
              {stats?.opened || 0} of {stats?.sent || 0} opened
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">
              Reply Rate
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{stats?.replyRate || 0}%</div>
              {stats && getTrendIcon(stats.replyRate, stats.previousReplyRate)}
            </div>
            <p className="text-xs text-gray-700">
              {stats?.replied || 0} replies received
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-700">
              Bookings
            </CardTitle>
            <Calendar className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{stats?.booked || 0}</div>
              {stats && getTrendIcon(stats.bookingRate, stats.previousBookingRate)}
            </div>
            <p className="text-xs text-gray-700">
              {stats?.bookingRate || 0}% conversion rate
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Weekly Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.weeklyData.map((week) => (
                <div key={week.week} className="flex items-center gap-4">
                  <div className="w-20 text-sm text-gray-700">{week.week}</div>
                  <div className="flex-1">
                    <div className="flex gap-1 h-6">
                      <div
                        className="bg-gray-200 rounded"
                        style={{ width: `${(week.sent / 20) * 100}%` }}
                        title={`${week.sent} sent`}
                      />
                      <div
                        className="bg-blue-500 rounded"
                        style={{ width: `${(week.replied / 20) * 100}%` }}
                        title={`${week.replied} replied`}
                      />
                      <div
                        className="bg-green-500 rounded"
                        style={{ width: `${(week.booked / 20) * 100}%` }}
                        title={`${week.booked} booked`}
                      />
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 w-24 text-right">
                    {week.sent} sent
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-200 rounded" />
                <span>Sent</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded" />
                <span>Replied</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded" />
                <span>Booked</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Performers & Recent Activity */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Performers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats?.topPerformers.map((podcast, i) => (
                  <div
                    key={podcast.name}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-600">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium">{podcast.name}</span>
                    </div>
                    <Badge
                      variant={podcast.status === "booked" ? "success" : "info"}
                    >
                      {podcast.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats?.recentActivity.map((activity, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <div>
                      <span className="font-medium">{activity.podcast}</span>
                      <span className="text-gray-700"> - {activity.action}</span>
                    </div>
                    <span className="text-gray-600">{activity.date}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
