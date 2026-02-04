"use client";

import { useState, useEffect } from "react";
import { useDiscovery, useImportPodcast, useRecommendations } from "@/hooks/use-podcasts";
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
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { Search, Plus, Loader2, ExternalLink, Check, Users, Folder, AlertCircle, X, Mic, Calendar, Tag, Sparkles, TrendingUp, Star, Trash2 } from "lucide-react";
import type { DiscoveryResult } from "@/types";

type SearchType = "seed_guest" | "category" | "best_match" | "momentum";

interface QuickCategory {
  id: string;
  name: string;
  sortOrder: number;
}

interface ResultWithStatus extends DiscoveryResult {
  imported?: boolean;
  error?: string;
  importing?: boolean;
}

export default function DiscoveryPage() {
  const [query, setQuery] = useState("");
  const [seedCategory, setSeedCategory] = useState(""); // Category for seed guest search
  const [searchType, setSearchType] = useState<SearchType>("category");
  const [results, setResults] = useState<ResultWithStatus[]>([]);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Quick categories state
  const [quickCategories, setQuickCategories] = useState<QuickCategory[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategories, setEditingCategories] = useState(false);

  const discovery = useDiscovery();
  const recommendations = useRecommendations();
  const importPodcast = useImportPodcast();

  const isRecommendationType = searchType === "best_match" || searchType === "momentum";
  const isLoading = discovery.isPending || recommendations.isPending;

  // Fetch quick categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch("/api/settings/quick-categories");
        if (res.ok) {
          const data = await res.json();
          setQuickCategories(data);
        }
      } catch (error) {
        console.error("Failed to fetch quick categories:", error);
      }
    };
    fetchCategories();
  }, []);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    setIsAddingCategory(true);
    try {
      const res = await fetch("/api/settings/quick-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategory.trim() }),
      });
      if (res.ok) {
        const category = await res.json();
        // Refetch all categories to ensure state is in sync
        const refreshRes = await fetch("/api/settings/quick-categories");
        if (refreshRes.ok) {
          const refreshedCategories = await refreshRes.json();
          setQuickCategories(refreshedCategories);
        }
        setNewCategory("");
        showNotification("success", `Added "${category.name}" to quick categories`);
      } else {
        const error = await res.json();
        showNotification("error", error.error || "Failed to add category");
      }
    } catch (error) {
      showNotification("error", "Failed to add category");
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleDeleteCategory = async (name: string) => {
    try {
      const res = await fetch(`/api/settings/quick-categories?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setQuickCategories((prev) => prev.filter((c) => c.name !== name));
        showNotification("success", `Removed "${name}" from quick categories`);
      }
    } catch (error) {
      showNotification("error", "Failed to delete category");
    }
  };

  const handleSearch = async () => {
    // All search types now use query
    if (!query.trim()) return;

    try {
      if (isRecommendationType) {
        // Parse comma-separated topics for recommendations
        const searchTerms = query.split(",").map((t) => t.trim()).filter(Boolean);
        const data = await recommendations.mutateAsync({
          type: searchType as "best_match" | "momentum",
          limit: 10,
          searchTerms,
        });
        setResults(data.results.map((r) => ({ ...r, imported: false })));
      } else if (searchType === "seed_guest") {
        // Seed guest search with optional categories (comma-separated)
        const categories = seedCategory.split(",").map((c) => c.trim()).filter(Boolean).join(", ");
        const data = await discovery.mutateAsync({
          type: "seed_guest",
          query,
          category: categories || undefined,
          limit: 20,
        });
        setResults(data.results.map((r) => ({ ...r, imported: false })));
      } else {
        // Category search
        const data = await discovery.mutateAsync({
          type: "category",
          query,
          limit: 20,
        });
        setResults(data.results.map((r) => ({ ...r, imported: false })));
      }
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
        <p className="text-sm text-gray-700">
          Find new podcasts to pitch for guest appearances
        </p>
      </div>

      {/* Search Controls */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-4">
            <Select
              value={searchType}
              onValueChange={(v: SearchType) => {
                setSearchType(v);
                setQuery(""); // Clear search box when switching types
                setSeedCategory(""); // Clear seed category when switching types
                setResults([]); // Clear results when switching types
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Search type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Manual Search</SelectLabel>
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
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Recommendations Feed</SelectLabel>
                  <SelectItem value="best_match">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      Top 10 Best Match
                    </div>
                  </SelectItem>
                  <SelectItem value="momentum">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Top 10 Momentum
                    </div>
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            {/* Seed Guest: Two inputs - guest name and categories (stacked) */}
            {searchType === "seed_guest" && (
              <div className="flex-1 min-w-[200px] space-y-2">
                <Input
                  placeholder="Guest name (e.g., Gary Vaynerchuk)..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Input
                  placeholder="Categories (e.g., fitness, health, business)..."
                  value={seedCategory}
                  onChange={(e) => setSeedCategory(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
            )}

            {/* Other search types: Single input */}
            {searchType !== "seed_guest" && (
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder={
                    searchType === "category"
                      ? "Enter category (e.g., fitness, health, business)..."
                      : searchType === "best_match"
                      ? "Enter topics (e.g., fitness, nutrition, wellness)..."
                      : "Enter topics (e.g., health, business, parenting)..."
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
            )}

            <Button
              onClick={handleSearch}
              disabled={isLoading || !query.trim()}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : isRecommendationType ? (
                <Sparkles className="h-4 w-4 mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {isRecommendationType ? "Get Recommendations" : "Search"}
            </Button>
          </div>

          {/* Quick category buttons - shown for all search types except seed_guest (which has its own) */}
          {(searchType === "category" || isRecommendationType) && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-700">Quick Topics:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingCategories(!editingCategories)}
                  className="text-xs"
                >
                  {editingCategories ? "Done" : "Edit"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickCategories.map((cat) => (
                  <div key={cat.id} className="relative group">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!editingCategories) {
                          if (isRecommendationType) {
                            // For recommendations, append to query
                            const current = query.split(",").map((t) => t.trim()).filter(Boolean);
                            if (!current.includes(cat.name)) {
                              setQuery(current.length > 0 ? `${query}, ${cat.name}` : cat.name);
                            }
                          } else {
                            setQuery(cat.name);
                          }
                        }
                      }}
                      className={editingCategories ? "pr-8" : ""}
                    >
                      {cat.name}
                    </Button>
                    {editingCategories && (
                      <button
                        onClick={() => handleDeleteCategory(cat.name)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {editingCategories && (
                  <div className="flex items-center gap-1">
                    <Input
                      placeholder="New category..."
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                      className="h-8 w-32 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddCategory}
                      disabled={isAddingCategory || !newCategory.trim()}
                      className="h-8"
                    >
                      {isAddingCategory ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
              {isRecommendationType && !editingCategories && (
                <p className="text-xs text-gray-600 mt-1">
                  Click topics to add them to your search. Separate multiple topics with commas.
                </p>
              )}
            </div>
          )}

          {/* Seed Guest: Quick categories for the category field */}
          {searchType === "seed_guest" && (
            <div className="mt-4">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 mb-3">
                <p className="text-sm text-blue-700">
                  <strong>Seed Guest Search:</strong> Enter a guest name and optionally podcast categories to find shows where similar experts have appeared.
                </p>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-700">Quick Categories:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingCategories(!editingCategories)}
                  className="text-xs"
                >
                  {editingCategories ? "Done" : "Edit"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickCategories.map((cat) => {
                  const currentCategories = seedCategory.split(",").map((c) => c.trim()).filter(Boolean);
                  const isSelected = currentCategories.includes(cat.name);
                  return (
                    <div key={cat.id} className="relative group">
                      <Button
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (!editingCategories) {
                            if (isSelected) {
                              // Remove from list
                              const updated = currentCategories.filter((c) => c !== cat.name);
                              setSeedCategory(updated.join(", "));
                            } else {
                              // Add to list
                              setSeedCategory(currentCategories.length > 0 ? `${seedCategory}, ${cat.name}` : cat.name);
                            }
                          }
                        }}
                        className={editingCategories ? "pr-8" : ""}
                      >
                        {cat.name}
                      </Button>
                      {editingCategories && (
                        <button
                          onClick={() => handleDeleteCategory(cat.name)}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {editingCategories && (
                  <div className="flex items-center gap-1">
                    <Input
                      placeholder="New category..."
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                      className="h-8 w-32 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddCategory}
                      disabled={isAddingCategory || !newCategory.trim()}
                      className="h-8"
                    >
                      {isAddingCategory ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Click categories to add/remove them. Use commas to enter multiple categories manually.
              </p>
            </div>
          )}

          {/* Best Match info */}
          {searchType === "best_match" && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <strong>Top 10 Best Match:</strong> Enter topics to search for podcasts that match your Perfect Podcast criteria.
                Results are scored based on topic alignment, audience fit, and your custom requirements.
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                Tip: Use commas to search multiple topics (e.g., "fitness, nutrition, wellness")
              </p>
            </div>
          )}

          {/* Momentum info */}
          {searchType === "momentum" && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm text-green-800">
                <strong>Top 10 Momentum:</strong> Enter topics to find rising podcasts with strong growth signals.
                Shows with recent activity and consistent publishing score higher.
              </p>
              <p className="text-xs text-green-600 mt-1">
                Tip: Use commas to search multiple topics (e.g., "health, business, parenting")
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Count */}
      {results.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            {isRecommendationType ? (
              <>
                {searchType === "best_match" ? (
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500" />
                    Top {results.length} Best Matches based on your Perfect Podcast criteria
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Top {results.length} Rising Podcasts with momentum
                  </span>
                )}
              </>
            ) : (
              `Found ${results.length} podcasts from Apple Podcasts`
            )}
          </p>
        </div>
      )}

      {/* Results */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((podcast) => (
          <Card key={podcast.dedupeKey} className="overflow-hidden">
            {/* Artwork and Header */}
            <div className="flex gap-4 p-4 pb-0">
              {podcast.artworkUrl ? (
                <img
                  src={podcast.artworkUrl}
                  alt={podcast.showName}
                  className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Mic className="h-8 w-8 text-gray-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 line-clamp-2 leading-tight">
                  {podcast.showName}
                </h3>
                {podcast.hostName && (
                  <p className="text-sm text-gray-700 mt-1 line-clamp-1">
                    {podcast.hostName}
                  </p>
                )}
                {podcast.genre && (
                  <div className="flex items-center gap-1 mt-1">
                    <Tag className="h-3 w-3 text-gray-600" />
                    <span className="text-xs text-gray-700">{podcast.genre}</span>
                  </div>
                )}
              </div>
            </div>

            <CardContent className="pt-3">
              {/* Score Badge for Recommendations */}
              {((podcast as any).matchScore !== undefined || (podcast as any).momentumScore !== undefined) && (
                <div className="flex items-center gap-2 mb-3">
                  {(podcast as any).matchScore !== undefined && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded-full">
                      <Star className="h-3.5 w-3.5 text-yellow-500" />
                      <span className="text-xs font-medium text-yellow-700">
                        Match Score: {(podcast as any).matchScore}
                      </span>
                    </div>
                  )}
                  {(podcast as any).momentumScore !== undefined && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 border border-green-200 rounded-full">
                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-xs font-medium text-green-700">
                        Momentum: {(podcast as any).momentumScore}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Metadata Row */}
              <div className="flex flex-wrap gap-2 mb-3">
                {podcast.episodeCount !== undefined && podcast.episodeCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <Mic className="h-3 w-3 mr-1" />
                    {podcast.episodeCount} episodes
                  </Badge>
                )}
                {podcast.lastReleaseDate && (
                  <Badge variant="secondary" className="text-xs">
                    <Calendar className="h-3 w-3 mr-1" />
                    {new Date(podcast.lastReleaseDate).toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </Badge>
                )}
                {podcast.contentRating === "Explicit" && (
                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                    Explicit
                  </Badge>
                )}
              </div>

              {/* Risk Signals */}
              {podcast.riskSignals.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {podcast.riskSignals.map((signal, i) => (
                    <Badge key={i} variant="destructive" className="text-xs">
                      {signal.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Recent Guests */}
              {podcast.recentGuests.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-600 mb-1">Recent guests:</p>
                  <div className="flex flex-wrap gap-1">
                    {podcast.recentGuests.slice(0, 3).map((guest, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {guest}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-xs text-gray-600">
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

              {/* Error Message */}
              {podcast.error && (
                <p className="text-xs text-red-600 mt-2">{podcast.error}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {results.length === 0 && !isLoading && (
        <div className="text-center py-12">
          {searchType === "best_match" ? (
            <>
              <Star className="h-12 w-12 mx-auto text-yellow-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Get Your Best Matches
              </h3>
              <p className="text-gray-700">
                Enter topics above and click "Get Recommendations" to find podcasts that match your criteria
              </p>
            </>
          ) : searchType === "momentum" ? (
            <>
              <TrendingUp className="h-12 w-12 mx-auto text-green-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Discover Rising Podcasts
              </h3>
              <p className="text-gray-700">
                Enter topics above and click "Get Recommendations" to find podcasts with growing momentum
              </p>
            </>
          ) : (
            <>
              <Search className="h-12 w-12 mx-auto text-gray-500 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Search for podcasts
              </h3>
              <p className="text-gray-700">
                {searchType === "seed_guest"
                  ? "Enter a seed guest name to find podcasts they've appeared on"
                  : "Enter a category or topic to find relevant podcasts"}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
