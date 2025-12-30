#!/usr/bin/env python3
"""
Backbay Imperium Audio Generator

Automated batch generation of game audio using:
- Suno API (via gcui-art/suno-api) for music themes
- ElevenLabs API for UI sound effects
- Optional: Stability AI for ambiance

Usage:
    python generate.py --phase style_tests
    python generate.py --phase era_themes
    python generate.py --phase ui_sfx
    python generate.py --all
"""

import os
import sys
import time
import json
import yaml
import httpx
import asyncio
import argparse
from pathlib import Path
from dataclasses import dataclass
from typing import Optional
from datetime import datetime


# ============================================================================
# CONFIGURATION
# ============================================================================

@dataclass
class Config:
    suno_url: str
    elevenlabs_key: str
    stability_key: Optional[str]
    output_base: Path

    @classmethod
    def from_env(cls, config_path: Path) -> "Config":
        with open(config_path) as f:
            cfg = yaml.safe_load(f)

        return cls(
            suno_url=os.environ.get("SUNO_API_URL", "http://localhost:3000"),
            elevenlabs_key=os.environ.get("ELEVENLABS_API_KEY", ""),
            stability_key=os.environ.get("STABILITY_API_KEY"),
            output_base=Path(cfg["output"]["base_dir"])
        )


# ============================================================================
# SUNO API CLIENT (for music generation)
# ============================================================================

class SunoClient:
    """Client for gcui-art/suno-api self-hosted server"""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=30.0)

    def check_health(self) -> bool:
        """Check if Suno API is running"""
        try:
            resp = self.client.get(f"{self.base_url}/api/get_limit")
            return resp.status_code == 200
        except Exception as e:
            print(f"Suno API health check failed: {e}")
            return False

    def get_credits(self) -> dict:
        """Get remaining credits"""
        resp = self.client.get(f"{self.base_url}/api/get_limit")
        return resp.json()

    def generate(self, prompt: str, make_instrumental: bool = True) -> list[dict]:
        """Generate music from prompt, returns list of track info"""
        resp = self.client.post(
            f"{self.base_url}/api/generate",
            json={
                "prompt": prompt,
                "make_instrumental": make_instrumental,
                "wait_audio": False  # Async generation
            }
        )
        return resp.json()

    def custom_generate(
        self,
        prompt: str,
        title: str,
        tags: str = "",
        make_instrumental: bool = True
    ) -> list[dict]:
        """Generate with custom mode (more control)"""
        resp = self.client.post(
            f"{self.base_url}/api/custom_generate",
            json={
                "prompt": prompt,
                "title": title,
                "tags": tags,
                "make_instrumental": make_instrumental,
                "wait_audio": False
            }
        )
        return resp.json()

    def get_audio_info(self, audio_ids: list[str]) -> list[dict]:
        """Get info/status for audio IDs"""
        ids_str = ",".join(audio_ids)
        resp = self.client.get(f"{self.base_url}/api/get?ids={ids_str}")
        return resp.json()

    def wait_for_completion(
        self,
        audio_ids: list[str],
        poll_interval: int = 5,
        max_wait: int = 300
    ) -> list[dict]:
        """Poll until all tracks are complete"""
        start = time.time()
        while time.time() - start < max_wait:
            info = self.get_audio_info(audio_ids)
            all_done = all(
                track.get("status") in ("streaming", "complete", "error")
                for track in info
            )
            if all_done:
                return info
            print(f"  Waiting... ({int(time.time() - start)}s)")
            time.sleep(poll_interval)
        raise TimeoutError(f"Generation timed out after {max_wait}s")

    def download_audio(self, audio_url: str, output_path: Path):
        """Download audio file from URL"""
        resp = self.client.get(audio_url)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(resp.content)
        print(f"  Downloaded: {output_path}")


# ============================================================================
# ELEVENLABS API CLIENT (for SFX generation)
# ============================================================================

