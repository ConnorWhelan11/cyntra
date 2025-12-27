use ai_core::{BbKey, Blackboard};

#[test]
fn blackboard_set_get_remove_roundtrip() {
    let k_u32 = BbKey::<u32>::new(1);
    let k_str = BbKey::<String>::new(2);

    let mut bb = Blackboard::new();
    assert!(!bb.contains(k_u32));

    bb.set(k_u32, 123);
    bb.set(k_str, "hello".to_string());

    assert_eq!(bb.get(k_u32).copied(), Some(123));
    assert_eq!(bb.get(k_str).map(|s| s.as_str()), Some("hello"));

    assert_eq!(bb.remove(k_u32), Some(123));
    assert_eq!(bb.get(k_u32), None);
}

#[test]
#[should_panic(expected = "blackboard type mismatch")]
fn blackboard_type_mismatch_panics() {
    let mut bb = Blackboard::new();
    bb.set(BbKey::<u32>::new(1), 1u32);
    let _ = bb.get(BbKey::<i32>::new(1));
}

