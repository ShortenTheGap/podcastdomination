#!/usr/bin/env python3
"""
Contact Finder
Discovers email addresses and contact information for podcast hosts
"""

import re
from dataclasses import dataclass
from typing import List, Optional, Set
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


@dataclass
class Contact:
    """Represents a discovered contact"""
    email: str
    name: Optional[str] = None
    role: str = "host"
    source: str = "website"
    confidence: float = 0.5
    linkedin_url: Optional[str] = None
    twitter_url: Optional[str] = None


class ContactFinder:
    """Finds contact information from websites and social profiles"""

    # Common email patterns to look for
    EMAIL_PATTERN = re.compile(
        r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
        re.IGNORECASE
    )

    # Email addresses to exclude
    EXCLUDED_DOMAINS = {
        "example.com", "email.com", "yourdomain.com",
        "domain.com", "company.com", "test.com",
        "sentry.io", "cloudflare.com",
    }

    EXCLUDED_PREFIXES = {
        "noreply", "no-reply", "donotreply", "mailer-daemon",
        "postmaster", "webmaster", "admin", "info@",
        "support", "help", "contact@", "hello@",
    }

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (compatible; PodcastResearchBot/1.0)"
        })

    def find_contacts(
        self,
        website_url: str,
        podcast_name: str = "",
    ) -> List[Contact]:
        """
        Find contact information from a website

        Args:
            website_url: The podcast's website URL
            podcast_name: Name of the podcast (for context)

        Returns:
            List of discovered contacts
        """
        contacts = []
        emails_found: Set[str] = set()

        try:
            # Fetch main page
            main_page_emails = self._scrape_page(website_url)
            emails_found.update(main_page_emails)

            # Try common contact page URLs
            contact_urls = self._find_contact_pages(website_url)
            for url in contact_urls:
                page_emails = self._scrape_page(url)
                emails_found.update(page_emails)

            # Try about page
            about_urls = self._find_about_pages(website_url)
            for url in about_urls:
                page_emails = self._scrape_page(url)
                emails_found.update(page_emails)

        except Exception as e:
            print(f"Error scraping {website_url}: {e}")

        # Convert to Contact objects
        for email in emails_found:
            if self._is_valid_contact_email(email):
                confidence = self._calculate_confidence(email, podcast_name)
                contacts.append(Contact(
                    email=email.lower(),
                    source="website",
                    confidence=confidence,
                ))

        # Sort by confidence
        contacts.sort(key=lambda c: c.confidence, reverse=True)

        return contacts

    def _scrape_page(self, url: str) -> Set[str]:
        """Scrape a page for email addresses"""
        emails = set()

        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            # Find mailto links
            for link in soup.find_all("a", href=True):
                href = link.get("href", "")
                if href.startswith("mailto:"):
                    email = href.replace("mailto:", "").split("?")[0]
                    emails.add(email)

            # Search page text for email patterns
            text = soup.get_text()
            found = self.EMAIL_PATTERN.findall(text)
            emails.update(found)

            # Check meta tags and structured data
            for meta in soup.find_all("meta"):
                content = meta.get("content", "")
                found = self.EMAIL_PATTERN.findall(content)
                emails.update(found)

        except Exception as e:
            print(f"Error fetching {url}: {e}")

        return emails

    def _find_contact_pages(self, base_url: str) -> List[str]:
        """Find potential contact page URLs"""
        paths = [
            "/contact", "/contact-us", "/contact.html",
            "/get-in-touch", "/reach-out", "/connect",
            "/booking", "/book", "/guest", "/be-a-guest",
            "/pitch", "/sponsor", "/advertise",
        ]

        parsed = urlparse(base_url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        return [urljoin(base, path) for path in paths]

    def _find_about_pages(self, base_url: str) -> List[str]:
        """Find potential about page URLs"""
        paths = [
            "/about", "/about-us", "/about.html",
            "/team", "/host", "/hosts", "/who-we-are",
        ]

        parsed = urlparse(base_url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        return [urljoin(base, path) for path in paths]

    def _is_valid_contact_email(self, email: str) -> bool:
        """Check if an email is a valid contact (not generic/system email)"""
        email_lower = email.lower()

        # Check excluded domains
        domain = email_lower.split("@")[-1]
        if domain in self.EXCLUDED_DOMAINS:
            return False

        # Check excluded prefixes
        local_part = email_lower.split("@")[0]
        for prefix in self.EXCLUDED_PREFIXES:
            if local_part.startswith(prefix) or email_lower.startswith(prefix):
                return False

        return True

    def _calculate_confidence(self, email: str, podcast_name: str) -> float:
        """Calculate confidence score for an email being the right contact"""
        score = 0.5

        email_lower = email.lower()
        podcast_lower = podcast_name.lower() if podcast_name else ""

        # Boost if email contains podcast name
        podcast_words = podcast_lower.split()
        for word in podcast_words:
            if len(word) > 3 and word in email_lower:
                score += 0.1

        # Boost personal-looking emails
        if re.match(r"^[a-z]+\.[a-z]+@", email_lower):
            score += 0.15  # firstname.lastname pattern
        elif re.match(r"^[a-z]+@", email_lower):
            score += 0.1  # just firstname

        # Reduce for generic-looking domains
        domain = email_lower.split("@")[-1]
        if domain in ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"]:
            score -= 0.05

        # Boost for podcast-specific keywords
        if any(kw in email_lower for kw in ["podcast", "show", "booking", "guest"]):
            score += 0.1

        return min(1.0, max(0.0, score))

    def find_social_profiles(
        self,
        website_url: str,
    ) -> dict:
        """Find social media profile links from a website"""
        profiles = {
            "twitter": None,
            "linkedin": None,
            "instagram": None,
            "facebook": None,
        }

        try:
            response = self.session.get(website_url, timeout=10)
            soup = BeautifulSoup(response.text, "html.parser")

            for link in soup.find_all("a", href=True):
                href = link.get("href", "").lower()

                if "twitter.com/" in href or "x.com/" in href:
                    profiles["twitter"] = href
                elif "linkedin.com/" in href:
                    profiles["linkedin"] = href
                elif "instagram.com/" in href:
                    profiles["instagram"] = href
                elif "facebook.com/" in href:
                    profiles["facebook"] = href

        except Exception as e:
            print(f"Error finding social profiles: {e}")

        return profiles


def main():
    """CLI entry point"""
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Find podcast contact information")
    parser.add_argument("url", help="Website URL to search")
    parser.add_argument("--name", help="Podcast name")
    parser.add_argument("--output", "-o", help="Output JSON file")

    args = parser.parse_args()

    finder = ContactFinder()
    contacts = finder.find_contacts(args.url, args.name or "")
    social = finder.find_social_profiles(args.url)

    output = {
        "contacts": [
            {
                "email": c.email,
                "name": c.name,
                "role": c.role,
                "source": c.source,
                "confidence": c.confidence,
            }
            for c in contacts
        ],
        "social_profiles": social,
    }

    if args.output:
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2)
        print(f"Saved results to {args.output}")
    else:
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
