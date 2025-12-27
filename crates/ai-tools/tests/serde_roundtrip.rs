#![cfg(feature = "serde")]

use ai_tools::{TraceEvent, TraceLog};

#[test]
fn trace_log_json_roundtrip() {
    let log = TraceLog {
        events: vec![
            TraceEvent::new(1, "bt.plan.start").with_a(10).with_b(20),
            TraceEvent::new(2, "goap.plan.start").with_a(1).with_b(2),
            TraceEvent::new(3, "htn.plan.start").with_a(3).with_b(4),
        ],
    };

    let json = serde_json::to_string(&log).expect("serialize");
    let roundtrip: TraceLog = serde_json::from_str(&json).expect("deserialize");
    assert_eq!(roundtrip, log);
}

