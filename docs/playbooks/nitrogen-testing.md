# NitroGen Testing Playbook

This playbook documents the testing strategy for NitroGen integration with Cyntra's playability gate.

## Overview

NitroGen is a vision-to-action foundation model that takes game frames (256x256 RGB) and outputs gamepad actions. We use it for automated gameplay QA on Fab-generated worlds.

**Architecture:**

```
[Fab World Renders] --> [NitroGen Server] --> [Gamepad Actions]
        |                   (RunPod H100)            |
        v                                            v
   [Godot Project] <---- FabPlaytest.gd -----> [Metrics]
        |
        v
   [Playability Gate] --> PASS/FAIL
```

## Testing Stages

### Stage 1: Smoke Test (Synthetic Data)

**Purpose:** Validate infrastructure without testing model quality.

**What it tests:**

- Server connection and ZMQ communication
- Request/response cycle timing
- Action decoding and parsing
- Error handling

**How to run:**

```bash
# Ensure SSH tunnel is active
ssh -L 5555:localhost:5555 root@<runpod-ip> -p <port>

# Run smoke test
cd kernel
python -m cyntra.fab.nitrogen_benchmark smoke --sample 50
```

**Expected output:**

```
STAGE 1: Smoke Test (synthetic frames)
============================================================
  Processed 50/50 frames...

smoke_test: PASS
  Frames: 50
  Latency: avg=45.2ms, p95=52.1ms
  Action variance: 0.35
  Movement ratio: 78.0%
  Button rate: 0.12/frame
```

**Pass criteria:**

- 100% frames processed without error
- Avg latency < 100ms
- No ZMQ timeouts

**Failure actions:**

- Check SSH tunnel: `lsof -i :5555`
- Check server status on RunPod: `ps aux | grep serve`
- Verify server logs for errors

---

### Stage 2: Dataset Benchmark

**Purpose:** Validate model behavior on known-good gameplay data.

**What it tests:**

- Model responses to real gameplay frames
- Action quality (variance, movement, button usage)
- Consistency with training distribution

**Data sources:**

1. **NitroGen Dataset** (preferred): Download sample from HuggingFace
2. **Simulated gameplay**: Synthetic frames matching game aesthetics

**How to download dataset sample:**

```bash
# Install huggingface_hub
pip install huggingface_hub

# Download a sample shard (WARNING: full dataset is ~TB scale)
huggingface-cli download nvidia/NitroGen \
  --include "actions/SHARD_0000/*" \
  --local-dir /tmp/nitrogen_dataset
```

**How to run:**

```bash
# With downloaded dataset
python -m cyntra.fab.nitrogen_benchmark dataset \
  --dataset /tmp/nitrogen_dataset \
  --sample 100

# Without dataset (uses simulated gameplay)
python -m cyntra.fab.nitrogen_benchmark dataset --sample 100
```

**Expected metrics:**
| Metric | Good | Acceptable | Poor |
|--------|------|------------|------|
| Action variance | > 0.3 | 0.1-0.3 | < 0.1 |
| Movement ratio | > 60% | 40-60% | < 40% |
| Button rate | 0.05-0.5 | 0.01-0.05 | < 0.01 |

**Interpreting results:**

- **Low variance**: Model always outputs same action (mode collapse?)
- **Low movement**: Model not exploring (stuck behavior)
- **Zero buttons**: Model not interacting (input mapping issue?)

---

### Stage 3: Fab World Integration

**Purpose:** Validate model on actual Fab-generated environments.

**What it tests:**

- Responses to Blender/Godot renders
- Navigation behavior in generated spaces
- Coverage estimation

**How to generate test renders:**

```bash
# Build a world with render stage
cd fab/worlds/outora_library
python -m cyntra.fab.world_builder --stage render
```

**How to run:**

```bash
python -m cyntra.fab.nitrogen_benchmark fab \
  --world fab/worlds/outora_library \
  --sample 100
```

**Expected behavior:**

- Movement in Gothic interiors
- Looking around (camera movement)
- Occasional jumps/interactions

**Failure modes:**
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| No movement | Dark renders confuse model | Add more lighting |
| Spinning in place | Repeating texture patterns | Add visual landmarks |
| Walking into walls | No depth cues | Add perspective elements |

---

## Full Benchmark Suite

Run all stages with:

```bash
python -m cyntra.fab.nitrogen_benchmark all \
  --host localhost \
  --port 5555 \
  --output benchmark_results/ \
  --dataset /tmp/nitrogen_dataset \
  --world fab/worlds/outora_library
```

Output:

```
benchmark_results/
├── benchmark_results.json   # All metrics
└── frames/                  # Sampled frames (optional)
```

---

## CI Integration

Add to `.github/workflows/nitrogen.yml`:

```yaml
name: NitroGen Integration Test

on:
  workflow_dispatch:
  schedule:
    - cron: "0 0 * * 0" # Weekly

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup SSH tunnel
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.RUNPOD_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh -f -N -L 5555:localhost:5555 \
            -o StrictHostKeyChecking=no \
            root@${{ secrets.RUNPOD_IP }} \
            -p ${{ secrets.RUNPOD_PORT }}

      - name: Run smoke test
        run: |
          cd kernel
          python -m cyntra.fab.nitrogen_benchmark smoke

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: benchmark-results
          path: benchmark_results/
```

---

## Troubleshooting

### "Connection refused" on port 5555

1. Check RunPod pod is running
2. Check server process: `ssh runpod "ps aux | grep serve"`
3. Restart server: `ssh runpod "cd NitroGen && nohup python scripts/serve_headless.py weights/ng.pt &"`

### Very slow inference (>500ms)

1. Check GPU utilization: `ssh runpod "nvidia-smi"`
2. May indicate model not on GPU or memory issues
3. Restart server with fresh process

### Model always outputs same action

1. Ensure `client.reset()` called before each session
2. Check frame encoding is correct (RGB, 256x256)
3. Try with different synthetic patterns

### No button presses ever

1. Check button decoding threshold (currently 0.5)
2. NitroGen may be conservative with buttons
3. Normal for exploration - buttons more common in action games

---

## Metrics Reference

### Latency Metrics

- **avg_latency_ms**: Average inference time
- **p95_latency_ms**: 95th percentile latency
- **p99_latency_ms**: 99th percentile latency

### Action Quality Metrics

- **action_variance**: 0-1, how varied are actions (0 = same action always)
- **movement_ratio**: 0-1, fraction of frames with movement
- **button_press_rate**: Average button presses per frame

### Playability Metrics (from gate)

- **stuck_ratio**: Fraction of frames with no movement
- **coverage_estimate**: Estimated exploration coverage
- **interaction_rate**: Fraction of frames with interaction attempts

---

## Next Steps

After validating benchmarks pass:

1. **Run full playtest** on Godot project
2. **Collect metrics** for gate thresholds tuning
3. **Add to world pipeline** as optional stage
4. **Monitor** in production builds
