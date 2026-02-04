#!/usr/bin/env python3
"""
Transcript Fetcher
Fetches transcripts from YouTube videos and podcast episodes
"""

import re
from dataclasses import dataclass
from typing import List, Optional

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)


@dataclass
class TranscriptSegment:
    """A segment of a transcript with timing info"""
    text: str
    start: float
    duration: float


@dataclass
class Transcript:
    """Full transcript with metadata"""
    video_id: str
    title: str
    segments: List[TranscriptSegment]
    language: str
    is_generated: bool

    @property
    def full_text(self) -> str:
        """Get the full transcript as a single string"""
        return " ".join(seg.text for seg in self.segments)

    @property
    def duration_seconds(self) -> float:
        """Total duration in seconds"""
        if not self.segments:
            return 0
        last = self.segments[-1]
        return last.start + last.duration


class TranscriptFetcher:
    """Fetches transcripts from various sources"""

    def __init__(self):
        self.preferred_languages = ["en", "en-US", "en-GB"]

    def extract_video_id(self, url: str) -> Optional[str]:
        """Extract YouTube video ID from URL"""
        patterns = [
            r"(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})",
            r"youtube\.com/embed/([a-zA-Z0-9_-]{11})",
            r"youtube\.com/v/([a-zA-Z0-9_-]{11})",
        ]

        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)

        # Maybe it's already just a video ID
        if re.match(r"^[a-zA-Z0-9_-]{11}$", url):
            return url

        return None

    def fetch_youtube_transcript(
        self,
        video_id_or_url: str,
        languages: List[str] = None,
    ) -> Optional[Transcript]:
        """
        Fetch transcript from a YouTube video

        Args:
            video_id_or_url: YouTube video ID or URL
            languages: Preferred languages (defaults to English variants)

        Returns:
            Transcript object or None if not available
        """
        video_id = self.extract_video_id(video_id_or_url)
        if not video_id:
            print(f"Could not extract video ID from: {video_id_or_url}")
            return None

        if languages is None:
            languages = self.preferred_languages

        try:
            # Try to get transcript in preferred language
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

            # First try manual transcripts
            try:
                transcript = transcript_list.find_manually_created_transcript(languages)
                is_generated = False
            except NoTranscriptFound:
                # Fall back to auto-generated
                try:
                    transcript = transcript_list.find_generated_transcript(languages)
                    is_generated = True
                except NoTranscriptFound:
                    # Try any available transcript and translate
                    available = list(transcript_list)
                    if available:
                        transcript = available[0].translate("en")
                        is_generated = True
                    else:
                        return None

            # Fetch the transcript data
            data = transcript.fetch()

            segments = [
                TranscriptSegment(
                    text=entry["text"],
                    start=entry["start"],
                    duration=entry["duration"],
                )
                for entry in data
            ]

            return Transcript(
                video_id=video_id,
                title="",  # Would need separate API call for title
                segments=segments,
                language=transcript.language_code,
                is_generated=is_generated,
            )

        except TranscriptsDisabled:
            print(f"Transcripts disabled for video: {video_id}")
            return None
        except VideoUnavailable:
            print(f"Video unavailable: {video_id}")
            return None
        except Exception as e:
            print(f"Error fetching transcript for {video_id}: {e}")
            return None

    def fetch_multiple(
        self,
        video_ids: List[str],
        languages: List[str] = None,
    ) -> List[Transcript]:
        """
        Fetch transcripts for multiple videos

        Args:
            video_ids: List of video IDs or URLs
            languages: Preferred languages

        Returns:
            List of successfully fetched transcripts
        """
        transcripts = []

        for video_id in video_ids:
            transcript = self.fetch_youtube_transcript(video_id, languages)
            if transcript:
                transcripts.append(transcript)

        return transcripts

    def summarize_transcript(
        self,
        transcript: Transcript,
        max_length: int = 5000,
    ) -> str:
        """
        Create a summary-friendly version of the transcript

        Args:
            transcript: The transcript to summarize
            max_length: Maximum character length

        Returns:
            Cleaned and truncated transcript text
        """
        text = transcript.full_text

        # Clean up common transcript artifacts
        text = re.sub(r"\[.*?\]", "", text)  # Remove [Music], [Laughter], etc.
        text = re.sub(r"\s+", " ", text)  # Normalize whitespace
        text = text.strip()

        if len(text) > max_length:
            # Try to cut at sentence boundary
            truncated = text[:max_length]
            last_period = truncated.rfind(".")
            if last_period > max_length * 0.8:
                text = truncated[:last_period + 1]
            else:
                text = truncated + "..."

        return text


def main():
    """CLI entry point"""
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Fetch YouTube transcripts")
    parser.add_argument("videos", nargs="+", help="Video IDs or URLs")
    parser.add_argument("--output", "-o", help="Output JSON file")
    parser.add_argument("--full", action="store_true", help="Include full segments")

    args = parser.parse_args()

    fetcher = TranscriptFetcher()
    transcripts = fetcher.fetch_multiple(args.videos)

    output = []
    for t in transcripts:
        data = {
            "video_id": t.video_id,
            "language": t.language,
            "is_generated": t.is_generated,
            "duration_seconds": t.duration_seconds,
            "text": fetcher.summarize_transcript(t) if not args.full else t.full_text,
        }
        if args.full:
            data["segments"] = [
                {"text": s.text, "start": s.start, "duration": s.duration}
                for s in t.segments
            ]
        output.append(data)

    if args.output:
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2)
        print(f"Saved {len(output)} transcripts to {args.output}")
    else:
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
