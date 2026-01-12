"use client";

import { useState } from "react";
import { useDiscovery, useImportPodcast } from "@/hooks/use-podcasts";
import { PODCAST_CATEGORIES, DISCOVERY_SOURCES } from "@/lib/constants";
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
import { Search, Plus, Loader2, ExternalLink, Check } from "lucide-react";

export default function DiscoveryPage() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"apple" | "spotify" | "youtube">("apple");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState<Array<{
    id: string;
    name: string;
    description: string;
    episodeCount: number;
    source: string;
    sourceId: string;
    imported?: boolean;
  }>>([]);

  const discovery = useDiscovery();
  const importPodcast = useImportPodcast();

  const handleSearch = async () => {
    if (!query && !category) return;

    const data = await discovery.mutateAsync({
      source,
      query,
      category,
      limit: 20,
    });

    setResults(data.map((r) => ({ ...r, imported: false })));
  };

  const handleImport = async (podcast: (typeof results)[0]) => {
    await importPodcast.mutateAsync(podcast);
    setResults((prev) =>
      prev.map((p) => (p.id === podcast.id ? { ...p, imported: true } : p))
    );
  };

  return (
    <div className="space-y-6">
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
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search podcasts..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>

            <Select value={source} onValueChange={(v: typeof source) => setSource(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {DISCOVERY_SOURCES.filter((s) => s.id !== "manual" && s.id !== "import").map(
                  (s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>

            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Categories</SelectItem>
                {PODCAST_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={handleSearch} disabled={discovery.isPending}>
              {discovery.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((podcast) => (
          <Card key={podcast.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base line-clamp-1">
                  {podcast.name}
                </CardTitle>
                <Badge variant="secondary" className="text-xs flex-shrink-0">
                  {podcast.source}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 line-clamp-3 mb-4">
                {podcast.description || "No description available"}
              </p>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {podcast.episodeCount} episodes
                </span>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`https://${podcast.source}.com`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    disabled={podcast.imported || importPodcast.isPending}
                    onClick={() => handleImport(podcast)}
                  >
                    {podcast.imported ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Added
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
            Enter a search term or select a category to find podcasts
          </p>
        </div>
      )}
    </div>
  );
}
