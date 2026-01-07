"""Monet planner client for vLLM inference."""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import re
import time
from pathlib import Path
from typing import Any

import aiohttp
import numpy as np
from PIL import Image

from schemas.planner_output import PlannerOutput, SAFE_FALLBACK_PLAN
from planner.prompt_builder import PromptBuilder
from planner.response_parser import parse_planner_response

logger = logging.getLogger(__name__)


class MonetPlanner:
    """Async client for Monet planner running on vLLM.

    Usage:
        async with MonetPlanner(base_url="http://localhost:8000") as planner:
            plan = await planner.plan(frame, state)
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        model_name: str = "Monet-7B",
        timeout_s: float = 1.5,
        max_retries: int = 3,
        prompt_path: Path | str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.timeout_s = timeout_s
        self.max_retries = max_retries
        self.session: aiohttp.ClientSession | None = None
        self.prompt_builder = PromptBuilder(prompt_path)

        # Stats
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.total_latency_ms = 0.0

    async def __aenter__(self) -> "MonetPlanner":
        """Enter async context."""
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, *args: Any) -> None:
        """Exit async context."""
        if self.session:
            await self.session.close()
            self.session = None

    def _encode_image(self, image: Image.Image) -> str:
        """Encode PIL image to base64."""
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode("utf-8")

    def _clean_latent_tokens(self, text: str) -> str:
        """Remove Monet's latent visual tokens from output."""
        # Replace <abs_vis_token>...</abs_vis_token> with <latent>
        pattern = re.compile(r"<abs_vis_token>.*?</abs_vis_token>", flags=re.DOTALL)
        return pattern.sub("<latent>", text)

    async def plan(
        self,
        frame: np.ndarray | Image.Image,
        state: dict[str, Any] | None = None,
    ) -> PlannerOutput | None:
        """Generate a plan from a game frame.

        Args:
            frame: Game frame as numpy array (BGR) or PIL Image (RGB)
            state: Optional game state dict (health, position, etc.)

        Returns:
            PlannerOutput if successful, None if parsing fails
        """
        if self.session is None:
            raise RuntimeError("MonetPlanner not initialized. Use 'async with' context.")

        # Convert frame to PIL Image if needed
        if isinstance(frame, np.ndarray):
            # Assume BGR from OpenCV
            import cv2
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = Image.fromarray(frame_rgb)
        else:
            image = frame

        # Resize to reasonable size for inference
        if image.width > 512 or image.height > 512:
            image.thumbnail((512, 512), Image.Resampling.LANCZOS)

        # Build prompt
        prompt = self.prompt_builder.build(state or {})

        # Prepare request
        payload = {
            "model": self.model_name,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{self._encode_image(image)}"
                            },
                        },
                    ],
                }
            ],
            "max_tokens": 512,
            "temperature": 0.1,  # Low temp for consistent JSON
        }

        # Try with retries
        last_error: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                start_time = time.time()
                self.total_requests += 1

                async with self.session.post(
                    f"{self.base_url}/v1/chat/completions",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=self.timeout_s),
                ) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        raise RuntimeError(f"HTTP {resp.status}: {error_text}")

                    result = await resp.json()

                latency_ms = (time.time() - start_time) * 1000
                self.total_latency_ms += latency_ms

                # Extract response text
                raw_text = result["choices"][0]["message"]["content"]

                # Clean latent tokens
                cleaned_text = self._clean_latent_tokens(raw_text)

                # Parse JSON
                plan = parse_planner_response(cleaned_text)

                if plan is not None:
                    self.successful_requests += 1
                    logger.debug(f"Plan generated in {latency_ms:.0f}ms: {plan.intent}")
                    return plan
                else:
                    logger.warning(f"Failed to parse plan from: {cleaned_text[:200]}")
                    # Retry with higher temperature
                    payload["temperature"] = min(0.5, payload["temperature"] + 0.1)

            except asyncio.TimeoutError:
                last_error = asyncio.TimeoutError(f"Timeout after {self.timeout_s}s")
                logger.warning(f"Planner timeout (attempt {attempt + 1}/{self.max_retries})")
            except Exception as e:
                last_error = e
                logger.warning(f"Planner error (attempt {attempt + 1}): {e}")

            # Brief delay before retry
            if attempt < self.max_retries - 1:
                await asyncio.sleep(0.1)

        self.failed_requests += 1
        if last_error:
            logger.error(f"Planner failed after {self.max_retries} attempts: {last_error}")
        return None

    async def health_check(self) -> bool:
        """Check if the Monet server is healthy."""
        if self.session is None:
            return False
        try:
            async with self.session.get(
                f"{self.base_url}/health",
                timeout=aiohttp.ClientTimeout(total=5.0),
            ) as resp:
                return resp.status == 200
        except Exception:
            return False

    def get_stats(self) -> dict[str, Any]:
        """Get client statistics."""
        return {
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "success_rate": (
                self.successful_requests / self.total_requests
                if self.total_requests > 0
                else 0.0
            ),
            "avg_latency_ms": (
                self.total_latency_ms / self.total_requests
                if self.total_requests > 0
                else 0.0
            ),
        }


class MockMonetPlanner:
    """Mock planner for testing without a real Monet server."""

    def __init__(self, default_plan: PlannerOutput | None = None) -> None:
        self.default_plan = default_plan or SAFE_FALLBACK_PLAN
        self.call_count = 0

    async def __aenter__(self) -> "MockMonetPlanner":
        return self

    async def __aexit__(self, *args: Any) -> None:
        pass

    async def plan(
        self,
        frame: np.ndarray | Image.Image,
        state: dict[str, Any] | None = None,
    ) -> PlannerOutput:
        """Return mock plan."""
        self.call_count += 1
        # Add some variation based on call count
        plan = self.default_plan.model_copy()
        plan.timestamp_ms = int(time.time() * 1000)
        return plan

    async def health_check(self) -> bool:
        return True

    def get_stats(self) -> dict[str, Any]:
        return {"mock": True, "call_count": self.call_count}
