"use client";

import { useState } from "react";
import { usePipeline, useUpdatePodcast } from "@/hooks/use-podcasts";
import { PIPELINE_STAGES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Plus,
  Mail,
  Calendar,
  MoreVertical,
  GripVertical,
} from "lucide-react";
import type { OutreachStatus } from "@/types";

export default function PipelinePage() {
  const [search, setSearch] = useState("");
  const { data: podcasts, isLoading } = usePipeline({ search });
  const updatePodcast = useUpdatePodcast();

  // Group podcasts by status
  const columns = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    items: podcasts?.filter((p) => p.status === stage.id) || [],
  }));

  const handleDragStart = (e: React.DragEvent, podcastId: string) => {
    e.dataTransfer.setData("podcastId", podcastId);
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const podcastId = e.dataTransfer.getData("podcastId");
    if (podcastId) {
      updatePodcast.mutate({
        id: podcastId,
        data: { status: newStatus as OutreachStatus },
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500">
            Track your podcast outreach progress
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Podcast
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search podcasts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column.id}
            className="flex-shrink-0 w-80"
            onDrop={(e) => handleDrop(e, column.id)}
            onDragOver={handleDragOver}
          >
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">{column.label}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {column.items.length}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                {isLoading ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading...
                  </div>
                ) : column.items.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    No podcasts
                  </div>
                ) : (
                  column.items.map((podcast) => (
                    <Card
                      key={podcast.id}
                      className="cursor-grab active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => handleDragStart(e, podcast.id)}
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <GripVertical className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <CardTitle className="text-sm font-medium flex-1">
                            {podcast.showName}
                          </CardTitle>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                          {podcast.showDescription || "No description"}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {podcast.primaryEmail && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[100px]">
                                {podcast.primaryEmail}
                              </span>
                            </div>
                          )}
                          {podcast.sentPrimaryAt && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {new Date(podcast.sentPrimaryAt).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                        {podcast.tier && podcast.tier !== "PENDING" && (
                          <Badge
                            variant={
                              podcast.tier === "TIER_1"
                                ? "default"
                                : podcast.tier === "TIER_2"
                                ? "secondary"
                                : "destructive"
                            }
                            className="mt-2 text-xs"
                          >
                            {podcast.tier.replace("_", " ")}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
