use ai_core::{Action, ActionStatus, Blackboard, TickContext};

use crate::{NavPath, NavWorldMut, Vec2};

#[derive(Debug, Clone)]
pub struct MoveToAction {
    goal: Vec2,
    speed: f32,
    arrival_distance: f32,
    path: Option<NavPath>,
    next_index: usize,
}

impl MoveToAction {
    pub fn new(goal: Vec2, speed: f32, arrival_distance: f32) -> Self {
        Self {
            goal,
            speed,
            arrival_distance,
            path: None,
            next_index: 1,
        }
    }
}

impl<W> Action<W> for MoveToAction
where
    W: NavWorldMut + 'static,
{
    fn tick(
        &mut self,
        ctx: &TickContext,
        agent: W::Agent,
        world: &mut W,
        _blackboard: &mut Blackboard,
    ) -> ActionStatus {
        let Some(pos) = world.position(agent) else {
            return ActionStatus::Failure;
        };

        if pos.distance(self.goal) <= self.arrival_distance {
            return ActionStatus::Success;
        }

        if self.path.is_none() {
            self.path = world.navigator().find_path(pos, self.goal);
            self.next_index = 1;
            if self.path.is_none() {
                return ActionStatus::Failure;
            }
        }

        let Some(path) = &self.path else {
            return ActionStatus::Failure;
        };

        if path.points.len() < 2 {
            return ActionStatus::Failure;
        }

        let dt = ctx.dt_seconds.max(0.0);
        let mut remaining = self.speed.max(0.0) * dt;

        let mut current = pos;
        while self.next_index < path.points.len() && remaining > 0.0 {
            let target = path.points[self.next_index];
            let to_target = target - current;
            let dist = to_target.length();

            if dist <= f32::EPSILON {
                self.next_index += 1;
                continue;
            }

            if remaining >= dist {
                current = target;
                self.next_index += 1;
                remaining -= dist;
                continue;
            }

            current = current + to_target * (remaining / dist);
            break;
        }

        world.set_position(agent, current);
        ActionStatus::Running
    }
}
