# AI Tracing (ai-tools)

The AI crates emit lightweight `ai-tools::TraceEvent`s into a sink stored on the per-agent
`ai-core::Blackboard`. This is intended for deterministic replay/debug without coupling to any
engine UI.

## Enable

Install a trace log (typically stored on an agent’s `Brain.blackboard`):

```rust
use ai_core::Blackboard;
use ai_tools::{TraceLog, TRACE_LOG};

let mut blackboard = Blackboard::new();
blackboard.set(TRACE_LOG, TraceLog::default());
```

Optionally, install a streaming sink:

```rust
use ai_core::Blackboard;
use ai_tools::{NullTraceSink, TraceSink, TRACE_SINK};

let mut blackboard = Blackboard::new();
blackboard.set(TRACE_SINK, Box::new(NullTraceSink) as Box<dyn TraceSink>);
```

## Read events

```rust
use ai_core::Blackboard;
use ai_tools::{TraceLog, TRACE_LOG};

let mut blackboard = Blackboard::new();
blackboard.set(TRACE_LOG, TraceLog::default());

let events = &blackboard.get(TRACE_LOG).unwrap().events;
```

## Event tags

Planners and plan embeddings emit stable tags such as:

- `bt.plan.*` (from `ai-bt::PlanNode`)
- `goap.*` (from `ai-goap::{GoapPlanPolicy, GoapPlanNode}`)
- `htn.plan.*` (from `ai-htn::HtnPlanPolicy`)

Numeric fields `a`/`b` are tag-specific (typically keys, signatures, and plan lengths).

## JSON export

Enable `ai-tools/serde` and serialize the `TraceLog`:

```rust
# #[cfg(feature = "serde")] {
use ai_tools::TraceLog;

let json = serde_json::to_string(&TraceLog::default()).unwrap();
# }
```

## Bevy integration (optional)

If you’re using Bevy, `ai-bevy` can flush `ai-tools` events into the Bevy ECS as `AiTraceEvent`s,
collect them into an in-memory ring buffer (`AiTraceBuffer`), and optionally show them in an egui
inspector UI.

At a high level:

- `ai-bevy/trace`: flush blackboard `TraceLog` → `AiTraceEvent`
- `ai-bevy/trace-inspector`: `AiTraceEvent` → `AiTraceBuffer`
- `ai-bevy/trace-egui`: show `AiTraceBuffer` in a window

See `crates/ai-bevy/examples/bevy_debug_demo.rs` for an end-to-end demo.
