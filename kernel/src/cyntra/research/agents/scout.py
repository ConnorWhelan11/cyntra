"""
Scout Agent - Discover and prioritize sources.

The Scout agent is the first step in the research pipeline:
1. Expand query templates with scope, year, keywords
2. Execute web searches via Firecrawl
3. Map discovered domains for additional URLs
4. Filter against allowlist/denylist
5. Deduplicate against prior evidence
6. Rank by relevance score
7. Return prioritized source manifest
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from cyntra.research.agents.base import AgentContext, AgentResult, BaseResearchAgent
from cyntra.research.models import WebSource


@dataclass
class SourceEntry:
    """A discovered source to collect."""

    url: str
    domain: str
    source_type: str = "web"  # web, documentation, tutorial, blog, discussion
    relevance_score: float = 0.5
    freshness_days: int | None = None
    justification: str = ""
    query: str | None = None  # The query that found this source
    content_hash: str | None = None  # For dedup with prior evidence

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "url": self.url,
            "domain": self.domain,
            "source_type": self.source_type,
            "relevance_score": self.relevance_score,
            "freshness_days": self.freshness_days,
            "justification": self.justification,
            "query": self.query,
            "content_hash": self.content_hash,
        }


@dataclass
class QueryResult:
    """Result from a single search query."""

    query: str
    source: str  # firecrawl_search, firecrawl_map, etc.
    success: bool
    sources_found: int
    error: str | None = None
    duration_ms: int = 0


@dataclass
class ScoutInput:
    """Input for the Scout agent."""

    # Query templates and keywords from program config
    query_templates: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    exclude_keywords: list[str] = field(default_factory=list)

    # Web sources from program config
    web_sources: list[WebSource] = field(default_factory=list)

    # Domain restrictions
    allowed_domains: list[str] = field(default_factory=list)
    blocked_domains: list[str] = field(default_factory=list)

    # Budget limits
    max_pages: int = 50
    freshness_days: int = 30

    # Prior evidence for deduplication
    prior_evidence_urls: list[str] = field(default_factory=list)


@dataclass
class ScoutOutput:
    """Output from the Scout agent."""

    source_manifest: list[SourceEntry] = field(default_factory=list)
    query_log: list[QueryResult] = field(default_factory=list)
    total_discovered: int = 0
    total_filtered: int = 0
    total_deduplicated: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "source_manifest": [s.to_dict() for s in self.source_manifest],
            "query_log": [
                {
                    "query": q.query,
                    "source": q.source,
                    "success": q.success,
                    "sources_found": q.sources_found,
                    "error": q.error,
                    "duration_ms": q.duration_ms,
                }
                for q in self.query_log
            ],
            "total_discovered": self.total_discovered,
            "total_filtered": self.total_filtered,
            "total_deduplicated": self.total_deduplicated,
        }


class ScoutAgent(BaseResearchAgent[ScoutInput, ScoutOutput]):
    """
    Scout agent for discovering and prioritizing sources.

    Uses Firecrawl for web searches and site mapping.
    """

    name = "scout"

    def __init__(self, context: AgentContext, firecrawl_client: Any | None = None):
        super().__init__(context)
        self._firecrawl = firecrawl_client

    async def execute(self, input_data: ScoutInput) -> AgentResult[ScoutOutput]:
        """Execute the scout agent to discover sources."""
        from datetime import datetime

        result = AgentResult[ScoutOutput](success=False, started_at=datetime.now(UTC))
        output = ScoutOutput()

        try:
            # 1. Expand query templates
            queries = self._expand_queries(input_data)
            self.logger.info(f"Expanded {len(queries)} queries from templates")

            # 2. Gather all source URLs from web sources config
            discovered_sources: list[SourceEntry] = []

            # 2a. Execute search queries
            for query in queries:
                sources, query_result = await self._execute_search(query, input_data)
                output.query_log.append(query_result)
                discovered_sources.extend(sources)

            # 2b. Map domains from web sources config
            for web_source in input_data.web_sources:
                sources, query_result = await self._map_domain(web_source, input_data)
                output.query_log.append(query_result)
                discovered_sources.extend(sources)

            output.total_discovered = len(discovered_sources)
            self.logger.info(f"Discovered {output.total_discovered} sources")

            # 3. Filter against allowlist/denylist
            filtered_sources = self._filter_domains(
                discovered_sources,
                input_data.allowed_domains,
                input_data.blocked_domains,
            )
            output.total_filtered = output.total_discovered - len(filtered_sources)
            self.logger.info(f"Filtered out {output.total_filtered} sources by domain")

            # 4. Deduplicate URLs
            deduped_sources = self._deduplicate_urls(filtered_sources)
            self.logger.info(f"Deduplicated to {len(deduped_sources)} unique sources")

            # 5. Deduplicate against prior evidence
            if input_data.prior_evidence_urls:
                prior_deduped = self._deduplicate_prior(
                    deduped_sources,
                    input_data.prior_evidence_urls,
                )
                output.total_deduplicated = len(deduped_sources) - len(prior_deduped)
                deduped_sources = prior_deduped
                self.logger.info(f"Removed {output.total_deduplicated} sources from prior evidence")

            # 6. Rank by relevance score
            ranked_sources = self._rank_sources(deduped_sources)

            # 7. Apply page limit
            limited_sources = ranked_sources[: input_data.max_pages]
            output.source_manifest = limited_sources

            self.logger.info(
                f"Scout complete: {len(limited_sources)} sources (limit: {input_data.max_pages})"
            )

            # Write source manifest to run directory
            await self._write_manifest(output)

            result.success = True
            result.output = output
            result.completed_at = datetime.now(UTC)

        except Exception as e:
            self.logger.error(f"Scout failed: {e}")
            result.success = False
            result.error = str(e)
            result.completed_at = datetime.now(UTC)

        return result

    def _expand_queries(self, input_data: ScoutInput) -> list[str]:
        """Expand query templates with placeholders."""
        scope = self.context.program.scope
        year = datetime.now(UTC).year
        keywords = input_data.keywords

        expanded = []

        # Expand templates
        for template in input_data.query_templates:
            query = template
            query = query.replace("{{scope}}", scope)
            query = query.replace("{{year}}", str(year))

            # Handle keyword lists
            if "{{keywords}}" in query:
                for keyword in keywords:
                    expanded.append(query.replace("{{keywords}}", keyword))
            else:
                expanded.append(query)

        # Add search queries from web sources
        for web_source in input_data.web_sources:
            for sq in web_source.search_queries:
                # Add site: restriction
                site_query = f"site:{web_source.domain} {sq}"
                expanded.append(site_query)

        # Deduplicate
        return list(dict.fromkeys(expanded))

    async def _execute_search(
        self, query: str, input_data: ScoutInput
    ) -> tuple[list[SourceEntry], QueryResult]:
        """Execute a search query using Firecrawl."""
        import time

        start_time = time.time()
        sources: list[SourceEntry] = []

        try:
            # Use Firecrawl search if available
            if self._firecrawl:
                results = await self._firecrawl_search(query, limit=10)
            else:
                # Fallback: simulate search results for testing
                results = []
                self.logger.debug(f"No Firecrawl client, skipping search: {query}")

            for result in results:
                url = result.get("url", "")
                if not url:
                    continue

                domain = self._extract_domain(url)
                source = SourceEntry(
                    url=url,
                    domain=domain,
                    source_type=self._classify_source(url, result),
                    relevance_score=result.get("relevance_score", 0.5),
                    freshness_days=result.get("freshness_days"),
                    justification=result.get("title", ""),
                    query=query,
                )
                sources.append(source)

            duration_ms = int((time.time() - start_time) * 1000)
            query_result = QueryResult(
                query=query,
                source="firecrawl_search",
                success=True,
                sources_found=len(sources),
                duration_ms=duration_ms,
            )

        except Exception as e:
            self.logger.warning(f"Search failed for query '{query}': {e}")
            query_result = QueryResult(
                query=query,
                source="firecrawl_search",
                success=False,
                sources_found=0,
                error=str(e),
            )

        return sources, query_result

    async def _map_domain(
        self, web_source: WebSource, input_data: ScoutInput
    ) -> tuple[list[SourceEntry], QueryResult]:
        """Map a domain to discover URLs using Firecrawl."""
        import time

        start_time = time.time()
        sources: list[SourceEntry] = []
        domain = web_source.domain

        try:
            # Use Firecrawl map if available
            if self._firecrawl:
                urls = await self._firecrawl_map(
                    f"https://{domain}",
                    limit=web_source.crawl_depth * 10,
                )
            else:
                # Fallback: construct URLs from paths
                urls = [f"https://{domain}{path}" for path in web_source.paths]
                self.logger.debug(f"No Firecrawl client, using paths for {domain}")

            for url in urls:
                # Filter by paths if specified
                if web_source.paths and web_source.paths != ["/"]:
                    path_match = any(path in url for path in web_source.paths if path != "/")
                    if not path_match:
                        continue

                source = SourceEntry(
                    url=url,
                    domain=domain,
                    source_type=self._classify_source(url, {}),
                    relevance_score=0.7,  # Default relevance for mapped URLs
                    justification=f"Mapped from {domain}",
                )
                sources.append(source)

            duration_ms = int((time.time() - start_time) * 1000)
            query_result = QueryResult(
                query=f"map:{domain}",
                source="firecrawl_map",
                success=True,
                sources_found=len(sources),
                duration_ms=duration_ms,
            )

        except Exception as e:
            self.logger.warning(f"Map failed for domain '{domain}': {e}")
            query_result = QueryResult(
                query=f"map:{domain}",
                source="firecrawl_map",
                success=False,
                sources_found=0,
                error=str(e),
            )

        return sources, query_result

    async def _firecrawl_search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Execute a Firecrawl search."""
        if not self._firecrawl:
            return []

        try:
            # Call Firecrawl search API
            response = await self._firecrawl.search(query=query, limit=limit)

            # Parse results
            results = []
            for item in response.get("data", []):
                results.append(
                    {
                        "url": item.get("url"),
                        "title": item.get("title", ""),
                        "description": item.get("description", ""),
                        "relevance_score": 0.8,  # Firecrawl results are pre-ranked
                    }
                )
            return results

        except Exception as e:
            self.logger.warning(f"Firecrawl search error: {e}")
            return []

    async def _firecrawl_map(self, url: str, limit: int = 50) -> list[str]:
        """Map a URL using Firecrawl to discover linked pages."""
        if not self._firecrawl:
            return []

        try:
            # Call Firecrawl map API
            response = await self._firecrawl.map(url=url, limit=limit)

            # Extract URLs
            return response.get("links", [])[:limit]

        except Exception as e:
            self.logger.warning(f"Firecrawl map error: {e}")
            return []

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL."""
        from urllib.parse import urlparse

        try:
            parsed = urlparse(url)
            return parsed.netloc.lower()
        except Exception:
            return ""

    def _classify_source(self, url: str, metadata: dict[str, Any]) -> str:
        """Classify the source type based on URL and metadata."""
        url_lower = url.lower()
        title_lower = metadata.get("title", "").lower()

        # Documentation
        if any(x in url_lower for x in ["/docs", "/documentation", "/api", "/reference", "/guide"]):
            return "documentation"

        # Changelog/releases
        if any(x in url_lower for x in ["/changelog", "/releases", "/release-notes"]):
            return "changelog"

        # Tutorial
        if any(x in url_lower for x in ["/tutorial", "/getting-started", "/quickstart"]):
            return "tutorial"
        if any(x in title_lower for x in ["tutorial", "how to", "guide"]):
            return "tutorial"

        # Blog
        if any(x in url_lower for x in ["/blog", "/posts", "/articles"]):
            return "blog"

        # Discussion/forum
        if any(
            x in url_lower
            for x in [
                "stackoverflow.com",
                "github.com/discussions",
                "github.com/issues",
                "news.ycombinator.com",
            ]
        ):
            return "discussion"

        return "web"

    def _filter_domains(
        self,
        sources: list[SourceEntry],
        allowed_domains: list[str],
        blocked_domains: list[str],
    ) -> list[SourceEntry]:
        """Filter sources by allowed/blocked domain lists."""
        filtered = []

        for source in sources:
            domain = source.domain.lower()

            # Check blocked first
            if any(self._domain_matches(domain, blocked) for blocked in blocked_domains):
                self.logger.debug(f"Blocked: {source.url}")
                continue

            # Check allowed (if allowlist exists)
            if allowed_domains and not any(
                self._domain_matches(domain, allowed) for allowed in allowed_domains
            ):
                self.logger.debug(f"Not in allowlist: {source.url}")
                continue

            filtered.append(source)

        return filtered

    def _domain_matches(self, domain: str, pattern: str) -> bool:
        """Check if domain matches a pattern (supports wildcards)."""
        pattern = pattern.lower()

        if pattern.startswith("*."):
            # Wildcard subdomain match
            suffix = pattern[1:]  # .example.com
            return domain.endswith(suffix) or domain == pattern[2:]
        else:
            # Exact match or subdomain match
            return domain == pattern or domain.endswith("." + pattern)

    def _deduplicate_urls(self, sources: list[SourceEntry]) -> list[SourceEntry]:
        """Deduplicate sources by URL (keep highest relevance)."""
        url_to_source: dict[str, SourceEntry] = {}

        for source in sources:
            # Normalize URL for comparison
            normalized_url = self._normalize_url(source.url)

            if normalized_url in url_to_source:
                # Keep the one with higher relevance
                if source.relevance_score > url_to_source[normalized_url].relevance_score:
                    url_to_source[normalized_url] = source
            else:
                url_to_source[normalized_url] = source

        return list(url_to_source.values())

    def _normalize_url(self, url: str) -> str:
        """Normalize URL for comparison."""
        from urllib.parse import urlparse, urlunparse

        try:
            parsed = urlparse(url.lower())
            # Remove trailing slashes, fragments, and common tracking params
            path = parsed.path.rstrip("/")
            normalized = urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))
            return normalized
        except Exception:
            return url.lower()

    def _deduplicate_prior(
        self, sources: list[SourceEntry], prior_urls: list[str]
    ) -> list[SourceEntry]:
        """Remove sources that were already collected in prior runs."""
        prior_normalized = {self._normalize_url(url) for url in prior_urls}

        return [
            source for source in sources if self._normalize_url(source.url) not in prior_normalized
        ]

    def _rank_sources(self, sources: list[SourceEntry]) -> list[SourceEntry]:
        """Rank sources by relevance score and source type priority."""
        # Source type priority (higher is better)
        type_priority = {
            "documentation": 1.0,
            "changelog": 0.9,
            "tutorial": 0.8,
            "blog": 0.6,
            "discussion": 0.4,
            "web": 0.5,
        }

        def score_key(source: SourceEntry) -> float:
            type_bonus = type_priority.get(source.source_type, 0.5)
            # Combine relevance score with type bonus (weighted)
            combined = source.relevance_score * 0.7 + type_bonus * 0.3
            return combined

        return sorted(sources, key=score_key, reverse=True)

    async def _write_manifest(self, output: ScoutOutput) -> None:
        """Write the source manifest to the run directory."""
        manifest_path = self.context.run_dir / "source_manifest.json"

        with open(manifest_path, "w") as f:
            json.dump(output.to_dict(), f, indent=2)

        self.write_log(f"Wrote source manifest with {len(output.source_manifest)} sources")


# Convenience function for creating scout input from program config
def create_scout_input(
    context: AgentContext,
    global_allowlist: list[str] | None = None,
    global_denylist: list[str] | None = None,
) -> ScoutInput:
    """Create ScoutInput from AgentContext and program config."""
    program = context.program

    # Merge domain lists
    allowed = list(global_allowlist or [])
    allowed.extend(program.safety.domain_allowlist)

    blocked = list(global_denylist or [])
    blocked.extend(program.safety.domain_denylist)

    # Get prior evidence URLs
    prior_urls = [e.get("url", "") for e in context.prior_evidence if e.get("url")]

    return ScoutInput(
        query_templates=program.queries.templates,
        keywords=program.queries.keywords,
        exclude_keywords=program.queries.exclude_keywords,
        web_sources=program.sources.web,
        allowed_domains=allowed,
        blocked_domains=blocked,
        max_pages=program.budgets.max_pages,
        freshness_days=program.diff_mode.stale_threshold_hours // 24,
        prior_evidence_urls=prior_urls,
    )
