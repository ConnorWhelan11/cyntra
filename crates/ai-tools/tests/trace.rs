use std::cell::RefCell;
use std::rc::Rc;

use ai_core::Blackboard;
use ai_tools::{emit, TraceEvent, TraceSink, TRACE_LOG, TRACE_SINK};

#[derive(Clone, Default)]
struct RcSink(Rc<RefCell<Vec<TraceEvent>>>);

impl TraceSink for RcSink {
    fn emit(&mut self, event: TraceEvent) {
        self.0.borrow_mut().push(event);
    }
}

#[test]
fn emit_writes_to_trace_log_when_present() {
    let mut bb = Blackboard::new();
    bb.set(TRACE_LOG, ai_tools::TraceLog::default());

    emit(&mut bb, TraceEvent::new(1, "test").with_a(10).with_b(20));

    let log = bb.get(TRACE_LOG).unwrap();
    assert_eq!(log.events.len(), 1);
    assert_eq!(log.events[0].tick, 1);
    assert_eq!(log.events[0].tag, "test");
    assert_eq!(log.events[0].a, 10);
    assert_eq!(log.events[0].b, 20);
}

#[test]
fn emit_writes_to_sink_when_present() {
    let mut bb = Blackboard::new();
    let handle = RcSink::default();
    let shared = handle.0.clone();
    bb.set(TRACE_SINK, Box::new(handle) as Box<dyn TraceSink>);

    emit(&mut bb, TraceEvent::new(2, "sink_event"));

    let events = shared.borrow();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].tick, 2);
    assert_eq!(events[0].tag, "sink_event");
}

#[test]
fn emit_writes_to_both_log_and_sink_when_both_present() {
    let mut bb = Blackboard::new();
    bb.set(TRACE_LOG, ai_tools::TraceLog::default());

    let handle = RcSink::default();
    let shared = handle.0.clone();
    bb.set(TRACE_SINK, Box::new(handle) as Box<dyn TraceSink>);

    emit(&mut bb, TraceEvent::new(3, "both"));

    let log = bb.get(TRACE_LOG).unwrap();
    assert_eq!(log.events.len(), 1);
    assert_eq!(log.events[0].tag, "both");

    let events = shared.borrow();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].tag, "both");
}

