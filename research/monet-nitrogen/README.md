# Monet-NitroGen: Hierarchical Game AI System

A prototype combining **Monet** (7B MLLM Planner) with **NitroGen** (500M Vision-to-Action Executor) for game AI control.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Main Loop (60Hz)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Capture   │───▶│   Planner   │───▶│   Gating Layer      │ │
│  │  (60 FPS)   │    │   (2 Hz)    │    │  ConstraintEngine   │ │
│  └─────────────┘    └─────────────┘    │  ActionFilter       │ │
│         │                              │  SafetyClamp        │ │
│         │                              └─────────┬───────────┘ │
│         ▼                                        │             │
│  ┌─────────────┐                                 ▼             │
│  │  Executor   │────────────────────────▶ ┌───────────┐        │
│  │  (60 Hz)    │   gated actions         │  Gamepad  │        │
│  └─────────────┘                          └───────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components

| Component | Model | Rate | Purpose |
|-----------|-------|------|---------|
| Planner | Monet 7B | 2 Hz | High-level intent, constraints, skill mode |
| Executor | NitroGen 500M | 60 Hz | Frame-to-action policy |
| Gating | Deterministic | 60 Hz | Constraint enforcement, safety |

## Quick Start

### Prerequisites

- Python 3.10+
- CUDA GPU (24GB+ VRAM for Monet, 8GB+ for NitroGen)
- vLLM for Monet serving
- ZeroMQ for NitroGen

### Installation

```bash
cd research/monet-nitrogen
pip install -e .
```

### Serving Models

```bash
# Terminal 1: Monet Planner (vLLM)
python scripts/serve_monet.py --model NOVAglow646/Monet --port 8000

# Terminal 2: NitroGen Executor (ZMQ)
python scripts/serve_nitrogen.py --model nvidia/NitroGen --port 5555
```

### Running

```bash
# Play mode (live game)
python scripts/play.py --game "Game Window Title"

# Demo mode (process images)
python scripts/demo_hello_world.py --images path/to/frames/

# Offline evaluation
python scripts/eval_offline.py --images path/to/dataset/ --output results/
```

## Configuration

### Environment Variables

```bash
# .env
MONET_API_URL=http://localhost:8000
NITROGEN_ZMQ_ADDR=tcp://localhost:5555
LOG_LEVEL=INFO
ENABLE_SFT_LOGGING=true
SFT_LOG_DIR=./sft_logs
```

### Game Profiles

Game-specific button mappings in `configs/game_profiles/`:

```yaml
# configs/game_profiles/default.yaml
game_name: "Default"
action_mapping:
  SHOOT: RIGHT_TRIGGER
  DODGE: SOUTH
  JUMP: WEST
  CROUCH: EAST
```

## Schemas

### Planner Output

```json
{
  "timestamp_ms": 1234567890,
  "intent": "Attack enemy soldier ahead",
  "target": {
    "type": "enemy",
    "ref": "soldier_front",
    "screen_xy": [0.6, 0.4]
  },
  "constraints": [
    {
      "type": "DO",
      "action": "AIM_AT_TARGET",
      "priority": 0.9,
      "reason": "enemy in sight"
    }
  ],
  "skill": {
    "mode": "aggressive",
    "aggression": 0.8,
    "stealth": 0.1
  },
  "confidence": 0.85
}
```

### Constraint Types

| Type | Description |
|------|-------------|
| `DO` | Required action (e.g., DODGE immediately) |
| `DO_NOT` | Suppress action (e.g., no SHOOT for 3s) |
| `PREFER` | Soft preference with weight |
| `AVOID_ZONE` | Screen region to avoid |
| `FOCUS_TARGET` | Maintain aim at target |
| `MAX_RISK` | Limit aggression level |
| `PRIORITIZE_OBJECTIVE` | Focus on specific goal |

### Action Types

```
SHOOT, AIM_AT_TARGET, DODGE, JUMP, CROUCH, SPRINT,
MOVE_FORWARD, MOVE_BACKWARD, MOVE_LEFT, MOVE_RIGHT,
LOOK_LEFT, LOOK_RIGHT, LOOK_UP, LOOK_DOWN, RELOAD, USE
```

