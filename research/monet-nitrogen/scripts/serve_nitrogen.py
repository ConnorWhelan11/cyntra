#!/usr/bin/env python3
"""Start NitroGen ZeroMQ server.

This script starts the NitroGen model server.

Usage:
    python scripts/serve_nitrogen.py models/nitrogen/ng.pt --port 5555
"""

import argparse
import pickle
import sys
from pathlib import Path

import zmq


def main() -> None:
    parser = argparse.ArgumentParser(description="Start NitroGen server")
    parser.add_argument(
        "checkpoint",
        type=str,
        help="Path to NitroGen checkpoint (ng.pt)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5555,
        help="Server port",
    )
    parser.add_argument(
        "--cfg",
        type=float,
        default=1.0,
        help="CFG scale",
    )
    parser.add_argument(
        "--ctx",
        type=int,
        default=1,
        help="Context length",
    )

    args = parser.parse_args()

    # Check checkpoint
    ckpt_path = Path(args.checkpoint)
    if not ckpt_path.exists():
        print(f"Error: Checkpoint not found at {ckpt_path}")
        print("Please download the model first:")
        print("  huggingface-cli download nvidia/NitroGen ng.pt --local-dir models/nitrogen")
        sys.exit(1)

    # Try to import NitroGen
    try:
        # Add parent to path for local nitrogen package
        sys.path.insert(0, str(Path(__file__).parent.parent.parent))
        from nitrogen.inference_session import InferenceSession
    except ImportError:
        print("Error: NitroGen not installed.")
        print("Please install from: https://github.com/MineDojo/NitroGen")
        print("  git clone https://github.com/MineDojo/NitroGen.git external/nitrogen")
        print("  pip install -e external/nitrogen")
        sys.exit(1)

    # Load model
    print("Loading NitroGen model...")
    session = InferenceSession.from_ckpt(
        str(ckpt_path),
        cfg_scale=args.cfg,
        context_length=args.ctx,
    )
    print("Model loaded!")

    # Setup ZeroMQ
    context = zmq.Context()
    socket = context.socket(zmq.REP)
    socket.bind(f"tcp://*:{args.port}")

    # Create poller
    poller = zmq.Poller()
    poller.register(socket, zmq.POLLIN)

    print()
    print("=" * 60)
    print(f"NitroGen Server running on port {args.port}")
    print("Waiting for requests...")
    print("=" * 60)
    print()

    try:
        while True:
            # Poll with timeout for interrupt handling
            events = dict(poller.poll(timeout=100))
            if socket in events and events[socket] == zmq.POLLIN:
                request = socket.recv()
                request = pickle.loads(request)

                if request["type"] == "reset":
                    session.reset()
                    response = {"status": "ok"}
                    print("Session reset")

                elif request["type"] == "info":
                    info = session.info()
                    response = {"status": "ok", "info": info}
                    print("Sent session info")

                elif request["type"] == "predict":
                    raw_image = request["image"]
                    result = session.predict(raw_image)
                    response = {"status": "ok", "pred": result}

                else:
                    response = {
                        "status": "error",
                        "message": f"Unknown request type: {request['type']}",
                    }

                socket.send(pickle.dumps(response))

    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        socket.close()
        context.term()


if __name__ == "__main__":
    main()
