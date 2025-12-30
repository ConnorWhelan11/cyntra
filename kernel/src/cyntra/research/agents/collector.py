"""
Collector Agent - Fetch and normalize content.

The Collector agent is the second step in the research pipeline:
1. Fetch each URL via Firecrawl scrape
2. Extract main content (strip nav, ads, boilerplate)
3. Convert to Markdown
4. Run safety scanner (detect PII, secrets)
5. Redact or reject based on policy
6. Compute content hashes for dedup
7. Write to evidence directory
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cyntra.research.agents.base import AgentContext, AgentResult, BaseResearchAgent
from cyntra.research.agents.scout import ScoutOutput, SourceEntry
from cyntra.research.models import EvidenceMetadata, SafetyConfig


@dataclass
class SafetyScanResult:
    """Result of scanning content for PII/secrets."""

    passed: bool
    pii_found: list[tuple[str, str, int]] = field(default_factory=list)
    secrets_found: list[tuple[str, str, int]] = field(default_factory=list)
    redacted_content: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "passed": self.passed,
            "pii_count": len(self.pii_found),
            "secrets_count": len(self.secrets_found),
            "issues": [f"{t}:{m[:20]}..." for t, m, _ in self.pii_found + self.secrets_found],
        }


@dataclass
class CollectedEvidence:
    """A single piece of collected evidence."""

    source: SourceEntry
    metadata: EvidenceMetadata
    raw_content: str
    normalized_content: str
    safety_result: SafetyScanResult

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "evidence_id": self.metadata.evidence_id,
            "url": self.source.url,
            "title": self.metadata.title,
            "content_type": self.metadata.content_type,
            "fetched_at": self.metadata.fetched_at.isoformat(),
            "normalized_file": self.metadata.normalized_file,
            "content_hash": self.metadata.content_hash,
            "size_bytes": self.metadata.size_bytes,
            "extraction_quality": {
                "is_primary_content": self.metadata.is_primary_content,
                "noise_ratio": self.metadata.noise_ratio,
                "language": self.metadata.language,
            },
            "safety_scan": self.safety_result.to_dict(),
        }


@dataclass
class CollectorInput:
    """Input for the Collector agent."""

    source_manifest: list[SourceEntry] = field(default_factory=list)
    safety_config: SafetyConfig = field(default_factory=SafetyConfig)
    max_file_size_kb: int = 500
    allowed_filetypes: list[str] = field(default_factory=lambda: [".md", ".txt", ".html", ".pdf"])


@dataclass
class CollectorOutput:
    """Output from the Collector agent."""

    evidence_collected: list[CollectedEvidence] = field(default_factory=list)
    evidence_failed: list[tuple[SourceEntry, str]] = field(default_factory=list)
    evidence_skipped: list[tuple[SourceEntry, str]] = field(default_factory=list)

    total_fetched: int = 0
    total_failed: int = 0
    total_skipped: int = 0
    total_bytes: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "evidence": [e.to_dict() for e in self.evidence_collected],
            "failed": [{"url": s.url, "error": err} for s, err in self.evidence_failed],
            "skipped": [{"url": s.url, "reason": r} for s, r in self.evidence_skipped],
            "total_fetched": self.total_fetched,
            "total_failed": self.total_failed,
            "total_skipped": self.total_skipped,
            "total_bytes": self.total_bytes,
        }


# PII and secrets patterns
PII_PATTERNS = {
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    "phone": r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b(?:\d{4}[-\s]?){3}\d{4}\b",
}

SECRET_PATTERNS = {
    "aws_key": r"AKIA[0-9A-Z]{16}",
    "github_token": r"gh[pousr]_[A-Za-z0-9_]{36,}",
    "openai_key": r"sk-[A-Za-z0-9]{48}",
    "anthropic_key": r"sk-ant-[A-Za-z0-9-_]{90,}",
    "generic_api_key": r"(?i)(api[_-]?key|secret[_-]?key|password)\s*[:=]\s*['\"]?[A-Za-z0-9+/=_-]{20,}",
}


class CollectorAgent(BaseResearchAgent[CollectorInput, CollectorOutput]):
    """
    Collector agent for fetching and normalizing content.

    Uses Firecrawl for web scraping.
    """

    name = "collector"

    def __init__(self, context: AgentContext, firecrawl_client: Any | None = None):
        super().__init__(context)
        self._firecrawl = firecrawl_client

    async def execute(self, input_data: CollectorInput) -> AgentResult[CollectorOutput]:
        """Execute the collector agent to fetch and normalize content."""
        result = AgentResult[CollectorOutput](success=False, started_at=datetime.now(UTC))
        output = CollectorOutput()

        try:
            # Create evidence directories
            evidence_dir = self.context.run_dir / "evidence"
            raw_dir = evidence_dir / "raw"
            normalized_dir = evidence_dir / "normalized"

            raw_dir.mkdir(parents=True, exist_ok=True)
            normalized_dir.mkdir(parents=True, exist_ok=True)

            # Process each source
            for source in input_data.source_manifest:
                try:
                    evidence = await self._collect_source(
                        source,
                        input_data,
                        raw_dir,
                        normalized_dir,
                    )

                    if evidence:
                        output.evidence_collected.append(evidence)
                        output.total_fetched += 1
                        output.total_bytes += evidence.metadata.size_bytes
                    else:
                        output.evidence_skipped.append((source, "Empty content"))
                        output.total_skipped += 1

                except Exception as e:
                    self.logger.warning(f"Failed to collect {source.url}: {e}")
                    output.evidence_failed.append((source, str(e)))
                    output.total_failed += 1

            # Write metadata.json
            await self._write_metadata(output, evidence_dir)

            self.logger.info(
                f"Collector complete: {output.total_fetched} collected, "
                f"{output.total_failed} failed, {output.total_skipped} skipped"
            )

            result.success = True
            result.output = output
            result.completed_at = datetime.now(UTC)

        except Exception as e:
            self.logger.error(f"Collector failed: {e}")
            result.success = False
            result.error = str(e)
            result.completed_at = datetime.now(UTC)

        return result

    async def _collect_source(
        self,
        source: SourceEntry,
        input_data: CollectorInput,
        raw_dir: Path,
        normalized_dir: Path,
    ) -> CollectedEvidence | None:
        """Collect a single source."""
        # Generate safe filename from URL
        filename_base = self._url_to_filename(source.url)

        # Fetch content
        raw_content, content_type, title = await self._fetch_url(source.url)

        if not raw_content:
            return None

        # Check file size
        size_bytes = len(raw_content.encode("utf-8"))
        if size_bytes > input_data.max_file_size_kb * 1024:
            self.logger.warning(f"Content too large ({size_bytes} bytes): {source.url}")
            # Truncate if over limit
            raw_content = raw_content[: input_data.max_file_size_kb * 1024]
            size_bytes = len(raw_content.encode("utf-8"))

        # Write raw content
        raw_file = raw_dir / f"{filename_base}.html"
        with open(raw_file, "w", encoding="utf-8") as f:
            f.write(raw_content)

        # Normalize to Markdown
        normalized_content = self._normalize_to_markdown(raw_content, content_type)

        # Safety scan
        safety_result = self._scan_content(
            normalized_content,
            input_data.safety_config,
        )

        # Handle safety issues
        if not safety_result.passed:
            if input_data.safety_config.redact_on_detect and safety_result.redacted_content:
                normalized_content = safety_result.redacted_content
                self.logger.info(f"Redacted content from {source.url}")
            else:
                self.logger.warning(f"Safety scan failed for {source.url}")
                # Still collect but mark as unsafe
                pass

        # Write normalized content
        normalized_file = normalized_dir / f"{filename_base}.md"
        with open(normalized_file, "w", encoding="utf-8") as f:
            f.write(normalized_content)

        # Compute content hash
        content_hash = hashlib.sha256(normalized_content.encode()).hexdigest()

        # Generate evidence ID
        evidence_id = (
            f"evi_{self.context.run_id}_{source.domain.replace('.', '_')}_{content_hash[:8]}"
        )

        # Create metadata
        metadata = EvidenceMetadata(
            evidence_id=evidence_id,
            source_type="web",
            url=source.url,
            domain=source.domain,
            fetched_at=datetime.now(UTC),
            content_type=content_type,
            raw_file=f"raw/{filename_base}.html",
            normalized_file=f"normalized/{filename_base}.md",
            content_hash=f"sha256:{content_hash}",
            size_bytes=size_bytes,
            title=title or self._extract_title(normalized_content),
            excerpt=normalized_content[:200] if normalized_content else None,
            is_primary_content=True,
            noise_ratio=self._estimate_noise_ratio(raw_content, normalized_content),
            language="en",  # TODO: Detect language
        )

        return CollectedEvidence(
            source=source,
            metadata=metadata,
            raw_content=raw_content,
            normalized_content=normalized_content,
            safety_result=safety_result,
        )

    async def _fetch_url(self, url: str) -> tuple[str, str, str | None]:
        """Fetch content from a URL."""
        content = ""
        content_type = "text/html"
        title = None

        if self._firecrawl:
            try:
                # Use Firecrawl scrape
                response = await self._firecrawl.scrape(
                    url=url,
                    formats=["markdown"],
                    onlyMainContent=True,
                )

                content = response.get("markdown", "")
                title = response.get("metadata", {}).get("title")
                content_type = "text/markdown"  # Already normalized

            except Exception as e:
                self.logger.warning(f"Firecrawl scrape failed: {e}")
                raise
        else:
            # Fallback: simple HTTP fetch (for testing)
            try:
                import aiohttp

                async with aiohttp.ClientSession() as session, session.get(url, timeout=30) as resp:
                    if resp.status == 200:
                        content = await resp.text()
                        content_type = resp.content_type or "text/html"
                    else:
                        raise Exception(f"HTTP {resp.status}")
            except ImportError:
                # aiohttp not installed - use sync urllib as last resort
                import urllib.error
                import urllib.request

                try:
                    req = urllib.request.Request(
                        url, headers={"User-Agent": "Cyntra Research Agent/1.0"}
                    )
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        content = resp.read().decode("utf-8", errors="replace")
                        content_type = resp.headers.get("Content-Type", "text/html")
                except urllib.error.HTTPError as e:
                    raise Exception(f"HTTP {e.code}") from e
                except urllib.error.URLError as e:
                    raise Exception(f"URL error: {e.reason}") from e

        return content, content_type, title

    def _normalize_to_markdown(self, content: str, content_type: str) -> str:
        """Normalize content to Markdown format."""
        # If already markdown (from Firecrawl), just clean up
        if "markdown" in content_type:
            return self._clean_markdown(content)

        # Convert HTML to Markdown
        try:
            from html2text import HTML2Text

            h = HTML2Text()
            h.ignore_links = False
            h.ignore_images = False
            h.ignore_emphasis = False
            h.body_width = 0  # No wrapping

            markdown = h.handle(content)
            return self._clean_markdown(markdown)

        except ImportError:
            # Fallback: simple regex cleanup
            return self._simple_html_to_text(content)

    def _clean_markdown(self, markdown: str) -> str:
        """Clean up Markdown content."""
        # Remove excessive newlines
        markdown = re.sub(r"\n{3,}", "\n\n", markdown)

        # Remove leading/trailing whitespace
        markdown = markdown.strip()

        # Remove common navigation patterns
        patterns_to_remove = [
            r"^\s*\[.*?\]\(.*?/search.*?\).*$",  # Search links
            r"^\s*Skip to.*$",  # Skip links
            r"^\s*\[.*?Menu.*?\].*$",  # Menu items
            r"^\s*\[.*?Sign in.*?\].*$",  # Sign in links
            r"^\s*Cookie.*$",  # Cookie notices
        ]

        for pattern in patterns_to_remove:
            markdown = re.sub(pattern, "", markdown, flags=re.MULTILINE | re.IGNORECASE)

        return markdown.strip()

    def _simple_html_to_text(self, html: str) -> str:
        """Simple HTML to text conversion without dependencies."""
        # Remove script and style tags
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)

        # Replace block tags with newlines
        text = re.sub(r"</?(p|div|br|h[1-6]|li|tr)[^>]*>", "\n", text)

        # Remove remaining tags
        text = re.sub(r"<[^>]+>", "", text)

        # Decode HTML entities
        import html

        text = html.unescape(text)

        # Clean up whitespace
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)

        return text.strip()

    def _scan_content(self, content: str, safety_config: SafetyConfig) -> SafetyScanResult:
        """Scan content for PII and secrets."""
        pii_found: list[tuple[str, str, int]] = []
        secrets_found: list[tuple[str, str, int]] = []

        # Scan for PII if enabled
        if safety_config.pii_scan:
            for pii_type, pattern in PII_PATTERNS.items():
                for match in re.finditer(pattern, content):
                    pii_found.append((pii_type, match.group(), match.start()))

        # Scan for secrets if enabled
        if safety_config.secrets_scan:
            for secret_type, pattern in SECRET_PATTERNS.items():
                for match in re.finditer(pattern, content):
                    secrets_found.append((secret_type, match.group(), match.start()))

        passed = len(pii_found) == 0 and len(secrets_found) == 0

        # Redact if needed
        redacted_content = None
        if not passed and safety_config.redact_on_detect:
            redacted_content = content
            for _, match, _ in pii_found + secrets_found:
                redacted_content = redacted_content.replace(match, "[REDACTED]")

        return SafetyScanResult(
            passed=passed,
            pii_found=pii_found,
            secrets_found=secrets_found,
            redacted_content=redacted_content,
        )

    def _url_to_filename(self, url: str) -> str:
        """Convert URL to safe filename."""
        from urllib.parse import urlparse

        parsed = urlparse(url)

        # Use domain and path
        domain = parsed.netloc.replace(".", "_")
        path = parsed.path.strip("/").replace("/", "_")

        # Limit length and clean characters
        filename = f"{domain}_{path}"[:100]
        filename = re.sub(r"[^a-zA-Z0-9_-]", "_", filename)
        filename = re.sub(r"_+", "_", filename)

        return filename.strip("_") or "index"

    def _extract_title(self, content: str) -> str | None:
        """Extract title from Markdown content."""
        # Look for first heading
        match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if match:
            return match.group(1).strip()

        # Look for first line
        lines = content.strip().split("\n")
        if lines:
            first_line = lines[0].strip()
            if len(first_line) > 10 and len(first_line) < 200:
                return first_line

        return None

    def _estimate_noise_ratio(self, raw: str, normalized: str) -> float:
        """Estimate the ratio of noise in the content."""
        raw_len = len(raw)
        norm_len = len(normalized)

        if raw_len == 0:
            return 0.0

        # Noise is the content that was removed
        noise = 1.0 - (norm_len / raw_len)
        return max(0.0, min(1.0, noise))

    async def _write_metadata(self, output: CollectorOutput, evidence_dir: Path) -> None:
        """Write evidence metadata to JSON file."""
        metadata_path = evidence_dir / "metadata.json"

        metadata = {
            "run_id": self.context.run_id,
            "generated_at": datetime.now(UTC).isoformat(),
            "sources": [e.to_dict() for e in output.evidence_collected],
        }

        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        self.write_log(f"Wrote metadata for {len(output.evidence_collected)} evidence items")


def create_collector_input(
    scout_output: ScoutOutput,
    safety_config: SafetyConfig,
) -> CollectorInput:
    """Create CollectorInput from ScoutOutput."""
    return CollectorInput(
        source_manifest=scout_output.source_manifest,
        safety_config=safety_config,
        max_file_size_kb=safety_config.max_file_size_kb,
        allowed_filetypes=safety_config.allowed_filetypes,
    )
