#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// A small, allocation-friendly trace event.
///
/// This is intentionally "dumb data" so it can be recorded during simulation and later rendered
/// by tooling. Specific subsystems can define their own richer event types on top of this.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct TraceEvent {
    pub tick: u64,
    pub tag: Cow<'static, str>,
    pub a: u64,
    pub b: u64,
}

impl TraceEvent {
    pub fn new(tick: u64, tag: impl Into<Cow<'static, str>>) -> Self {
        Self {
            tick,
            tag: tag.into(),
            a: 0,
            b: 0,
        }
    }

    pub fn with_a(mut self, a: u64) -> Self {
        self.a = a;
        self
    }

    pub fn with_b(mut self, b: u64) -> Self {
        self.b = b;
        self
    }
}

pub trait TraceSink {
    fn emit(&mut self, event: TraceEvent);
}

#[derive(Debug, Default)]
pub struct NullTraceSink;

impl TraceSink for NullTraceSink {
    fn emit(&mut self, _event: TraceEvent) {}
}

#[derive(Debug, Default)]
pub struct VecTraceSink {
    pub events: Vec<TraceEvent>,
}

impl TraceSink for VecTraceSink {
    fn emit(&mut self, event: TraceEvent) {
        self.events.push(event);
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct TraceLog {
    pub events: Vec<TraceEvent>,
}

impl TraceLog {
    pub fn push(&mut self, event: TraceEvent) {
        self.events.push(event);
    }
}

use ai_core::{BbKey, Blackboard};

/// Blackboard key for collecting events in-memory.
pub const TRACE_LOG: BbKey<TraceLog> = BbKey::new(0xA11D_7ACE_0000_0001);
/// Blackboard key for streaming events into a user-provided sink.
pub const TRACE_SINK: BbKey<Box<dyn TraceSink>> = BbKey::new(0xA11D_7ACE_0000_0002);

pub fn emit(blackboard: &mut Blackboard, event: TraceEvent) {
    if let Some(log) = blackboard.get_mut(TRACE_LOG) {
        log.push(event.clone());
    }
    if let Some(sink) = blackboard.get_mut(TRACE_SINK) {
        sink.emit(event);
    }
}