class ElevenLabsClient:
    """Client for ElevenLabs Sound Effects API"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.elevenlabs.io/v1"
        self.client = httpx.Client(timeout=60.0)

    def check_health(self) -> bool:
        """Check API key validity"""
        if not self.api_key:
            return False
        try:
            resp = self.client.get(
                f"{self.base_url}/user",
                headers={"xi-api-key": self.api_key}
            )
            return resp.status_code == 200
        except Exception as e:
            print(f"ElevenLabs health check failed: {e}")
            return False

    def get_subscription_info(self) -> dict:
        """Get subscription/credits info"""
        resp = self.client.get(
            f"{self.base_url}/user/subscription",
            headers={"xi-api-key": self.api_key}
        )
        return resp.json()

    def generate_sfx(
        self,
        prompt: str,
        duration_seconds: Optional[float] = None,
        prompt_influence: float = 0.3
    ) -> bytes:
        """Generate sound effect from text prompt"""
        payload = {
            "text": prompt,
            "prompt_influence": prompt_influence
        }
        if duration_seconds:
            payload["duration_seconds"] = duration_seconds

        resp = self.client.post(
            f"{self.base_url}/sound-generation",
            headers={
                "xi-api-key": self.api_key,
                "Content-Type": "application/json"
            },
            json=payload
        )

        if resp.status_code != 200:
            raise Exception(f"SFX generation failed: {resp.text}")

        return resp.content

    def save_sfx(self, audio_data: bytes, output_path: Path):
        """Save audio data to file"""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(audio_data)
        print(f"  Downloaded: {output_path}")


# ============================================================================
# GENERATION ORCHESTRATOR
# ============================================================================

class AudioGenerator:
    """Main orchestrator for audio generation"""

    def __init__(self, config_path: Path):
        self.config_path = config_path
        with open(config_path) as f:
            self.config = yaml.safe_load(f)

        self.base_dir = Path(self.config["output"]["base_dir"])

        # Initialize clients
        self.suno = SunoClient(
            os.environ.get("SUNO_API_URL", "http://localhost:3000")
        )
        self.elevenlabs = ElevenLabsClient(
            os.environ.get("ELEVENLABS_API_KEY", "")
        )

    def check_apis(self) -> dict[str, bool]:
        """Check which APIs are available"""
        return {
            "suno": self.suno.check_health(),
            "elevenlabs": self.elevenlabs.check_health()
        }

    # --------------------------------------------------------------------------
    # PHASE 0: Style Tests
    # --------------------------------------------------------------------------

    def generate_style_tests(self):
        """Generate style test tracks"""
        print("\n" + "="*60)
        print("PHASE 0: Style Tests")
        print("="*60)

        if not self.suno.check_health():
            print("ERROR: Suno API not available. Start suno-api first.")
            return

        style_cfg = self.config["style_tests"]
        output_dir = self.base_dir / style_cfg["output_dir"]
        output_dir.mkdir(parents=True, exist_ok=True)

        for prompt_cfg in style_cfg["prompts"]:
            prompt_id = prompt_cfg["id"]
            prompt_text = prompt_cfg["prompt"]

            print(f"\n[{prompt_id}] Generating...")

            try:
                # Generate
                result = self.suno.generate(prompt_text, make_instrumental=True)
                audio_ids = [track["id"] for track in result]

                # Wait for completion
                completed = self.suno.wait_for_completion(audio_ids)

                # Download
                for i, track in enumerate(completed):
                    if track.get("audio_url"):
                        suffix = chr(ord('a') + i)  # a, b, c...
                        output_path = output_dir / f"{prompt_id}_{suffix}.mp3"
                        self.suno.download_audio(track["audio_url"], output_path)
                    else:
                        print(f"  WARNING: No audio URL for {prompt_id} variant {i}")

            except Exception as e:
                print(f"  ERROR: {e}")
                continue

        print(f"\nStyle tests complete! Check: {output_dir}")

    # --------------------------------------------------------------------------
    # PHASE 1: Era Themes
    # --------------------------------------------------------------------------

    def generate_era_themes(self):
        """Generate main era theme tracks"""
        print("\n" + "="*60)
        print("PHASE 1: Era Themes")
        print("="*60)

        if not self.suno.check_health():
            print("ERROR: Suno API not available.")
            return

        theme_cfg = self.config["era_themes"]
        output_dir = self.base_dir / theme_cfg["output_dir"]
        output_dir.mkdir(parents=True, exist_ok=True)

        for track_cfg in theme_cfg["tracks"]:
            track_id = track_cfg["id"]
            track_name = track_cfg["name"]
            prompt_text = track_cfg["prompt"]

            print(f"\n[{track_id}] {track_name}")
            print(f"  Generating {theme_cfg['variations_per_prompt']} variations...")

            try:
                result = self.suno.generate(prompt_text, make_instrumental=True)
                audio_ids = [track["id"] for track in result]

                completed = self.suno.wait_for_completion(audio_ids)

                for i, track in enumerate(completed):
                    if track.get("audio_url"):
                        output_path = output_dir / f"{track_id}_v{i+1}.mp3"
                        self.suno.download_audio(track["audio_url"], output_path)

            except Exception as e:
                print(f"  ERROR: {e}")
                continue

        print(f"\nEra themes complete! Check: {output_dir}")

    # --------------------------------------------------------------------------
    # PHASE 2: UI SFX
    # --------------------------------------------------------------------------

    def generate_ui_sfx(self):
        """Generate UI sound effects"""
        print("\n" + "="*60)
        print("PHASE 2: UI Sound Effects")
        print("="*60)

        if not self.elevenlabs.check_health():
            print("ERROR: ElevenLabs API not available. Set ELEVENLABS_API_KEY.")
            return

        sfx_cfg = self.config["ui_sfx"]
        output_dir = self.base_dir / sfx_cfg["output_dir"]
        output_dir.mkdir(parents=True, exist_ok=True)

        for sound_cfg in sfx_cfg["sounds"]:
            sound_id = sound_cfg["id"]
            prompt_text = sound_cfg["prompt"]
            duration = sound_cfg.get("duration")

            print(f"\n[{sound_id}] Generating...")

            try:
                audio_data = self.elevenlabs.generate_sfx(
                    prompt=prompt_text,
                    duration_seconds=duration,
                    prompt_influence=0.5  # Higher for more literal interpretation
                )

                output_path = output_dir / f"{sound_id}.mp3"
                self.elevenlabs.save_sfx(audio_data, output_path)

            except Exception as e:
                print(f"  ERROR: {e}")
                continue

        print(f"\nUI SFX complete! Check: {output_dir}")

    # --------------------------------------------------------------------------
    # PHASE 4: Civ Motifs
    # --------------------------------------------------------------------------

    def generate_civ_motifs(self):
        """Generate civilization motifs"""
        print("\n" + "="*60)
        print("PHASE 4: Civilization Motifs")
        print("="*60)

        if not self.suno.check_health():
            print("ERROR: Suno API not available.")
            return

        motif_cfg = self.config["civ_motifs"]
        output_dir = self.base_dir / motif_cfg["output_dir"]
        output_dir.mkdir(parents=True, exist_ok=True)

        for track_cfg in motif_cfg["tracks"]:
            track_id = track_cfg["id"]
            track_name = track_cfg["name"]
            prompt_text = track_cfg["prompt"]

            print(f"\n[{track_id}] {track_name}")

            try:
                result = self.suno.generate(prompt_text, make_instrumental=True)
                audio_ids = [track["id"] for track in result]

                completed = self.suno.wait_for_completion(audio_ids)

                for i, track in enumerate(completed):
                    if track.get("audio_url"):
                        output_path = output_dir / f"{track_id}_v{i+1}.mp3"
                        self.suno.download_audio(track["audio_url"], output_path)

            except Exception as e:
                print(f"  ERROR: {e}")
                continue

        print(f"\nCiv motifs complete! Check: {output_dir}")

    # --------------------------------------------------------------------------
    # PHASE 5: Wonder Fanfares
    # --------------------------------------------------------------------------

    def generate_fanfares(self):
        """Generate wonder completion fanfares"""
        print("\n" + "="*60)
        print("PHASE 5: Wonder Fanfares")
        print("="*60)

        if not self.suno.check_health():
            print("ERROR: Suno API not available.")
            return

        fanfare_cfg = self.config["wonder_fanfares"]
        output_dir = self.base_dir / fanfare_cfg["output_dir"]
        output_dir.mkdir(parents=True, exist_ok=True)

        for track_cfg in fanfare_cfg["tracks"]:
            track_id = track_cfg["id"]
            track_name = track_cfg["name"]
            prompt_text = track_cfg["prompt"]

            print(f"\n[{track_id}] {track_name}")

            try:
                result = self.suno.generate(prompt_text, make_instrumental=True)
                audio_ids = [track["id"] for track in result]

                completed = self.suno.wait_for_completion(audio_ids)

                for i, track in enumerate(completed):
                    if track.get("audio_url"):
                        output_path = output_dir / f"{track_id}_v{i+1}.mp3"
                        self.suno.download_audio(track["audio_url"], output_path)

            except Exception as e:
                print(f"  ERROR: {e}")
                continue

        print(f"\nFanfares complete! Check: {output_dir}")

    # --------------------------------------------------------------------------
    # PHASE 6: Ambiance
    # --------------------------------------------------------------------------

    def generate_ambiance(self):
        """Generate ambiance loops"""
        print("\n" + "="*60)
        print("PHASE 6: Ambiance Loops")
        print("="*60)

        if not self.elevenlabs.check_health():
            print("ERROR: ElevenLabs API not available.")
            return

        amb_cfg = self.config["ambiance"]
        output_dir = self.base_dir / amb_cfg["output_dir"]
        output_dir.mkdir(parents=True, exist_ok=True)

        for loop_cfg in amb_cfg["loops"]:
            loop_id = loop_cfg["id"]
            prompt_text = loop_cfg["prompt"]
            duration = loop_cfg.get("duration", 30)

            print(f"\n[{loop_id}] Generating {duration}s loop...")

            try:
                audio_data = self.elevenlabs.generate_sfx(
                    prompt=prompt_text,
                    duration_seconds=duration,
                    prompt_influence=0.3  # Lower for more variation
                )

                output_path = output_dir / f"{loop_id}.mp3"
                self.elevenlabs.save_sfx(audio_data, output_path)

            except Exception as e:
                print(f"  ERROR: {e}")
                continue

        print(f"\nAmbiance loops complete! Check: {output_dir}")

    # --------------------------------------------------------------------------
    # Run All
    # --------------------------------------------------------------------------

    def run_all(self):
        """Run all generation phases"""
        apis = self.check_apis()
        print("\nAPI Status:")
        for api, available in apis.items():
            status = "OK" if available else "NOT AVAILABLE"
            print(f"  {api}: {status}")

        if apis["suno"]:
            self.generate_style_tests()
            self.generate_era_themes()
            self.generate_civ_motifs()
            self.generate_fanfares()

        if apis["elevenlabs"]:
            self.generate_ui_sfx()
            self.generate_ambiance()

        print("\n" + "="*60)
        print("ALL PHASES COMPLETE!")
        print("="*60)


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Backbay Imperium Audio Generator")
    parser.add_argument(
        "--phase",
        choices=["style_tests", "era_themes", "ui_sfx", "civ_motifs", "fanfares", "ambiance"],
        help="Run specific phase"
    )
    parser.add_argument("--all", action="store_true", help="Run all phases")
    parser.add_argument("--check", action="store_true", help="Check API availability")
    parser.add_argument(
        "--config",
        default="fab/backbay-imperium/audio/generator/config.yaml",
        help="Path to config file"
    )

    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"Config not found: {config_path}")
        sys.exit(1)

    generator = AudioGenerator(config_path)

    if args.check:
        apis = generator.check_apis()
        print("\nAPI Status:")
        for api, available in apis.items():
            status = "OK" if available else "NOT AVAILABLE"
            print(f"  {api}: {status}")

        if apis["suno"]:
            credits = generator.suno.get_credits()
            print(f"\nSuno Credits: {credits.get('credits_left', 'unknown')}")

        if apis["elevenlabs"]:
            try:
                sub = generator.elevenlabs.get_subscription_info()
                chars = sub.get("character_count", 0)
                limit = sub.get("character_limit", 0)
                print(f"ElevenLabs: {chars}/{limit} characters used")
            except:
                pass

        sys.exit(0)

    if args.all:
        generator.run_all()
    elif args.phase == "style_tests":
        generator.generate_style_tests()
    elif args.phase == "era_themes":
        generator.generate_era_themes()
    elif args.phase == "ui_sfx":
        generator.generate_ui_sfx()
    elif args.phase == "civ_motifs":
        generator.generate_civ_motifs()
    elif args.phase == "fanfares":
        generator.generate_fanfares()
    elif args.phase == "ambiance":
        generator.generate_ambiance()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
