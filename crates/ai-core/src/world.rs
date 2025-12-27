use crate::AgentId;

/// Read-only world access.
///
/// The core crate intentionally does not prescribe which queries a world must
/// expose; specific subsystems (nav, perception, etc.) should define extension
/// traits.
pub trait WorldView {
    type Agent: AgentId;
}

/// Write access / effect sink.
pub trait WorldMut: WorldView {}
