#!/usr/bin/env python3
"""
Master orchestration script for Backbay Imperium asset generation.
Coordinates work across multiple RunPod GPU instances.

Usage:
    python orchestrate.py --config backbay_config.yaml
    python orchestrate.py --phase materials
    python orchestrate.py --phase all
"""

import asyncio
import os
import sys
import json
import yaml
import httpx
import argparse
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime


# Configuration
RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY", "rpa_7UZ1DB6HZ3QMTGSZRY47CO6T6DYUA6EAYZIWJACE1p2ofd")
RUNPOD_API_URL = "https://api.runpod.io/v2"

# Pod configuration
PODS = {
    "hunyuan3d_primary": {
        "id": "a7ngyriuo51nw",
        "name": "nitrogen-server-172227",
        "gpu": "H100 SXM",
        "cost_hr": 0.03,
    },
    "hunyuan3d_secondary": {
        "id": "5dnmft0dzhevu9",
        "name": "nitrogen-server-171140",
        "gpu": "H100 SXM",
        "cost_hr": 0.03,
    },
    "sdxl": {
        "id": "xyi9t1kbl7ll36",
        "name": "healthy_gold_sturgeon",
        "gpu": "H100 PCIe",
        "cost_hr": 0.01,
    },
    "chord": {
        "id": "1plxkvbhkv0zd3",
        "name": "sympathetic_amethyst_galliform-migration",
        "gpu": "RTX 4090",
        "cost_hr": 0.01,
    },
    "blender": {
        "id": "knzczmzw8ezt1c",
        "name": "sympathetic_amethyst_galliform",
        "gpu": "RTX 4090",
        "cost_hr": 0.01,
    },
}


@dataclass
class GenerationJob:
    """Represents a single asset generation job."""
    id: str
    asset_type: str
    prompt: str
    workflow: str
    pod: str
    status: str = "pending"
    result: Optional[Dict] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


@dataclass
class Phase:
    """Represents a generation phase."""
    name: str
    pod: str
    workflow: str
    assets: List[Dict]
    dependencies: List[str] = field(default_factory=list)


