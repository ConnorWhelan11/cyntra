"""
Modal app for scheduled research agent execution.

Deploys the Cyntra research pipeline to run on a schedule.

Usage:
    # Deploy the scheduled jobs
    modal deploy services/modal/research_scheduler.py

    # Run manually for testing
    modal run services/modal/research_scheduler.py::run_due_programs

    # Check logs
    modal app logs cyntra-research
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import modal

# =============================================================================
# Modal App Configuration
# =============================================================================

app = modal.App("cyntra-research")

# Image with all dependencies
# NOTE: add_local_dir must come LAST in the chain (Modal limitation)
research_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        # Core cyntra dependencies
        "pydantic>=2.0",
        "pyyaml>=6.0",
        "rich>=13.0",
        "click>=8.1",
        "structlog>=24.0",
        "aiofiles>=24.0",
        "gitpython>=3.1",
        "jsonschema>=4.20",
        "httpx>=0.27",
        # Research-specific
        "aiohttp",
        "anthropic",
        "firecrawl-py",
    )
    .env({"PYTHONPATH": "/app/src"})
    .add_local_dir(
        "/Users/connor/Medica/glia-fab/kernel/src",
        remote_path="/app/src",
    )
    .add_local_dir(
        "/Users/connor/Medica/glia-fab/knowledge/research",
        remote_path="/app/knowledge/research",
    )
)

# Persistent volume for run artifacts and memories
research_volume = modal.Volume.from_name("cyntra-research-data", create_if_missing=True)

# =============================================================================
# Helper Functions
# =============================================================================


def get_firecrawl_client():
    """Create Firecrawl client from secret."""
    from firecrawl import FirecrawlApp

    api_key = os.environ.get("FIRECRAWL_API_KEY")
    if not api_key:
        return None
    return FirecrawlApp(api_key=api_key)


def get_anthropic_client():
    """Create Anthropic client from secret."""
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    return anthropic.Anthropic(api_key=api_key)


class FirecrawlWrapper:
    """Async wrapper around Firecrawl client."""

    def __init__(self, client):
        self.client = client

    async def search(self, query: str, limit: int = 10):
        """Execute a search query."""
        if not self.client:
            return {"data": []}
        # firecrawl-py v4 uses keyword args
        result = self.client.search(query, limit=limit)
        # Result is a SearchData object with .web, .news, .images attributes
        # Web results are SearchResultWeb pydantic objects, convert to dicts
        raw_data = getattr(result, "web", None) or []
        data = []
        for item in raw_data:
            if hasattr(item, "model_dump"):
                data.append(item.model_dump())
            elif isinstance(item, dict):
                data.append(item)
        return {"data": data}

    async def scrape(self, url: str, formats: list[str] | None = None, **kwargs):
        """Scrape a URL."""
        if not self.client:
            return {}
        # firecrawl-py v4 uses snake_case params, convert from camelCase if present
        snake_kwargs = {}
        camel_to_snake = {
            "onlyMainContent": "only_main_content",
            "includeTags": "include_tags",
            "excludeTags": "exclude_tags",
            "waitFor": "wait_for",
            "skipTlsVerification": "skip_tls_verification",
            "removeBase64Images": "remove_base64_images",
            "fastMode": "fast_mode",
            "blockAds": "block_ads",
            "maxAge": "max_age",
            "storeInCache": "store_in_cache",
        }
        for k, v in kwargs.items():
            snake_key = camel_to_snake.get(k, k)
            snake_kwargs[snake_key] = v

        result = self.client.scrape(
            url, formats=formats or ["markdown"], **snake_kwargs
        )
        # Return as dict
        if hasattr(result, "model_dump"):
            return result.model_dump()
        return result if isinstance(result, dict) else {}

    async def map(self, url: str, limit: int = 50):
        """Map a URL to discover links."""
        if not self.client:
            return {"links": []}
        # firecrawl-py v4 uses keyword args
        result = self.client.map(url, limit=limit)
        # Result is a MapData object with .links containing LinkResult objects
        # Extract URLs from LinkResult objects
        links = []
        for link in getattr(result, "links", []):
            if hasattr(link, "url"):
                links.append(link.url)
            elif isinstance(link, str):
                links.append(link)
        return {"links": links}


class ClaudeWrapper:
    """Async wrapper for Claude LLM calls."""

    def __init__(self, client):
        self.client = client

    async def generate(
        self, prompt: str, temperature: float = 0.3, max_tokens: int = 4000
    ):
        """Generate a response from Claude."""
        if not self.client:
            return ""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text


# =============================================================================
# Modal Functions
# =============================================================================


@app.function(
    image=research_image,
    volumes={"/data": research_volume},
    secrets=[
        modal.Secret.from_name("anthropic-api-key"),
        modal.Secret.from_name("firecrawl-api-key"),
    ],
    timeout=1800,  # 30 minutes max
)
async def run_program(program_id: str):
    """Run a specific research program."""
    import sys

    sys.path.insert(0, "/app/src")

    from cyntra.research import Registry, ResearchRunner, RunnerConfig

    print(
        f"[{datetime.now(timezone.utc).isoformat()}] Starting research run: {program_id}"
    )

    # Setup paths
    repo_root = Path("/data/repo")
    repo_root.mkdir(parents=True, exist_ok=True)

    # Copy knowledge to volume if needed
    knowledge_src = Path("/app/knowledge/research")
    knowledge_dst = repo_root / "knowledge" / "research"
    if knowledge_src.exists() and not knowledge_dst.exists():
        import shutil

        knowledge_dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(knowledge_src, knowledge_dst)

    # Load registry
    registry = Registry.load(repo_root)
    program = registry.get_program(program_id)

    if not program:
        print(f"Program not found: {program_id}")
        return {"success": False, "error": f"Program not found: {program_id}"}

    # Create clients
    firecrawl = FirecrawlWrapper(get_firecrawl_client())
    llm = ClaudeWrapper(get_anthropic_client())

    # Run the program
    config = RunnerConfig(
        repo_root=repo_root,
        firecrawl_client=firecrawl,
        llm_client=llm,
    )

    runner = ResearchRunner(config)
    result = await runner.run(program)

    # Commit volume changes
    research_volume.commit()

    print(
        f"[{datetime.now(timezone.utc).isoformat()}] Run complete: {result.run.run_id}"
    )
    print(f"  Success: {result.success}")
    print(f"  Memories created: {result.run.memories_verified}")

    return {
        "success": result.success,
        "run_id": result.run.run_id,
        "memories_created": result.run.memories_verified,
        "error": result.error,
    }


@app.function(
    image=research_image,
    volumes={"/data": research_volume},
    secrets=[
        modal.Secret.from_name("anthropic-api-key"),
        modal.Secret.from_name("firecrawl-api-key"),
    ],
    schedule=modal.Cron("0 8 * * *"),  # Daily at 8am UTC
    timeout=3600,  # 1 hour max for all programs
)
async def run_due_programs():
    """Run all programs that are due according to their schedules."""
    import sys

    sys.path.insert(0, "/app/src")

    from cyntra.research import Registry, Scheduler

    print(f"[{datetime.now(timezone.utc).isoformat()}] Checking for due programs...")

    # Setup paths
    repo_root = Path("/data/repo")
    repo_root.mkdir(parents=True, exist_ok=True)

    # Copy knowledge to volume if needed
    knowledge_src = Path("/app/knowledge/research")
    knowledge_dst = repo_root / "knowledge" / "research"
    if knowledge_src.exists() and not knowledge_dst.exists():
        import shutil

        knowledge_dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(knowledge_src, knowledge_dst)

    # Load registry and check schedule
    registry = Registry.load(repo_root)
    scheduler = Scheduler(registry)

    due_programs = scheduler.get_due_programs(datetime.now(timezone.utc))

    if not due_programs:
        print("No programs due to run")
        return {"programs_run": 0, "results": []}

    print(f"Found {len(due_programs)} programs due to run")

    # Run each due program
    results = []
    for ranked in due_programs:
        program_id = ranked.program.program_id
        print(f"  Running: {program_id} (priority: {ranked.priority_score:.1f})")

        try:
            result = await run_program.remote.aio(program_id)
            results.append(result)
        except Exception as e:
            print(f"  Failed: {e}")
            results.append(
                {
                    "success": False,
                    "program_id": program_id,
                    "error": str(e),
                }
            )

    research_volume.commit()

    print(
        f"[{datetime.now(timezone.utc).isoformat()}] Completed {len(results)} programs"
    )
    return {"programs_run": len(results), "results": results}


@app.function(
    image=research_image,
    volumes={"/data": research_volume},
)
def list_memories():
    """List all memories in the knowledge base."""
    memories_dir = Path("/data/repo/.cyntra/memories/drafts")

    if not memories_dir.exists():
        return []

    memories = []
    for f in memories_dir.glob("*.md"):
        content = f.read_text()
        # Quick parse for title
        import re

        title_match = re.search(
            r"title:\s*[\"']?(.+?)[\"']?\s*$", content, re.MULTILINE
        )
        memories.append(
            {
                "file": f.name,
                "title": title_match.group(1) if title_match else "Untitled",
            }
        )

    return memories


@app.function(
    image=research_image,
    volumes={"/data": research_volume},
)
def get_run_history(limit: int = 20):
    """Get recent run history."""
    import sys

    sys.path.insert(0, "/app/src")

    from cyntra.research import Registry

    repo_root = Path("/data/repo")
    if not repo_root.exists():
        return []

    registry = Registry.load(repo_root)
    runs = list(registry.ledger.iter_runs(limit=limit))

    return [
        {
            "run_id": r.run_id,
            "program_id": r.program_id,
            "status": r.status.value,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "memories_verified": r.memories_verified,
        }
        for r in runs
    ]


# =============================================================================
# CLI Entry Points
# =============================================================================


@app.local_entrypoint()
def main(program_id: str = None):
    """
    Run research programs.

    Usage:
        modal run services/modal/research_scheduler.py  # Run all due programs
        modal run services/modal/research_scheduler.py --program-id cyntra_docs_radar  # Run specific program
    """
    if program_id:
        result = run_program.remote(program_id)
        print(f"Result: {result}")
    else:
        result = run_due_programs.remote()
        print(f"Result: {result}")
