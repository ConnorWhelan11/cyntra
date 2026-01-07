#!/usr/bin/env python3
"""Start Monet vLLM server.

This script starts the Monet model as a vLLM OpenAI-compatible server.

Usage:
    python scripts/serve_monet.py --model-path models/monet-7b --port 8000
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Start Monet vLLM server")
    parser.add_argument(
        "--model-path",
        type=str,
        default="models/monet-7b",
        help="Path to Monet model",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Server port",
    )
    parser.add_argument(
        "--latent-size",
        type=int,
        default=10,
        help="Number of latent embeddings",
    )
    parser.add_argument(
        "--gpu-memory-utilization",
        type=float,
        default=0.9,
        help="GPU memory utilization (0-1)",
    )
    parser.add_argument(
        "--tensor-parallel",
        type=int,
        default=1,
        help="Tensor parallel size",
    )

    args = parser.parse_args()

    # Check model path
    model_path = Path(args.model_path)
    if not model_path.exists():
        print(f"Error: Model not found at {model_path}")
        print("Please download the model first:")
        print("  huggingface-cli download NOVAglow646/Monet-7B --local-dir models/monet-7b")
        sys.exit(1)

    # Set environment variables
    env = os.environ.copy()
    env["LATENT_SIZE"] = str(args.latent_size)
    env["VLLM_USE_V1"] = "1"

    # Build command
    cmd = [
        sys.executable,
        "-m",
        "vllm.entrypoints.openai.api_server",
        "--model",
        str(model_path),
        "--port",
        str(args.port),
        "--gpu-memory-utilization",
        str(args.gpu_memory_utilization),
        "--tensor-parallel-size",
        str(args.tensor_parallel),
        "--trust-remote-code",
    ]

    print("=" * 60)
    print("Starting Monet vLLM Server")
    print("=" * 60)
    print(f"Model: {model_path}")
    print(f"Port: {args.port}")
    print(f"Latent size: {args.latent_size}")
    print(f"GPU memory: {args.gpu_memory_utilization * 100:.0f}%")
    print("=" * 60)
    print()
    print("Note: You may need to patch vLLM with monet_gpu_model_runner.py")
    print("See the Monet repository for instructions.")
    print()

    try:
        subprocess.run(cmd, env=env, check=True)
    except KeyboardInterrupt:
        print("\nServer stopped.")
    except subprocess.CalledProcessError as e:
        print(f"Server exited with error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
