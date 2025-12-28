#![cfg(feature = "time")]

use std::time::Duration;

use ai_bevy::{AiBevyPlugin, AiTick};
use bevy_app::App;
use bevy_time::Time;

#[test]
fn bevy_time_can_drive_ai_tick_dt_seconds() {
    let mut app = App::new();
    app.add_plugins(AiBevyPlugin::default());

    app.insert_resource(AiTick {
        tick: 0,
        dt_seconds: 123.0,
        seed: 0,
    });

    let mut time: Time = Time::default();
    time.advance_by(Duration::from_millis(250));
    app.insert_resource(time);

    app.update();

    let tick = app.world().resource::<AiTick>();
    assert!((tick.dt_seconds - 0.25).abs() < 1e-6);
}
