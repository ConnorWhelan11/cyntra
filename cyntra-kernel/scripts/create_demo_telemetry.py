#!/usr/bin/env python
"""
Create demo telemetry file for testing the UI.
"""

import asyncio
from pathlib import Path

from cyntra.adapters.telemetry import TelemetryWriter


async def create_demo_telemetry():
    """Create a demo telemetry file."""
    # Find an existing workcell
    repo_root = Path(__file__).parent.parent.parent
    workcells_dir = repo_root / ".workcells"

    if not workcells_dir.exists():
        print("No workcells directory found. Creating demo workcell...")
        demo_wc = workcells_dir / "wc-demo-telemetry"
        demo_wc.mkdir(parents=True, exist_ok=True)
    else:
        # Use the most recent workcell
        workcells = sorted(workcells_dir.iterdir(), key=lambda x: x.stat().st_mtime)
        if workcells:
            demo_wc = workcells[-1]
        else:
            demo_wc = workcells_dir / "wc-demo-telemetry"
            demo_wc.mkdir(parents=True, exist_ok=True)

    telemetry_path = demo_wc / "telemetry.jsonl"

    print(f"Creating demo telemetry at: {telemetry_path}")

    telemetry = TelemetryWriter(telemetry_path)

    try:
        # Started event
        telemetry.started(
            toolchain="claude",
            model="opus",
            issue_id="1",
            workcell_id=demo_wc.name,
        )

        await asyncio.sleep(0.1)

        # Prompt sent
        prompt = """# Task: Walkable library v0.1 (spawn+colliders)

## Description
Create a Blender script that generates a walkable 3D library interior with:
- Floor plane with collision
- Multiple bookshelves with collision geometry
- Player spawn point
- Export to GLB with proper colliders

## Acceptance Criteria
- Floor is walkable
- Bookshelves have collision
- Exports to GLB format
- Includes spawn marker
"""
        telemetry.prompt_sent(prompt=prompt, tokens=150)

        await asyncio.sleep(0.2)

        # Response chunks simulating LLM working
        chunks = [
            "I'll help you create a walkable library interior in Blender.",
            "",
            "Let me start by examining the existing code structure...",
            "",
            "I found the Blender scripts in fab/. I'll create a new script for the library.",
            "",
            "Creating the library generation script...",
        ]

        for chunk in chunks:
            telemetry.response_chunk(content=chunk)
            await asyncio.sleep(0.05)

        # Tool calls
        telemetry.tool_call(
            tool="Read",
            args={"file_path": "fab/outora-library/scripts/generate_template.py"},
        )
        await asyncio.sleep(0.1)
        telemetry.tool_result(
            tool="Read",
            result="<file contents truncated>",
        )

        await asyncio.sleep(0.1)

        telemetry.response_chunk(
            content="Now I'll create the library generator with proper collision setup..."
        )
        await asyncio.sleep(0.05)

        telemetry.tool_call(
            tool="Write",
            args={"file_path": "fab/outora-library/scripts/generate_walkable_library.py"},
        )
        await asyncio.sleep(0.1)
        telemetry.tool_result(tool="Write", result="File written successfully")

        await asyncio.sleep(0.1)

        telemetry.response_chunk(content="Testing the script by running it...")
        await asyncio.sleep(0.05)

        telemetry.tool_call(
            tool="Bash",
            args={"command": "blender --background --python fab/outora-library/scripts/generate_walkable_library.py"},
        )
        await asyncio.sleep(0.3)
        telemetry.tool_result(
            tool="Bash",
            result="Blender 4.2.1\nGenerated library with 8 bookshelves\nExported to walkable_library_v0.1.glb",
            exit_code=0,
        )

        await asyncio.sleep(0.1)

        telemetry.response_chunk(
            content="The library has been generated successfully! Let me verify the GLB file..."
        )
        await asyncio.sleep(0.05)

        telemetry.tool_call(
            tool="Bash",
            args={"command": "ls -lh walkable_library_v0.1.glb"},
        )
        await asyncio.sleep(0.1)
        telemetry.tool_result(
            tool="Bash",
            result="-rw-r--r--  1 user  staff   2.4G Dec 18 17:18 walkable_library_v0.1.glb",
            exit_code=0,
        )

        await asyncio.sleep(0.1)

        telemetry.response_complete(
            content="Library generation complete! Created walkable_library_v0.1.glb with collision geometry for floor and bookshelves.",
            tokens=250,
        )

        await asyncio.sleep(0.1)

        # Completed successfully
        telemetry.completed(
            status="success",
            exit_code=0,
            duration_ms=12500,
        )

    finally:
        telemetry.close()

    print(f"Demo telemetry created successfully!")
    print(f"View it by opening the workcell in the desktop app: {demo_wc.name}")


if __name__ == "__main__":
    asyncio.run(create_demo_telemetry())
