"use client";

import { useState } from "react";
import { useDiscovery, useImportPodcast } from "@/hooks/use-podcasts";
import { PODCAST_CATEGORIES, SEED_CATEGORY_CONFIG } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Loader2, ExternalLink, Check, Users, Folder, AlertCircle, X } from "lucide-react";
import type { DiscoveryResult } from "@/types";

type SearchType = "seed_guest" | "category";

interface ResultWithStatus extends DiscoveryResult {
  imported?: boolean;
  error?: string;
  importing?: boolean;
}

export default function DiscoveryPage() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("category");
  const [results, setResults] = useState<ResultWithStatus[]>([]);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const discovery = useDiscovery();
  const importPodcast = useImportPodcast();

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSearch = async () => {
    if (!query) return;

    try {
      const data = await discovery.mutateAsync({
        type: searchType,
        query,
        limit: 20,
      });

      setResults(data.results.map((r) => ({ ...r, imported: false })));
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Search failed");
    }
  };

  const handleImport = async (podcast: DiscoveryResult) => {
    // Mark as importing
    setResults((prev) =>
      prev.map((p) =>
        p.dedupeKey === podcast.dedupeKey ? { ...p, importing: true, error: undefined } : p
      )
    );

    try {
      await importPodcast.mutateAsync(podcast);
      setResults((prev) =>
        prev.map((p) =>
          p.dedupeKey === podcast.dedupeKey ? { ...p, imported: true, importing: false } : p
        )
      );
      showNotification("success", `Added "${podcast.showName}" to pipeline`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to add podcast";
      setResults((prev) =>
        prev.map((p) =>
          p.dedupeKey === podcast.dedupeKey ? { ...p, error: errorMessage, importing: false } : p
        )
      );
      showNotification("error", errorMessage);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
            notification.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {notification.type === "success" ? (
            <Check className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span className="text-sm">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 hover:opacity-70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Discovery</h1>
        <p className="text-sm text-gray-500">
          Find new podcasts to pitch for guest appearances
        </p>
      </div>

      {/* Search Controls */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-4">
            <Select
              value={searchType}
              onValueChange={(v: SearchType) => setSearchType(v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Search type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seed_guest">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Seed Guest Search
                  </div>
                </SelectItem>
                <SelectItem value="category">
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4" />
                    Category Search
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder={
                  searchType === "seed_guest"
                    ? "Enter seed guest name (e.g., Gary Vaynerchuk)..."
                    : "Enter category (e.g., fitness, health, business)..."
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>

            <Button onClick={handleSearch} disabled={discovery.isPending || !query}>
              {discovery.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </Button>
          </div>

          {/* Quick category buttons */}
          {searchType === "category" && (
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-sm text-gray-500 mr-2">Quick:</span>
              {PODCAST_CATEGORIES.slice(0, 5).map((cat) => (
                <Button
                  key={cat}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery(cat);
                    setSearchType("category");
                  }}
                >
                  {cat}
                </Button>
              ))}
            </div>
          )}

          {/* Seed category info */}
          {searchType === "seed_guest" && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Seed Guest Search:</strong> Find podcasts where a specific guest has appeared.
                This helps discover shows that interview similar experts.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {SEED_CATEGORY_CONFIG.map((cat) => (
                  <Badge key={cat.id} variant="secondary" className="text-xs">
                    {cat.label}: up to {cat.limit} guests
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((podcast) => (
          <Card key={podcast.dedupeKey}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base line-clamp-1">
                  {podcast.showName}
                </CardTitle>
                {podcast.riskSignals.length > 0 && (
                  <Badge variant="destructive" className="text-xs flex-shrink-0">
                    {podcast.riskSignals.length} risk
                  </Badge>
                )}
              </div>
              {podcast.hostName && (
                <p className="text-sm text-gray-500">{podcast.hostName}</p>
              )}
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 line-clamp-3 mb-4">
                {podcast.showDescription || "No description available"}
              </p>

              {podcast.recentGuests.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1">Recent guests:</p>
                  <div className="flex flex-wrap gap-1">
                    {podcast.recentGuests.slice(0, 3).map((guest, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {guest}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {podcast.discoverySource}
                </span>

                <div className="flex gap-2">
                  {podcast.applePodcastUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={podcast.applePodcastUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={podcast.imported || podcast.importing}
                    variant={podcast.error ? "destructive" : "default"}
                    onClick={() => handleImport(podcast)}
                  >
                    {podcast.importing ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Adding...
                      </>
                    ) : podcast.imported ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Added
                      </>
                    ) : podcast.error ? (
                      <>
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Retry
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {results.length === 0 && !discovery.isPending && (
        <div className="text-center py-12">
          <Search className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Search for podcasts
          </h3>
          <p className="text-gray-500">
            {searchType === "seed_guest"
              ? "Enter a seed guest name to find podcasts they've appeared on"
              : "Enter a category or topic to find relevant podcasts"}
          </p>
        </div>
      )}
    </div>
  );
}
