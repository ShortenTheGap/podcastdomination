#!/usr/bin/env python3
"""
Contact Finder
Finds and verifies contact emails for podcasts.
Implements the strict "email must have source URL" rule.
"""

import asyncio
import aiohttp
import re
from typing import Optional, List, Tuple
from dataclasses import dataclass
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class ContactResult:
    """A verified contact with source"""
    email: str
    source_url: str  # REQUIRED - where this email was found
    contact_type: str  # "booking", "host", "producer", "general"
    confidence: float  # 0.0 to 1.0


class ContactFinder:
    """
    Email discovery with source verification.

    CRITICAL RULE: Every email MUST have a source_url where it was found.
    If we can't prove where we found the email, we don't use it.
    """

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None

        # Patterns for identifying contact types
        self.booking_patterns = [
            r'booking', r'guest', r'podcast', r'media',
            r'inquir', r'press', r'interview'
        ]
        self.host_patterns = [
            r'@gmail\.com', r'@yahoo\.com', r'@outlook\.com',
            r'@icloud\.com', r'@me\.com'
        ]

    async def __aenter__(self):
        self.session = aiohttp.ClientSession(
            headers={"User-Agent": "PodcastOutreach/1.0"},
            timeout=aiohttp.ClientTimeout(total=30)
        )
        return self

    async def __aexit__(self, *args):
        if self.session:
            await self.session.close()

    async def find_contacts(
        self,
        website_url: Optional[str] = None,
        podcast_name: str = "",
        social_links: List[str] = None
    ) -> Tuple[Optional[ContactResult], Optional[ContactResult]]:
        """
        Find primary and backup contacts.

        Returns: (primary_contact, backup_contact)
        Both will have source_url populated, or be None.
        """
        all_contacts = []

        # 1. Check podcast website
        if website_url:
            website_contacts = await self._scan_website(website_url)
            all_contacts.extend(website_contacts)

        # 2. Check common podcast directories
        directory_contacts = await self._check_directories(podcast_name)
        all_contacts.extend(directory_contacts)

        # 3. Rank and dedupe contacts
        ranked = self._rank_contacts(all_contacts)

        # Return top 2
        primary = ranked[0] if len(ranked) > 0 else None
        backup = ranked[1] if len(ranked) > 1 else None

        return primary, backup

    async def _scan_website(self, base_url: str) -> List[ContactResult]:
        """Scan podcast website for contact emails"""
        contacts = []

        # Pages to check (in priority order)
        paths_to_check = [
            "/contact",
            "/contact-us",
            "/be-a-guest",
            "/guest",
            "/podcast",
            "/about",
            "/media",
            "/press",
            "/booking",
            "",  # Homepage
        ]

        for path in paths_to_check:
            url = f"{base_url.rstrip('/')}{path}"
            page_contacts = await self._scrape_page_for_emails(url)
            contacts.extend(page_contacts)

        return contacts

    async def _scrape_page_for_emails(self, url: str) -> List[ContactResult]:
        """Scrape a single page for emails"""
        contacts = []

        try:
            async with self.session.get(url) as resp:
                if resp.status != 200:
                    return contacts

                html = await resp.text()
                soup = BeautifulSoup(html, 'html.parser')

                # Method 1: mailto: links (highest confidence)
                mailto_links = soup.find_all('a', href=re.compile(r'^mailto:', re.I))
                for link in mailto_links:
                    href = link.get('href', '')
                    email = href.replace('mailto:', '').split('?')[0].strip()

                    if self._is_valid_email(email):
                        contact_type = self._classify_email(email, link.get_text())
                        contacts.append(ContactResult(
                            email=email.lower(),
                            source_url=url,
                            contact_type=contact_type,
                            confidence=0.9 if contact_type == "booking" else 0.7
                        ))

                # Method 2: Email patterns in text (lower confidence)
                email_pattern = re.compile(
                    r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b'
                )
                text_emails = email_pattern.findall(html)

                for email in text_emails:
                    if self._is_valid_email(email):
                        # Check if already found via mailto
                        if not any(c.email == email.lower() for c in contacts):
                            contact_type = self._classify_email(email, "")
                            contacts.append(ContactResult(
                                email=email.lower(),
                                source_url=url,
                                contact_type=contact_type,
                                confidence=0.6
                            ))

        except Exception as e:
            logger.warning(f"Error scraping {url}: {e}")

        return contacts

    async def _check_directories(self, podcast_name: str) -> List[ContactResult]:
        """Check podcast directories for contact info"""
        contacts = []

        # Note: In production, you'd implement actual directory checks
        # This is a placeholder for the structure
        directories = [
            ("podchaser", f"https://www.podchaser.com/search?q={podcast_name}"),
            ("chartable", f"https://chartable.com/search?q={podcast_name}"),
        ]

        # Implement directory-specific scrapers as needed

        return contacts

    def _is_valid_email(self, email: str) -> bool:
        """Validate email format and filter out spam traps"""
        if not email or '@' not in email:
            return False

        email_lower = email.lower()

        # Skip patterns
        skip_patterns = [
            'noreply', 'no-reply', 'donotreply', 'mailer-daemon',
            'example.com', 'example.org', 'test.com',
            '.png', '.jpg', '.gif', '.svg',  # False positives
            'wixpress', 'sentry.io', 'cloudflare',  # Infrastructure
            'privacy@', 'abuse@', 'postmaster@', 'webmaster@',
        ]

        for pattern in skip_patterns:
            if pattern in email_lower:
                return False

        # Basic format check
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            return False

        return True

    def _classify_email(self, email: str, context: str) -> str:
        """Classify email as booking, host, producer, or general"""
        combined = f"{email} {context}".lower()

        # Check for booking/guest patterns (highest priority)
        for pattern in self.booking_patterns:
            if re.search(pattern, combined):
                return "booking"

        # Check for personal email patterns (host)
        for pattern in self.host_patterns:
            if re.search(pattern, email.lower()):
                return "host"

        # Check context for producer signals
        if 'producer' in combined or 'production' in combined:
            return "producer"

        return "general"

    def _rank_contacts(self, contacts: List[ContactResult]) -> List[ContactResult]:
        """Rank and dedupe contacts, returning best options"""
        # Remove duplicates (keep highest confidence)
        seen = {}
        for contact in contacts:
            if contact.email not in seen or contact.confidence > seen[contact.email].confidence:
                seen[contact.email] = contact

        unique = list(seen.values())

        # Sort by: contact_type priority, then confidence
        type_priority = {
            "booking": 0,
            "host": 1,
            "producer": 2,
            "general": 3
        }

        unique.sort(key=lambda c: (
            type_priority.get(c.contact_type, 99),
            -c.confidence
        ))

        return unique


async def main():
    """Example usage"""
    finder = ContactFinder()

    async with finder:
        primary, backup = await finder.find_contacts(
            website_url="https://www.smartpassiveincome.com",
            podcast_name="Smart Passive Income"
        )

        if primary:
            print(f"Primary: {primary.email}")
            print(f"Source: {primary.source_url}")
            print(f"Type: {primary.contact_type}")

        if backup:
            print(f"\nBackup: {backup.email}")
            print(f"Source: {backup.source_url}")


if __name__ == "__main__":
    asyncio.run(main())