class AssetOrchestrator:
    """Orchestrates asset generation across multiple pods."""

    def __init__(self, config_path: Optional[str] = None):
        self.config = self._load_config(config_path)
        self.jobs: Dict[str, GenerationJob] = {}
        self.completed: List[str] = []
        self.failed: List[tuple] = []
        self.start_time = None
        self.http_client = None

    def _load_config(self, config_path: Optional[str]) -> Dict:
        """Load configuration from YAML file or defaults."""
        if config_path and Path(config_path).exists():
            with open(config_path) as f:
                return yaml.safe_load(f)
        return self._default_config()

    def _default_config(self) -> Dict:
        """Default configuration."""
        base_path = Path(__file__).parent.parent
        return {
            "output_dir": str(base_path / "assets"),
            "worlds_dir": str(base_path / "worlds"),
            "workflows_dir": str(base_path / "workflows"),
            "batch_size": 4,
            "retry_count": 2,
        }

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self.http_client is None:
            self.http_client = httpx.AsyncClient(timeout=300.0)
        return self.http_client

    async def start_pod(self, pod_name: str) -> Dict:
        """Start a RunPod serverless instance."""
        pod = PODS.get(pod_name)
        if not pod:
            raise ValueError(f"Unknown pod: {pod_name}")

        client = await self._get_http_client()

        # Check if already running
        status_resp = await client.get(
            f"{RUNPOD_API_URL}/{pod['id']}/status",
            headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"}
        )

        if status_resp.status_code == 200:
            status = status_resp.json()
            if status.get("status") == "RUNNING":
                print(f"Pod {pod_name} already running")
                return status

        # Start pod
        start_resp = await client.post(
            f"{RUNPOD_API_URL}/{pod['id']}/run",
            headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
            json={"input": {"command": "start"}}
        )

        return start_resp.json()

    async def submit_comfyui_job(self, pod_name: str, workflow: Dict, params: Dict) -> Dict:
        """Submit a job to ComfyUI on specified pod."""
        pod = PODS.get(pod_name)
        if not pod:
            raise ValueError(f"Unknown pod: {pod_name}")

        # Interpolate workflow with params
        workflow_str = json.dumps(workflow)
        for key, value in params.items():
            workflow_str = workflow_str.replace(f"{{{{{key}}}}}", str(value))
        workflow = json.loads(workflow_str)

        # Submit to ComfyUI
        client = await self._get_http_client()

        # Get pod endpoint
        pod_host = f"{pod['id']}.runpod.io"
        url = f"https://{pod_host}:8188/prompt"

        resp = await client.post(url, json={"prompt": workflow})
        return resp.json()

    async def wait_for_job(self, pod_name: str, job_id: str, timeout: int = 300) -> Dict:
        """Wait for a ComfyUI job to complete."""
        pod = PODS.get(pod_name)
        client = await self._get_http_client()

        pod_host = f"{pod['id']}.runpod.io"
        url = f"https://{pod_host}:8188/history/{job_id}"

        start = asyncio.get_event_loop().time()
        while asyncio.get_event_loop().time() - start < timeout:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status", {}).get("completed"):
                    return data
            await asyncio.sleep(2)

        raise TimeoutError(f"Job {job_id} timed out after {timeout}s")

    def load_world_config(self, world_name: str) -> Dict:
        """Load a world configuration file."""
        worlds_dir = Path(self.config["worlds_dir"])
        world_path = worlds_dir / f"{world_name}.yaml"

        if not world_path.exists():
            raise FileNotFoundError(f"World config not found: {world_path}")

        with open(world_path) as f:
            return yaml.safe_load(f)

    def load_workflow(self, workflow_name: str) -> Dict:
        """Load a ComfyUI workflow file."""
        workflows_dir = Path(self.config["workflows_dir"])
        workflow_path = workflows_dir / workflow_name

        if not workflow_path.exists():
            raise FileNotFoundError(f"Workflow not found: {workflow_path}")

        with open(workflow_path) as f:
            return json.load(f)

    async def run_phase(self, phase: Phase) -> List[str]:
        """Run a generation phase."""
        print(f"\n{'='*60}")
        print(f"PHASE: {phase.name}")
        print(f"Pod: {phase.pod} ({PODS[phase.pod]['gpu']})")
        print(f"Assets: {len(phase.assets)}")
        print(f"{'='*60}\n")

        # Start pod
        await self.start_pod(phase.pod)

        # Load workflow
        workflow = self.load_workflow(phase.workflow)

        # Process in batches
        batch_size = self.config.get("batch_size", 4)
        results = []

        for i in range(0, len(phase.assets), batch_size):
            batch = phase.assets[i:i+batch_size]
            print(f"Processing batch {i//batch_size + 1}/{(len(phase.assets) + batch_size - 1)//batch_size}")

            # Submit batch
            tasks = []
            for asset in batch:
                job = GenerationJob(
                    id=asset["id"],
                    asset_type=phase.name,
                    prompt=asset["prompt"],
                    workflow=phase.workflow,
                    pod=phase.pod,
                )
                self.jobs[job.id] = job

                task = self.submit_comfyui_job(
                    phase.pod,
                    workflow,
                    {
                        "id": asset["id"],
                        "prompt": asset["prompt"],
                        "seed": asset.get("seed", 42),
                        **asset.get("params", {})
                    }
                )
                tasks.append((job.id, task))

            # Wait for batch
            for job_id, task in tasks:
                try:
                    result = await task
                    self.jobs[job_id].status = "submitted"

                    # Wait for completion
                    final = await self.wait_for_job(phase.pod, result.get("prompt_id", ""))
                    self.jobs[job_id].status = "completed"
                    self.jobs[job_id].result = final
                    self.completed.append(job_id)
                    results.append(job_id)
                    print(f"  Completed: {job_id}")

                except Exception as e:
                    self.jobs[job_id].status = "failed"
                    self.jobs[job_id].error = str(e)
                    self.failed.append((job_id, str(e)))
                    print(f"  FAILED: {job_id} - {e}")

        return results

    async def run_materials(self):
        """Run materials generation phase."""
        world = self.load_world_config("materials")
        phase = Phase(
            name="materials",
            pod="chord",
            workflow="chord_material.json",
            assets=world.get("materials", [])
        )
        return await self.run_phase(phase)

    async def run_terrain(self):
        """Run terrain generation phase."""
        world = self.load_world_config("terrain")
        phase = Phase(
            name="terrain",
            pod="hunyuan3d_primary",
            workflow="hunyuan3d_hex_terrain.json",
            assets=self._expand_variants(world.get("meshes", []))
        )
        return await self.run_phase(phase)

    async def run_units(self):
        """Run units generation phase."""
        world = self.load_world_config("units")
        phase = Phase(
            name="units",
            pod="hunyuan3d_secondary",
            workflow="hunyuan3d_character.json",
            assets=world.get("meshes", [])
        )
        return await self.run_phase(phase)

    async def run_buildings(self):
        """Run buildings generation phase."""
        world = self.load_world_config("buildings")
        phase = Phase(
            name="buildings",
            pod="hunyuan3d_primary",
            workflow="hunyuan3d_architecture.json",
            assets=world.get("meshes", [])
        )
        return await self.run_phase(phase)

    async def run_leaders(self):
        """Run leader portraits generation phase."""
        world = self.load_world_config("leaders")
        phase = Phase(
            name="leaders",
            pod="sdxl",
            workflow="sdxl_portrait.json",
            assets=world.get("leaders", [])
        )
        return await self.run_phase(phase)

    async def run_resources(self):
        """Run resources generation phase."""
        world = self.load_world_config("resources")
        phase = Phase(
            name="resources",
            pod="hunyuan3d_primary",
            workflow="hunyuan3d_icon.json",
            assets=world.get("meshes", [])
        )
        return await self.run_phase(phase)

    def _expand_variants(self, assets: List[Dict]) -> List[Dict]:
        """Expand assets with variants into individual items."""
        expanded = []
        for asset in assets:
            variants = asset.get("variants", 1)
            for v in range(variants):
                variant_asset = asset.copy()
                variant_asset["id"] = f"{asset['id']}_v{v:02d}"
                variant_asset["seed"] = 42 + v
                expanded.append(variant_asset)
        return expanded

    async def run_all(self):
        """Run all generation phases."""
        self.start_time = datetime.now()

        print("\n" + "="*60)
        print("BACKBAY IMPERIUM ASSET GENERATION")
        print(f"Started: {self.start_time}")
        print("="*60)

        # Phase 1 & 2: Materials and Terrain (parallel)
        print("\n>>> Starting Phase 1 & 2 (Materials + Terrain) in parallel...")
        await asyncio.gather(
            self.run_materials(),
            self.run_terrain(),
        )

        # Phase 3, 4, 5: Units, Buildings, Portraits (parallel)
        print("\n>>> Starting Phase 3, 4, 5 (Units + Buildings + Portraits) in parallel...")
        await asyncio.gather(
            self.run_units(),
            self.run_buildings(),
            self.run_leaders(),
        )

        # Phase 6: Resources
        print("\n>>> Starting Phase 6 (Resources)...")
        await self.run_resources()

        # Summary
        elapsed = datetime.now() - self.start_time
        self._print_summary(elapsed)

    def _print_summary(self, elapsed):
        """Print final summary."""
        print("\n" + "="*60)
        print("GENERATION COMPLETE")
        print("="*60)
        print(f"Duration: {elapsed}")
        print(f"Completed: {len(self.completed)}")
        print(f"Failed: {len(self.failed)}")

        if self.failed:
            print("\nFailed assets:")
            for asset_id, error in self.failed:
                print(f"  - {asset_id}: {error}")

        # Cost estimate
        total_cost = 0
        for pod_name, pod in PODS.items():
            hours = elapsed.total_seconds() / 3600
            total_cost += pod["cost_hr"] * hours
        print(f"\nEstimated cost: ${total_cost:.2f}")

    async def cleanup(self):
        """Cleanup resources."""
        if self.http_client:
            await self.http_client.aclose()


async def main():
    parser = argparse.ArgumentParser(description="Backbay Imperium Asset Generator")
    parser.add_argument("--config", help="Path to config YAML")
    parser.add_argument("--phase", default="all",
                       choices=["all", "materials", "terrain", "units", "buildings", "leaders", "resources"],
                       help="Which phase to run")
    args = parser.parse_args()

    orchestrator = AssetOrchestrator(args.config)

    try:
        if args.phase == "all":
            await orchestrator.run_all()
        elif args.phase == "materials":
            await orchestrator.run_materials()
        elif args.phase == "terrain":
            await orchestrator.run_terrain()
        elif args.phase == "units":
            await orchestrator.run_units()
        elif args.phase == "buildings":
            await orchestrator.run_buildings()
        elif args.phase == "leaders":
            await orchestrator.run_leaders()
        elif args.phase == "resources":
            await orchestrator.run_resources()
    finally:
        await orchestrator.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
