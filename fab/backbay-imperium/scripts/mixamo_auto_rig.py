#!/usr/bin/env python3
"""
Automated Mixamo rigging using browser automation.

This script uses Playwright to automate the Mixamo website:
1. Uploads each FBX file
2. Waits for auto-rigging
3. Applies standard animations
4. Downloads rigged characters

Requirements:
    pip install playwright
    playwright install chromium

Usage:
    # Step 1: Start Chrome with debugging enabled
    /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222

    # Step 2: Manually login to mixamo.com in Chrome

    # Step 3: Run the script to automate rigging
    python mixamo_auto_rig.py --rig-all
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

try:
    from playwright.async_api import async_playwright, Page, Browser, BrowserContext
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False
    print("Playwright not installed. Install with: pip install playwright && playwright install chromium")

# Paths
SCRIPT_DIR = Path(__file__).parent
ASSETS_DIR = SCRIPT_DIR.parent / "assets"
FBX_DIR = ASSETS_DIR / "units" / "fbx_for_mixamo"
RIGGED_DIR = ASSETS_DIR / "units" / "rigged"
SESSION_FILE = SCRIPT_DIR / ".mixamo_session.json"

# Animation presets to download
ANIMATIONS = {
    "idle": "Breathing Idle",
    "walk": "Walking",
    "run": "Running",
    "attack_sword": "Great Sword Slash",
    "attack_bow": "Standing Aim Bow Draw",
    "death": "Falling Back Death",
    "victory": "Victory",
}


class MixamoAutomation:
    """Automate Mixamo rigging via browser."""

    def __init__(self):
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None
        self.connected_to_existing = False

    async def start(self, headless: bool = False, use_existing_chrome: bool = True):
        """Start browser session.

        If use_existing_chrome=True, connects to Chrome running with --remote-debugging-port=9222.
        This bypasses Google's automated browser detection for OAuth.
        """
        self.playwright = await async_playwright().start()

        if use_existing_chrome:
            try:
                # Connect to existing Chrome with debugging enabled
                self.browser = await self.playwright.chromium.connect_over_cdp("http://localhost:9222")
                self.connected_to_existing = True

                # Get existing context and page
                contexts = self.browser.contexts
                if contexts:
                    self.context = contexts[0]
                    pages = self.context.pages
                    # Find mixamo tab or create new one
                    for page in pages:
                        if "mixamo" in page.url.lower():
                            self.page = page
                            break
                    if not self.page:
                        self.page = await self.context.new_page()
                else:
                    self.context = await self.browser.new_context()
                    self.page = await self.context.new_page()

                print("Connected to existing Chrome browser")

            except Exception as e:
                print(f"Failed to connect to Chrome: {e}")
                print("\nPlease start Chrome with debugging enabled:")
                print('  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222')
                print("\nThen login to mixamo.com manually and run this script again.")
                sys.exit(1)
        else:
            # Fallback: launch new browser (won't work with Google OAuth)
            self.browser = await self.playwright.chromium.launch(headless=headless)
            if SESSION_FILE.exists():
                self.context = await self.browser.new_context(storage_state=str(SESSION_FILE))
            else:
                self.context = await self.browser.new_context()
            self.page = await self.context.new_page()

    async def stop(self):
        """Stop browser session."""
        # Don't close browser if we connected to existing Chrome
        if self.browser and not self.connected_to_existing:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def login(self):
        """Login to Mixamo and save session."""
        await self.page.goto("https://www.mixamo.com/")

        print("Please login to Mixamo in the browser window...")
        print("Press Enter when logged in...")

        # Wait for user to login
        await self.page.wait_for_url("**/mixamo.com/**", timeout=300000)

        # Check if logged in by looking for upload button
        try:
            await self.page.wait_for_selector("text=Upload Character", timeout=30000)
            print("Login successful!")

            # Save session
            await self.page.context.storage_state(path=str(SESSION_FILE))
            print(f"Session saved to {SESSION_FILE}")

        except Exception as e:
            print(f"Login check failed: {e}")

    async def is_logged_in(self) -> bool:
        """Check if logged into Mixamo."""
        await self.page.goto("https://www.mixamo.com/")
        await self.page.wait_for_load_state("networkidle")

        try:
            await self.page.wait_for_selector("text=Upload Character", timeout=10000)
            return True
        except:
            return False

    async def upload_character(self, fbx_path: Path) -> bool:
        """Upload a character FBX to Mixamo."""
        print(f"Uploading {fbx_path.name}...")

        # Click upload button (try multiple selectors)
        try:
            await self.page.click("text=Upload Character", timeout=5000)
        except:
            await self.page.click("button:has-text('UPLOAD CHARACTER')", timeout=5000)

        await asyncio.sleep(1)

        # Find the file input (it may be hidden)
        file_input = await self.page.wait_for_selector('input[type="file"]', state="attached", timeout=10000)
        await file_input.set_input_files(str(fbx_path))

        # Wait for processing
        print("  Waiting for auto-rig...")
        try:
            # Wait for the upload to complete and character to load
            # Look for the rigging interface or character preview
            await asyncio.sleep(3)

            # Wait for rigging completion - look for the download button or animation panel
            await self.page.wait_for_selector("text=Download", timeout=180000)

            print("  Auto-rig complete!")
            return True

        except Exception as e:
            print(f"  Auto-rig failed: {e}")
            return False

    async def close_modals(self):
        """Close any open modal dialogs."""
        # Try multiple ways to close modals
        try:
            # Press Escape multiple times
            await self.page.keyboard.press("Escape")
            await asyncio.sleep(0.3)
            await self.page.keyboard.press("Escape")
            await asyncio.sleep(0.3)

            # Click close button if exists
            close_btns = await self.page.query_selector_all('.modal .close, .modal-close, [aria-label="Close"], button.close')
            for btn in close_btns:
                try:
                    await btn.click(force=True)
                    await asyncio.sleep(0.3)
                except:
                    pass

            # Click outside modal
            try:
                await self.page.click('.modal-backdrop', force=True)
            except:
                pass

        except:
            pass

    async def apply_animation(self, anim_name: str) -> bool:
        """Apply an animation to the current character."""
        print(f"  Applying animation: {anim_name}")

        try:
            # Close any open modals first
            await self.close_modals()
            await asyncio.sleep(0.5)

            # Click on Animations tab if not already there
            try:
                anim_tab = await self.page.query_selector('a:has-text("Animations"), [href*="animations"]')
                if anim_tab:
                    await anim_tab.click(force=True)
                    await asyncio.sleep(1)
            except:
                pass

            # Find and clear search input
            search_input = await self.page.wait_for_selector('input[type="search"], input[placeholder*="Search"], .search-input input', timeout=5000)
            await search_input.click()
            await search_input.fill("")
            await asyncio.sleep(0.5)
            await search_input.fill(anim_name)
            await asyncio.sleep(2)  # Wait for search results

            # Scroll down past the search options
            await self.page.evaluate("window.scrollBy(0, 200)")
            await asyncio.sleep(0.5)

            # Click first animation result - use evaluate to click directly
            clicked = await self.page.evaluate("""() => {
                const items = document.querySelectorAll('.product-card, .product-image, [class*="animation-item"]');
                if (items.length > 0) {
                    items[0].click();
                    return true;
                }
                return false;
            }""")

            if clicked:
                await asyncio.sleep(3)  # Wait for animation to load
                return True

            # Fallback: try force click
            try:
                anim_item = await self.page.query_selector('.product-card, .product-image')
                if anim_item:
                    await anim_item.click(force=True)
                    await asyncio.sleep(3)
                    return True
            except:
                pass

            return False

        except Exception as e:
            print(f"  Animation not found: {anim_name} ({e})")
            return False

    async def download_character(self, output_path: Path, with_skin: bool = True):
        """Download the rigged character."""
        print(f"  Downloading to {output_path.name}...")

        # Close any open modal dialogs first
        try:
            close_btn = await self.page.query_selector('.modal .close, [aria-label="Close"]')
            if close_btn:
                await close_btn.click()
                await asyncio.sleep(0.5)
        except:
            pass

        # Press Escape to close any modals
        await self.page.keyboard.press("Escape")
        await asyncio.sleep(0.5)

        # Click download button - use force to bypass intercepts
        download_btn = await self.page.wait_for_selector('button:has-text("Download")', timeout=10000)
        await download_btn.click(force=True)

        # Wait for download modal
        await asyncio.sleep(2)

        # Look for format dropdown in the download modal
        try:
            format_select = await self.page.query_selector('select, .dropdown-toggle')
            if format_select:
                # Try to select FBX format
                await format_select.click()
                await asyncio.sleep(0.5)
                fbx_option = await self.page.query_selector('text=FBX Binary')
                if fbx_option:
                    await fbx_option.click()
        except Exception as e:
            print(f"  Format selection skipped: {e}")

        # Start download - find the download button in the modal
        await asyncio.sleep(1)
        try:
            async with self.page.expect_download(timeout=60000) as download_info:
                # Try multiple selectors for the download button in modal
                modal_download = await self.page.query_selector('.modal button:has-text("DOWNLOAD"), .modal button.btn-primary')
                if modal_download:
                    await modal_download.click(force=True)
                else:
                    await self.page.click('button:has-text("DOWNLOAD")', force=True)

            download = await download_info.value
            output_path.parent.mkdir(parents=True, exist_ok=True)
            await download.save_as(str(output_path))
            print(f"  Downloaded: {output_path}")

        except Exception as e:
            print(f"  Download failed: {e}")
            # Close the modal
            await self.page.keyboard.press("Escape")

    async def rig_unit(self, fbx_path: Path, output_dir: Path, with_animations: bool = False):
        """Complete rigging workflow for one unit."""
        unit_name = fbx_path.stem
        unit_output_dir = output_dir / unit_name
        unit_output_dir.mkdir(parents=True, exist_ok=True)

        rigged_path = unit_output_dir / f"{unit_name}_rigged.fbx"

        # Skip if already rigged
        if rigged_path.exists() and rigged_path.stat().st_size > 10000:
            print(f"  Already rigged: {rigged_path}")
            return True

        # Upload and auto-rig
        if not await self.upload_character(fbx_path):
            return False

        # Download base rigged character
        await self.download_character(rigged_path)

        # Optionally apply and download animations
        if with_animations:
            for anim_id, anim_name in ANIMATIONS.items():
                if await self.apply_animation(anim_name):
                    anim_path = unit_output_dir / f"{unit_name}_{anim_id}.fbx"
                    await self.download_character(anim_path, with_skin=False)

        return True

    async def download_animations_for_unit(self, unit_name: str, animations: dict):
        """Download specific animations for an already-rigged unit."""
        unit_rigged_path = RIGGED_DIR / unit_name / f"{unit_name}_rigged.fbx"
        unit_output_dir = RIGGED_DIR / unit_name

        if not unit_rigged_path.exists():
            print(f"  Rigged file not found: {unit_rigged_path}")
            return False

        # Upload the rigged character
        print(f"Uploading rigged {unit_name}...")
        if not await self.upload_character(unit_rigged_path):
            return False

        # Close any modals after upload
        await self.close_modals()
        await asyncio.sleep(1)

        # Download each animation
        for anim_id, anim_name in animations.items():
            anim_path = unit_output_dir / f"{unit_name}_{anim_id}.fbx"
            if anim_path.exists() and anim_path.stat().st_size > 10000:
                print(f"  Already have: {anim_id}")
                continue

            if await self.apply_animation(anim_name):
                await self.download_character(anim_path, with_skin=False)
            else:
                print(f"  Skipping {anim_id} - animation not found")

        return True

    async def download_animations_all_units(self, animations: dict):
        """Download animations for all rigged units."""
        rigged_units = sorted([d.name for d in RIGGED_DIR.iterdir() if d.is_dir()])
        print(f"Found {len(rigged_units)} rigged units")

        for unit_name in rigged_units:
            print(f"\n{'='*50}")
            print(f"Processing animations: {unit_name}")
            print('='*50)

            try:
                await self.download_animations_for_unit(unit_name, animations)
            except Exception as e:
                print(f"Error processing {unit_name}: {e}")
                continue

        print("\nAll animations processed!")

    async def rig_all_units(self):
        """Rig all FBX files in the input directory."""
        RIGGED_DIR.mkdir(parents=True, exist_ok=True)

        fbx_files = sorted(FBX_DIR.glob("*.fbx"))
        print(f"Found {len(fbx_files)} FBX files to process")

        for fbx_path in fbx_files:
            print(f"\n{'='*50}")
            print(f"Processing: {fbx_path.name}")
            print('='*50)

            try:
                await self.rig_unit(fbx_path, RIGGED_DIR)
            except Exception as e:
                print(f"Error processing {fbx_path.name}: {e}")
                continue

        print("\nAll units processed!")


async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Mixamo Auto-Rigging")
    parser.add_argument("--rig-all", action="store_true", help="Rig all units")
    parser.add_argument("--rig-one", type=str, help="Rig a single unit by name (e.g., warrior)")
    parser.add_argument("--anims", action="store_true", help="Download idle & walk animations for all rigged units")
    parser.add_argument("--anims-one", type=str, help="Download animations for a single unit")
    parser.add_argument("--check", action="store_true", help="Check login status")
    parser.add_argument("--standalone", action="store_true", help="Use standalone browser (won't work with Google OAuth)")
    args = parser.parse_args()

    # Animations to download
    DOWNLOAD_ANIMS = {
        "idle": "Idle",
        "walk": "Walking",
    }

    if not HAS_PLAYWRIGHT:
        print("Install Playwright first:")
        print("  pip install playwright")
        print("  playwright install chromium")
        sys.exit(1)

    # Print setup instructions
    print("=" * 60)
    print("MIXAMO AUTO-RIGGING")
    print("=" * 60)
    print("\nPrerequisites:")
    print("1. Start Chrome with debugging enabled:")
    print('   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222')
    print("\n2. In Chrome, go to mixamo.com and login with your Adobe account")
    print("\n3. Run this script with --rig-all or --rig-one <unit_name>")
    print("=" * 60)

    automation = MixamoAutomation()

    try:
        await automation.start(use_existing_chrome=not args.standalone)

        if args.check:
            if await automation.is_logged_in():
                print("Logged in to Mixamo")
            else:
                print("Not logged in. Please login to mixamo.com in Chrome first.")

        elif args.rig_one:
            if not await automation.is_logged_in():
                print("Not logged in. Please login to mixamo.com in Chrome first.")
                sys.exit(1)
            fbx_path = FBX_DIR / f"unit_{args.rig_one}.fbx"
            if not fbx_path.exists():
                print(f"FBX not found: {fbx_path}")
                sys.exit(1)
            await automation.rig_unit(fbx_path, RIGGED_DIR)

        elif args.rig_all:
            if not await automation.is_logged_in():
                print("Not logged in. Please login to mixamo.com in Chrome first.")
                sys.exit(1)
            await automation.rig_all_units()

        elif args.anims:
            if not await automation.is_logged_in():
                print("Not logged in. Please login to mixamo.com in Chrome first.")
                sys.exit(1)
            await automation.download_animations_all_units(DOWNLOAD_ANIMS)

        elif args.anims_one:
            if not await automation.is_logged_in():
                print("Not logged in. Please login to mixamo.com in Chrome first.")
                sys.exit(1)
            await automation.download_animations_for_unit(f"unit_{args.anims_one}", DOWNLOAD_ANIMS)

        else:
            parser.print_help()

    finally:
        await automation.stop()


if __name__ == "__main__":
    asyncio.run(main())
