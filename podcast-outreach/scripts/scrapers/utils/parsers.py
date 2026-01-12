"""
HTML Parsers
Utility functions for parsing podcast websites and extracting information
"""

import re
from dataclasses import dataclass
from typing import List, Optional, Dict, Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup


@dataclass
class ParsedPodcastPage:
    """Structured data extracted from a podcast website"""
    title: str
    description: Optional[str] = None
    host_name: Optional[str] = None
    email: Optional[str] = None
    rss_feed: Optional[str] = None
    social_links: Dict[str, str] = None
    episode_count: Optional[int] = None
    categories: List[str] = None


class PodcastPageParser:
    """Parser for podcast website pages"""

    EMAIL_PATTERN = re.compile(
        r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
    )

    RSS_PATTERNS = [
        r'type=["\']application/rss\+xml["\']',
        r'href=["\']([^"\']+\.rss)["\']',
        r'href=["\']([^"\']+/feed/?)["\']',
    ]

    def __init__(self):
        self.social_domains = {
            "twitter.com": "twitter",
            "x.com": "twitter",
            "linkedin.com": "linkedin",
            "instagram.com": "instagram",
            "facebook.com": "facebook",
            "youtube.com": "youtube",
            "tiktok.com": "tiktok",
        }

    def parse(self, html: str, base_url: str = "") -> ParsedPodcastPage:
        """
        Parse a podcast website page

        Args:
            html: Raw HTML content
            base_url: Base URL for resolving relative links

        Returns:
            Parsed podcast page data
        """
        soup = BeautifulSoup(html, "html.parser")

        return ParsedPodcastPage(
            title=self._extract_title(soup),
            description=self._extract_description(soup),
            host_name=self._extract_host_name(soup),
            email=self._extract_email(soup),
            rss_feed=self._extract_rss_feed(soup, base_url),
            social_links=self._extract_social_links(soup),
            categories=self._extract_categories(soup),
        )

    def _extract_title(self, soup: BeautifulSoup) -> str:
        """Extract podcast title"""
        # Try Open Graph title first
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            return og_title["content"]

        # Try regular title tag
        title_tag = soup.find("title")
        if title_tag:
            title = title_tag.get_text().strip()
            # Remove common suffixes
            for suffix in [" | Podcast", " - Podcast", " Podcast"]:
                if title.endswith(suffix):
                    title = title[:-len(suffix)]
            return title

        # Try h1
        h1 = soup.find("h1")
        if h1:
            return h1.get_text().strip()

        return "Unknown Podcast"

    def _extract_description(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract podcast description"""
        # Try Open Graph description
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            return og_desc["content"]

        # Try meta description
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            return meta_desc["content"]

        return None

    def _extract_host_name(self, soup: BeautifulSoup) -> Optional[str]:
        """Try to extract host name from page"""
        # Look for common patterns
        patterns = [
            r"[Hh]osted by ([A-Z][a-z]+ [A-Z][a-z]+)",
            r"[Ww]ith ([A-Z][a-z]+ [A-Z][a-z]+)",
            r"[Hh]ost:?\s*([A-Z][a-z]+ [A-Z][a-z]+)",
        ]

        text = soup.get_text()
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1)

        return None

    def _extract_email(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract email address"""
        # Check mailto links first
        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            if href.startswith("mailto:"):
                email = href.replace("mailto:", "").split("?")[0]
                return email.lower()

        # Search page text
        text = soup.get_text()
        matches = self.EMAIL_PATTERN.findall(text)

        # Filter out common non-contact emails
        for email in matches:
            email_lower = email.lower()
            if not any(x in email_lower for x in [
                "example", "noreply", "support", "info@",
                "privacy", "legal", "admin"
            ]):
                return email_lower

        return None

    def _extract_rss_feed(
        self,
        soup: BeautifulSoup,
        base_url: str
    ) -> Optional[str]:
        """Extract RSS feed URL"""
        # Check link tags
        rss_link = soup.find("link", type="application/rss+xml")
        if rss_link and rss_link.get("href"):
            return urljoin(base_url, rss_link["href"])

        # Check for RSS links in page
        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            text = link.get_text().lower()

            if "rss" in text or "feed" in text:
                if href.endswith((".rss", ".xml", "/feed", "/feed/")):
                    return urljoin(base_url, href)

        return None

    def _extract_social_links(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract social media profile links"""
        social = {}

        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            parsed = urlparse(href)
            domain = parsed.netloc.replace("www.", "")

            for social_domain, platform in self.social_domains.items():
                if social_domain in domain:
                    social[platform] = href
                    break

        return social

    def _extract_categories(self, soup: BeautifulSoup) -> List[str]:
        """Extract podcast categories/tags"""
        categories = []

        # Look for common category containers
        for selector in [".category", ".tag", ".genre", "[class*='category']"]:
            elements = soup.select(selector)
            for el in elements:
                text = el.get_text().strip()
                if text and len(text) < 50:  # Reasonable category length
                    categories.append(text)

        # Deduplicate
        return list(set(categories))


class RSSParser:
    """Parser for podcast RSS feeds"""

    def parse(self, xml_content: str) -> Dict[str, Any]:
        """
        Parse a podcast RSS feed

        Args:
            xml_content: Raw RSS/XML content

        Returns:
            Parsed podcast data
        """
        soup = BeautifulSoup(xml_content, "xml")

        channel = soup.find("channel")
        if not channel:
            return {}

        episodes = []
        for item in channel.find_all("item"):
            episode = {
                "title": self._get_text(item, "title"),
                "description": self._get_text(item, "description"),
                "published": self._get_text(item, "pubDate"),
                "duration": self._get_text(item, "itunes:duration"),
                "audio_url": self._get_enclosure_url(item),
            }
            episodes.append(episode)

        return {
            "title": self._get_text(channel, "title"),
            "description": self._get_text(channel, "description"),
            "author": self._get_text(channel, "itunes:author"),
            "email": self._get_text(channel, "itunes:email"),
            "website": self._get_text(channel, "link"),
            "image": self._get_image_url(channel),
            "categories": self._get_categories(channel),
            "episodes": episodes,
        }

    def _get_text(self, element, tag: str) -> Optional[str]:
        """Get text content of a child element"""
        child = element.find(tag)
        return child.get_text().strip() if child else None

    def _get_enclosure_url(self, item) -> Optional[str]:
        """Get audio URL from enclosure tag"""
        enclosure = item.find("enclosure")
        return enclosure.get("url") if enclosure else None

    def _get_image_url(self, channel) -> Optional[str]:
        """Get podcast image URL"""
        # Try iTunes image
        itunes_image = channel.find("itunes:image")
        if itunes_image and itunes_image.get("href"):
            return itunes_image["href"]

        # Try standard image
        image = channel.find("image")
        if image:
            url = image.find("url")
            return url.get_text().strip() if url else None

        return None

    def _get_categories(self, channel) -> List[str]:
        """Get podcast categories"""
        categories = []

        for cat in channel.find_all("itunes:category"):
            text = cat.get("text")
            if text:
                categories.append(text)

        return categories
