"""
Podcast Discovery Engine
Finds podcasts based on seed guests or category searches.
Outputs structured data ready for database import.
"""

import asyncio
import aiohttp
import json
import re
import hashlib
from dataclasses import dataclass, asdict
from typing import Optional, List
from datetime import datetime
from bs4 import BeautifulSoup
from urllib.parse import urlparse, quote_plus
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class PodcastDiscoveryResult:
    """Structured output from discovery"""
    show_name: str
    host_name: Optional[str]
    primary_platform_url: str
    website_url: Optional[str]
    apple_podcast_url: Optional[str]
    spotify_url: Optional[str]
    show_description: Optional[str]
    recent_episode_titles: List[str]
    recent_guests: List[str]
    primary_email: Optional[str]
    primary_email_source_url: Optional[str]
    backup_email: Optional[str]
    backup_email_source_url: Optional[str]
    discovery_source: str  # e.g., "seed:Gary Vaynerchuk" or "category:fitness"
    risk_signals: List[str]  # Any detected stop rule triggers
    dedupe_key: str

    def to_dict(self):
        return asdict(self)


class PodcastDiscoveryEngine:
    """
    Multi-source podcast discovery.

    Sources:
    1. Listen Notes API (if available) - Best for guest appearance searches
    2. Apple Podcasts Search - Good general search
    3. Podcast Index API - Open source alternative
    4. Google Search scraping - Fallback
    """

    def __init__(
        self,
        listen_notes_api_key: Optional[str] = None,
        podcast_index_key: Optional[str] = None,
        podcast_index_secret: Optional[str] = None,
    ):
        self.listen_notes_key = listen_notes_api_key
        self.podcast_index_key = podcast_index_key
        self.podcast_index_secret = podcast_index_secret
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession(
            headers={"User-Agent": "PodcastOutreach/1.0"}
        )
        return self

    async def __aexit__(self, *args):
        if self.session:
            await self.session.close()

    def _generate_dedupe_key(self, url: str, show_name: str) -> str:
        """Generate unique identifier for deduplication"""
        parsed = urlparse(url)

        # Apple Podcasts ID extraction
        apple_match = re.search(r'/id(\d+)', url)
        if apple_match:
            return f"apple:{apple_match.group(1)}"

        # Spotify ID extraction
        spotify_match = re.search(r'/show/([a-zA-Z0-9]+)', url)
        if spotify_match:
            return f"spotify:{spotify_match.group(1)}"

        # Website-based key
        if parsed.netloc:
            normalized_name = re.sub(r'[^a-z0-9]', '', show_name.lower())
            return f"web:{parsed.netloc}|{normalized_name}"

        # Fallback hash
        return f"hash:{hashlib.md5(f'{url}{show_name}'.encode()).hexdigest()[:12]}"

    def _detect_risk_signals(self, title: str, description: str) -> List[str]:
        """Detect potential stop rule triggers"""
        signals = []
        content = f"{title} {description}".lower()

        # Political signals
        political_terms = ['democrat', 'republican', 'trump', 'biden', 'maga',
                         'liberal', 'conservative', 'political']
        if any(term in content for term in political_terms):
            signals.append("POTENTIAL_POLITICS")

        # Explicit signals
        explicit_terms = ['explicit', 'adult', 'nsfw', '18+']
        if any(term in content for term in explicit_terms):
            signals.append("POTENTIAL_EXPLICIT")

        # Paid guest signals
        paid_terms = ['sponsor a slot', 'guest sponsorship', 'paid guest',
                     'buy a spot', 'sponsor an episode']
        if any(term in content for term in paid_terms):
            signals.append("POTENTIAL_PAID_GUEST")

        # No guests signals
        no_guest_terms = ['solo show', 'no interviews', 'monologue', 'solo podcast']
        if any(term in content for term in no_guest_terms):
            signals.append("POTENTIAL_NO_GUESTS")

        return signals

    async def search_by_seed_guest(
        self,
        guest_name: str,
        max_results: int = 20
    ) -> List[PodcastDiscoveryResult]:
        """Find podcasts where a specific guest has appeared"""
        results = []

        # Try Listen Notes first (best for guest searches)
        if self.listen_notes_key:
            ln_results = await self._search_listen_notes_guest(guest_name, max_results)
            results.extend(ln_results)

        # Try Podcast Index
        if self.podcast_index_key and len(results) < max_results:
            pi_results = await self._search_podcast_index(
                f'"{guest_name}"',
                max_results - len(results)
            )
            results.extend(pi_results)

        # Deduplicate
        seen_keys = set()
        unique_results = []
        for r in results:
            if r.dedupe_key not in seen_keys:
                seen_keys.add(r.dedupe_key)
                r.discovery_source = f"seed:{guest_name}"
                unique_results.append(r)

        return unique_results[:max_results]

    async def search_by_category(
        self,
        category_query: str,
        max_results: int = 20
    ) -> List[PodcastDiscoveryResult]:
        """Search for podcasts by category/topic"""
        results = []

        # Apple Podcasts search
        apple_results = await self._search_apple_podcasts(category_query, max_results)
        results.extend(apple_results)

        # Podcast Index search
        if self.podcast_index_key and len(results) < max_results:
            pi_results = await self._search_podcast_index(
                category_query,
                max_results - len(results)
            )
            results.extend(pi_results)

        # Deduplicate
        seen_keys = set()
        unique_results = []
        for r in results:
            if r.dedupe_key not in seen_keys:
                seen_keys.add(r.dedupe_key)
                r.discovery_source = f"category:{category_query}"
                unique_results.append(r)

        return unique_results[:max_results]

    async def _search_apple_podcasts(
        self,
        query: str,
        limit: int = 20
    ) -> List[PodcastDiscoveryResult]:
        """Search Apple Podcasts API"""
        results = []
        url = "https://itunes.apple.com/search"
        params = {
            "term": query,
            "media": "podcast",
            "entity": "podcast",
            "limit": limit,
        }

        try:
            async with self.session.get(url, params=params) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    for item in data.get("results", []):
                        podcast = PodcastDiscoveryResult(
                            show_name=item.get("collectionName", ""),
                            host_name=item.get("artistName"),
                            primary_platform_url=item.get("collectionViewUrl", ""),
                            website_url=None,  # Need to scrape
                            apple_podcast_url=item.get("collectionViewUrl"),
                            spotify_url=None,
                            show_description=item.get("description", ""),
                            recent_episode_titles=[],  # Need separate call
                            recent_guests=[],
                            primary_email=None,
                            primary_email_source_url=None,
                            backup_email=None,
                            backup_email_source_url=None,
                            discovery_source="",
                            risk_signals=self._detect_risk_signals(
                                item.get("collectionName", ""),
                                item.get("description", "")
                            ),
                            dedupe_key=self._generate_dedupe_key(
                                item.get("collectionViewUrl", ""),
                                item.get("collectionName", "")
                            ),
                        )
                        results.append(podcast)
        except Exception as e:
            logger.error(f"Apple Podcasts search error: {e}")

        return results

    async def _search_podcast_index(
        self,
        query: str,
        limit: int = 20
    ) -> List[PodcastDiscoveryResult]:
        """Search Podcast Index API (open source)"""
        if not self.podcast_index_key:
            return []

        import time

        results = []
        url = "https://api.podcastindex.org/api/1.0/search/byterm"

        # Generate auth headers for Podcast Index
        epoch_time = int(time.time())
        auth_hash = hashlib.sha1(
            f"{self.podcast_index_key}{self.podcast_index_secret}{epoch_time}".encode()
        ).hexdigest()

        headers = {
            "X-Auth-Key": self.podcast_index_key,
            "X-Auth-Date": str(epoch_time),
            "Authorization": auth_hash,
        }

        params = {"q": query, "max": limit}

        try:
            async with self.session.get(url, params=params, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    for item in data.get("feeds", []):
                        podcast = PodcastDiscoveryResult(
                            show_name=item.get("title", ""),
                            host_name=item.get("author"),
                            primary_platform_url=item.get("url", ""),
                            website_url=item.get("link"),
                            apple_podcast_url=None,
                            spotify_url=None,
                            show_description=item.get("description", ""),
                            recent_episode_titles=[],
                            recent_guests=[],
                            primary_email=None,
                            primary_email_source_url=None,
                            backup_email=None,
                            backup_email_source_url=None,
                            discovery_source="",
                            risk_signals=self._detect_risk_signals(
                                item.get("title", ""),
                                item.get("description", "")
                            ),
                            dedupe_key=self._generate_dedupe_key(
                                item.get("url", ""),
                                item.get("title", "")
                            ),
                        )
                        results.append(podcast)
        except Exception as e:
            logger.error(f"Podcast Index search error: {e}")

        return results

    async def _search_listen_notes_guest(
        self,
        guest_name: str,
        limit: int = 20
    ) -> List[PodcastDiscoveryResult]:
        """Search Listen Notes for episodes featuring a guest"""
        if not self.listen_notes_key:
            return []

        results = []
        url = "https://listen-api.listennotes.com/api/v2/search"

        headers = {"X-ListenAPI-Key": self.listen_notes_key}
        params = {
            "q": f'"{guest_name}"',
            "type": "episode",
            "len_min": 10,  # Minimum 10 minutes
            "language": "English",
            "safe_mode": 1,
        }

        try:
            async with self.session.get(url, params=params, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()

                    # Extract unique podcasts from episodes
                    seen_podcasts = {}
                    for item in data.get("results", []):
                        podcast_id = item.get("podcast", {}).get("id")
                        if podcast_id and podcast_id not in seen_podcasts:
                            podcast_data = item.get("podcast", {})
                            seen_podcasts[podcast_id] = PodcastDiscoveryResult(
                                show_name=podcast_data.get("title_original", ""),
                                host_name=podcast_data.get("publisher_original"),
                                primary_platform_url=podcast_data.get("listennotes_url", ""),
                                website_url=podcast_data.get("website"),
                                apple_podcast_url=None,
                                spotify_url=None,
                                show_description=podcast_data.get("description_original", ""),
                                recent_episode_titles=[item.get("title_original", "")],
                                recent_guests=[guest_name],
                                primary_email=None,
                                primary_email_source_url=None,
                                backup_email=None,
                                backup_email_source_url=None,
                                discovery_source="",
                                risk_signals=self._detect_risk_signals(
                                    podcast_data.get("title_original", ""),
                                    podcast_data.get("description_original", "")
                                ),
                                dedupe_key=f"listennotes:{podcast_id}",
                            )
                    results = list(seen_podcasts.values())
        except Exception as e:
            logger.error(f"Listen Notes search error: {e}")

        return results[:limit]

    async def enrich_podcast(
        self,
        podcast: PodcastDiscoveryResult
    ) -> PodcastDiscoveryResult:
        """Enrich a podcast with additional data"""
        # Try to find website if not present
        if not podcast.website_url and podcast.primary_platform_url:
            podcast.website_url = await self._find_website(podcast)

        # Find emails from website
        if podcast.website_url:
            emails = await self._find_emails(podcast.website_url)
            if emails:
                podcast.primary_email = emails[0]["email"]
                podcast.primary_email_source_url = emails[0]["source"]
                if len(emails) > 1:
                    podcast.backup_email = emails[1]["email"]
                    podcast.backup_email_source_url = emails[1]["source"]

        return podcast

    async def _find_website(self, podcast: PodcastDiscoveryResult) -> Optional[str]:
        """Try to find the podcast's website"""
        # Scrape Apple Podcasts page for website link
        if podcast.apple_podcast_url:
            try:
                async with self.session.get(podcast.apple_podcast_url) as resp:
                    if resp.status == 200:
                        html = await resp.text()
                        soup = BeautifulSoup(html, 'html.parser')
                        # Look for website link
                        website_link = soup.find('a', class_='link', href=re.compile(r'^https?://(?!podcasts\.apple)'))
                        if website_link:
                            return website_link.get('href')
            except Exception as e:
                logger.error(f"Website scrape error: {e}")
        return None

    async def _find_emails(self, website_url: str) -> List[dict]:
        """Find contact emails from website"""
        emails = []
        urls_to_check = [
            website_url,
            f"{website_url.rstrip('/')}/contact",
            f"{website_url.rstrip('/')}/contact-us",
            f"{website_url.rstrip('/')}/about",
            f"{website_url.rstrip('/')}/guest",
            f"{website_url.rstrip('/')}/be-a-guest",
        ]

        email_pattern = re.compile(
            r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        )

        for url in urls_to_check:
            try:
                async with self.session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        html = await resp.text()
                        # Find emails in href="mailto:..."
                        soup = BeautifulSoup(html, 'html.parser')
                        mailto_links = soup.find_all('a', href=re.compile(r'^mailto:'))
                        for link in mailto_links:
                            email = link.get('href').replace('mailto:', '').split('?')[0]
                            if self._is_valid_contact_email(email):
                                emails.append({"email": email, "source": url})

                        # Find emails in text
                        found = email_pattern.findall(html)
                        for email in found:
                            if self._is_valid_contact_email(email) and email not in [e["email"] for e in emails]:
                                emails.append({"email": email, "source": url})
            except Exception:
                continue

        return emails[:2]  # Return max 2 emails

    def _is_valid_contact_email(self, email: str) -> bool:
        """Check if email is a valid contact email (not spam-trap or generic)"""
        email_lower = email.lower()

        # Skip common non-contact emails
        skip_patterns = [
            'noreply', 'no-reply', 'donotreply',
            'info@', 'support@', 'help@',
            'privacy@', 'legal@', 'abuse@',
            '.png', '.jpg', '.gif',  # False positives from images
        ]

        for pattern in skip_patterns:
            if pattern in email_lower:
                return False

        # Prefer booking/guest/contact emails
        good_patterns = ['booking', 'guest', 'contact', 'podcast', 'hello', 'hi@']
        is_preferred = any(p in email_lower for p in good_patterns)

        return True  # Accept all others but prefer booking emails


async def main():
    """Example usage"""
    engine = PodcastDiscoveryEngine(
        listen_notes_api_key=os.getenv("LISTEN_NOTES_API_KEY"),
        podcast_index_key=os.getenv("PODCAST_INDEX_API_KEY"),
        podcast_index_secret=os.getenv("PODCAST_INDEX_API_SECRET"),
    )

    async with engine:
        # Search by seed guest
        results = await engine.search_by_seed_guest("Gary Vaynerchuk", max_results=10)

        for podcast in results:
            enriched = await engine.enrich_podcast(podcast)
            print(json.dumps(enriched.to_dict(), indent=2))


if __name__ == "__main__":
    asyncio.run(main())