## Safety Mechanisms

1. **Plan TTL**: Plans expire after 2000ms, triggering fallback
2. **Fallback Plan**: Defensive mode with no shooting
3. **Stuck Detection**: Variance-based position tracking
4. **Action Clamping**: Axis values clamped to [-32767, 32767]
5. **Menu Button Suppression**: Prevents accidental menu opens

## Evaluation

### Offline Mode

```bash
python scripts/eval_offline.py \
  --images ./test_frames/ \
  --output ./results/ \
  --report-format html
```

Metrics:
- JSON validity rate (target: ≥99%)
- Parse latency (target: <500ms)
- Constraint distribution
- Confidence histogram

### Live Mode

```bash
python scripts/play.py --game "Game" --enable-metrics
```

Real-time metrics:
- Planner latency (target: <500ms p95)
- Executor latency (target: <16ms p95)
- Constraint suppression rate
- Fallback activation count

## Testing

```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_schemas.py -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html
```

## Project Structure

```
research/monet-nitrogen/
├── configs/
│   ├── planner_prompt.txt      # Monet system prompt
│   ├── planner_schema.json     # JSON Schema for validation
│   └── game_profiles/          # Per-game button mappings
├── schemas/
│   ├── planner_output.py       # PlannerOutput, Constraint, etc.
│   └── executor_action.py      # NitroGenAction, GatedAction
├── planner/
│   ├── monet_client.py         # Async Monet API client
│   ├── prompt_builder.py       # Dynamic prompt construction
│   ├── response_parser.py      # Multi-strategy JSON extraction
│   └── validators.py           # Schema validation
├── executor/
│   ├── nitrogen_client.py      # ZMQ NitroGen client
│   └── action_decoder.py       # Tensor to action conversion
├── gating/
│   ├── constraint_engine.py    # Constraint tracking/expiration
│   ├── action_filter.py        # Apply constraints to actions
│   └── safety_clamp.py         # Plan TTL, stuck detection
├── capture/
│   ├── frame_capture.py        # Window/screen capture
│   ├── frame_buffer.py         # 16-frame ring buffer
│   └── state_extractor.py      # Minimap, health extraction
├── orchestrator/
│   ├── main_loop.py            # Async 60Hz coordinator
│   ├── blackboard.py           # Shared state
│   └── gamepad.py              # Virtual controller
├── eval/
│   ├── offline_harness.py      # Batch image evaluation
│   ├── live_metrics.py         # Real-time telemetry
│   ├── failure_detector.py     # Failure mode analysis
│   └── report_generator.py     # HTML/JSON reports
├── scripts/
│   ├── serve_monet.py          # vLLM Monet server
│   ├── serve_nitrogen.py       # ZMQ NitroGen server
│   ├── play.py                 # Live game play
│   ├── eval_offline.py         # Offline evaluation
│   └── demo_hello_world.py     # Minimal demo
└── tests/
    ├── test_schemas.py
    ├── test_gating.py
    ├── test_constraint_engine.py
    └── fixtures/
        └── sample_plans.json
```

## Success Criteria

| Metric | Target | Status |
|--------|--------|--------|
| Valid JSON rate | ≥99% | TBD |
| Planner latency (p95) | <500ms | TBD |
| Executor latency (p95) | <16ms | TBD |
| Constraint suppression | Observable | TBD |
| Fallback activations | <1% of time | TBD |

## Future Work (v2+)

- [ ] SFT training on logged data
- [ ] RLHF for constraint following
- [ ] Multi-game profile support
- [ ] Headless evaluation mode
- [ ] Distributed planner/executor

## References

- [Monet](https://github.com/NOVAglow646/Monet): 7B MLLM with latent visual reasoning
- [NitroGen](https://huggingface.co/nvidia/NitroGen): 500M vision-to-action gaming model
- [vLLM](https://github.com/vllm-project/vllm): High-throughput LLM serving
