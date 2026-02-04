"""
Podcast API Wrappers
Handles API calls to Apple Podcasts, Spotify, and YouTube
"""

import os
from typing import List, Dict, Any

import aiohttp


class ApplePodcastsAPI:
    """Apple Podcasts/iTunes Search API wrapper"""

    BASE_URL = "https://itunes.apple.com/search"

    async def search(
        self,
        query: str,
        limit: int = 20,
        country: str = "us",
    ) -> List[Dict[str, Any]]:
        """
        Search Apple Podcasts

        Args:
            query: Search term
            limit: Maximum results
            country: Country code for search

        Returns:
            List of podcast results
        """
        params = {
            "term": query,
            "media": "podcast",
            "limit": limit,
            "country": country,
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(self.BASE_URL, params=params) as response:
                if response.status != 200:
                    print(f"Apple API error: {response.status}")
                    return []

                data = await response.json()
                return data.get("results", [])

    async def lookup(self, podcast_id: str) -> Dict[str, Any]:
        """
        Look up a specific podcast by ID

        Args:
            podcast_id: Apple Podcasts collection ID

        Returns:
            Podcast details
        """
        params = {
            "id": podcast_id,
            "entity": "podcast",
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://itunes.apple.com/lookup",
                params=params
            ) as response:
                if response.status != 200:
                    return {}

                data = await response.json()
                results = data.get("results", [])
                return results[0] if results else {}


class SpotifyAPI:
    """Spotify Web API wrapper for podcasts"""

    AUTH_URL = "https://accounts.spotify.com/api/token"
    API_BASE = "https://api.spotify.com/v1"

    def __init__(self):
        self.client_id = os.getenv("SPOTIFY_CLIENT_ID", "")
        self.client_secret = os.getenv("SPOTIFY_CLIENT_SECRET", "")
        self._access_token = None

    async def _get_access_token(self) -> str:
        """Get OAuth access token using client credentials flow"""
        if not self.client_id or not self.client_secret:
            raise ValueError("Spotify credentials not configured")

        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.AUTH_URL,
                data={"grant_type": "client_credentials"},
                auth=aiohttp.BasicAuth(self.client_id, self.client_secret),
            ) as response:
                if response.status != 200:
                    raise Exception(f"Spotify auth failed: {response.status}")

                data = await response.json()
                return data["access_token"]

    async def search(
        self,
        query: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Search Spotify podcasts

        Args:
            query: Search term
            limit: Maximum results

        Returns:
            List of podcast results
        """
        if not self._access_token:
            try:
                self._access_token = await self._get_access_token()
            except Exception as e:
                print(f"Spotify auth error: {e}")
                return []

        headers = {"Authorization": f"Bearer {self._access_token}"}
        params = {
            "q": query,
            "type": "show",
            "limit": limit,
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.API_BASE}/search",
                headers=headers,
                params=params,
            ) as response:
                if response.status != 200:
                    print(f"Spotify search error: {response.status}")
                    return []

                data = await response.json()
                return data.get("shows", {}).get("items", [])

    async def get_show(self, show_id: str) -> Dict[str, Any]:
        """
        Get details for a specific show

        Args:
            show_id: Spotify show ID

        Returns:
            Show details
        """
        if not self._access_token:
            self._access_token = await self._get_access_token()

        headers = {"Authorization": f"Bearer {self._access_token}"}

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.API_BASE}/shows/{show_id}",
                headers=headers,
            ) as response:
                if response.status != 200:
                    return {}

                return await response.json()


class YouTubeAPI:
    """YouTube Data API wrapper"""

    API_BASE = "https://www.googleapis.com/youtube/v3"

    def __init__(self):
        self.api_key = os.getenv("YOUTUBE_API_KEY", "")

    async def search_channels(
        self,
        query: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Search YouTube channels (for podcast channels)

        Args:
            query: Search term
            limit: Maximum results

        Returns:
            List of channel results
        """
        if not self.api_key:
            print("YouTube API key not configured")
            return []

        params = {
            "key": self.api_key,
            "part": "snippet",
            "q": query,
            "type": "channel",
            "maxResults": limit,
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.API_BASE}/search",
                params=params,
            ) as response:
                if response.status != 200:
                    print(f"YouTube search error: {response.status}")
                    return []

                data = await response.json()
                items = data.get("items", [])

                return [
                    {
                        "channelId": item["id"]["channelId"],
                        "title": item["snippet"]["title"],
                        "description": item["snippet"]["description"],
                        "thumbnails": item["snippet"]["thumbnails"],
                    }
                    for item in items
                ]

    async def get_channel(self, channel_id: str) -> Dict[str, Any]:
        """
        Get details for a specific channel

        Args:
            channel_id: YouTube channel ID

        Returns:
            Channel details with statistics
        """
        if not self.api_key:
            return {}

        params = {
            "key": self.api_key,
            "part": "snippet,statistics,contentDetails",
            "id": channel_id,
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.API_BASE}/channels",
                params=params,
            ) as response:
                if response.status != 200:
                    return {}

                data = await response.json()
                items = data.get("items", [])
                return items[0] if items else {}

    async def get_channel_videos(
        self,
        channel_id: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Get recent videos from a channel

        Args:
            channel_id: YouTube channel ID
            limit: Maximum videos to fetch

        Returns:
            List of video details
        """
        if not self.api_key:
            return []

        params = {
            "key": self.api_key,
            "part": "snippet",
            "channelId": channel_id,
            "type": "video",
            "order": "date",
            "maxResults": limit,
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.API_BASE}/search",
                params=params,
            ) as response:
                if response.status != 200:
                    return []

                data = await response.json()
                return [
                    {
                        "videoId": item["id"]["videoId"],
                        "title": item["snippet"]["title"],
                        "description": item["snippet"]["description"],
                        "publishedAt": item["snippet"]["publishedAt"],
                        "thumbnails": item["snippet"]["thumbnails"],
                    }
                    for item in data.get("items", [])
                ]
