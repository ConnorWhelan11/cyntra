#[derive(Clone, Debug)]
pub enum InputEvent {
  MouseMove { x: f32, y: f32 },
  MouseWheel { delta_x: f32, delta_y: f32 },
  MouseButton { button: u8, down: bool },
  Key { key: String, down: bool },
}

pub struct InputRouter;

impl InputRouter {
  pub fn new() -> Self {
    Self
  }

  /// Returns true if the event is consumed by an overlay (egui) or other UI layer.
  pub fn route(&mut self, _event: InputEvent) -> bool {
    false
  }
}

