#!/usr/bin/env python3
"""
Podcast Discovery Engine
Discovers podcasts from multiple sources: Apple Podcasts, Spotify, YouTube
"""

import asyncio
import json
from dataclasses import dataclass
from typing import List, Optional

import aiohttp

from utils.podcast_apis import ApplePodcastsAPI, SpotifyAPI, YouTubeAPI


@dataclass
class DiscoveredPodcast:
    """Represents a discovered podcast"""
    name: str
    description: str
    source: str
    source_id: str
    website: Optional[str] = None
    rss_feed: Optional[str] = None
    category: Optional[str] = None
    episode_count: int = 0
    rating: Optional[float] = None
    image_url: Optional[str] = None


class PodcastDiscoveryEngine:
    """Main discovery engine that aggregates results from multiple sources"""

    def __init__(self):
        self.apple_api = ApplePodcastsAPI()
        self.spotify_api = SpotifyAPI()
        self.youtube_api = YouTubeAPI()

    async def search(
        self,
        query: str,
        sources: List[str] = None,
        category: str = None,
        limit: int = 20,
    ) -> List[DiscoveredPodcast]:
        """
        Search for podcasts across multiple sources

        Args:
            query: Search term
            sources: List of sources to search (apple, spotify, youtube)
            category: Filter by category
            limit: Maximum results per source

        Returns:
            List of discovered podcasts
        """
        if sources is None:
            sources = ["apple", "spotify", "youtube"]

        tasks = []

        if "apple" in sources:
            tasks.append(self._search_apple(query, limit))
        if "spotify" in sources:
            tasks.append(self._search_spotify(query, limit))
        if "youtube" in sources:
            tasks.append(self._search_youtube(query, limit))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        podcasts = []
        for result in results:
            if isinstance(result, Exception):
                print(f"Search error: {result}")
                continue
            podcasts.extend(result)

        # Filter by category if specified
        if category:
            podcasts = [p for p in podcasts if p.category and category.lower() in p.category.lower()]

        return podcasts

    async def _search_apple(self, query: str, limit: int) -> List[DiscoveredPodcast]:
        """Search Apple Podcasts"""
        results = await self.apple_api.search(query, limit)
        return [
            DiscoveredPodcast(
                name=r.get("collectionName", ""),
                description=r.get("description", ""),
                source="apple",
                source_id=str(r.get("collectionId", "")),
                website=r.get("collectionViewUrl"),
                rss_feed=r.get("feedUrl"),
                category=r.get("primaryGenreName"),
                episode_count=r.get("trackCount", 0),
                image_url=r.get("artworkUrl600"),
            )
            for r in results
        ]

    async def _search_spotify(self, query: str, limit: int) -> List[DiscoveredPodcast]:
        """Search Spotify Podcasts"""
        results = await self.spotify_api.search(query, limit)
        return [
            DiscoveredPodcast(
                name=r.get("name", ""),
                description=r.get("description", ""),
                source="spotify",
                source_id=r.get("id", ""),
                website=r.get("external_urls", {}).get("spotify"),
                category=None,  # Spotify doesn't provide categories in search
                episode_count=r.get("total_episodes", 0),
                image_url=r.get("images", [{}])[0].get("url") if r.get("images") else None,
            )
            for r in results
        ]

    async def _search_youtube(self, query: str, limit: int) -> List[DiscoveredPodcast]:
        """Search YouTube for podcast channels"""
        results = await self.youtube_api.search_channels(f"{query} podcast", limit)
        return [
            DiscoveredPodcast(
                name=r.get("title", ""),
                description=r.get("description", ""),
                source="youtube",
                source_id=r.get("channelId", ""),
                website=f"https://youtube.com/channel/{r.get('channelId', '')}",
                episode_count=r.get("videoCount", 0),
                image_url=r.get("thumbnails", {}).get("high", {}).get("url"),
            )
            for r in results
        ]

    async def discover_by_category(
        self,
        category: str,
        min_episodes: int = 10,
        limit: int = 50,
    ) -> List[DiscoveredPodcast]:
        """
        Discover podcasts by category with quality filters

        Args:
            category: Podcast category to search
            min_episodes: Minimum episode count
            limit: Maximum results

        Returns:
            List of quality podcasts in the category
        """
        podcasts = await self.search(category, limit=limit * 2)

        # Filter by episode count
        quality_podcasts = [
            p for p in podcasts
            if p.episode_count >= min_episodes
        ]

        # Sort by episode count (proxy for established shows)
        quality_podcasts.sort(key=lambda p: p.episode_count, reverse=True)

        return quality_podcasts[:limit]


async def main():
    """CLI entry point for testing"""
    import argparse

    parser = argparse.ArgumentParser(description="Discover podcasts")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--sources", nargs="+", default=["apple", "spotify", "youtube"])
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--output", "-o", help="Output JSON file")

    args = parser.parse_args()

    engine = PodcastDiscoveryEngine()
    results = await engine.search(args.query, args.sources, limit=args.limit)

    output = [
        {
            "name": p.name,
            "description": p.description,
            "source": p.source,
            "source_id": p.source_id,
            "website": p.website,
            "rss_feed": p.rss_feed,
            "category": p.category,
            "episode_count": p.episode_count,
        }
        for p in results
    ]

    if args.output:
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2)
        print(f"Saved {len(output)} results to {args.output}")
    else:
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
