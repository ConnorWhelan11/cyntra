use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use super::schema::{EventEnvelope, ViewportEvent};

pub const VIEWPORT_EVENT_CHANNEL: &str = "viewport:event";

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Priority {
  Low = 0,
  Medium = 1,
  High = 2,
  Critical = 3,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DropPolicy {
  Never,
  DropNewest,
  DropOldest,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum CoalesceKey {
  HoverChanged,
  CameraChanged,
  PerfStats,
}

#[derive(Clone, Debug)]
struct QueueItem {
  envelope: EventEnvelope,
  priority: Priority,
  droppable: bool,
  drop_policy: DropPolicy,
}

#[derive(Clone, Debug)]
struct CoalescedEntry {
  interval: Duration,
  last_emit_at: Instant,
  pending: Option<QueueItem>,
}

struct Inner {
  app_handle: AppHandle,
  closed: AtomicBool,

  queue_capacity: usize,
  queue: Mutex<VecDeque<QueueItem>>,
  queue_cv: Condvar,

  coalesced: Mutex<HashMap<CoalesceKey, CoalescedEntry>>,
  coalesce_cv: Condvar,
}

#[derive(Clone)]
pub struct ViewportEventBus {
  inner: Arc<Inner>,
}

pub struct ViewportEventBusGuard {
  inner: Arc<Inner>,
  pump_thread: Option<JoinHandle<()>>,
  coalesce_thread: Option<JoinHandle<()>>,
}

impl ViewportEventBus {
  pub fn new(app_handle: AppHandle, queue_capacity: usize) -> (Self, ViewportEventBusGuard) {
    let inner = Arc::new(Inner {
      app_handle,
      closed: AtomicBool::new(false),
      queue_capacity,
      queue: Mutex::new(VecDeque::with_capacity(queue_capacity)),
      queue_cv: Condvar::new(),
      coalesced: Mutex::new(HashMap::new()),
      coalesce_cv: Condvar::new(),
    });

    let pump_inner = inner.clone();
    let pump_thread = thread::spawn(move || pump_loop(pump_inner));

    let coalesce_inner = inner.clone();
    let coalesce_thread = thread::spawn(move || coalesce_loop(coalesce_inner));

    (
      Self { inner: inner.clone() },
      ViewportEventBusGuard {
        inner,
        pump_thread: Some(pump_thread),
        coalesce_thread: Some(coalesce_thread),
      },
    )
  }

  pub fn publish(&self, envelope: EventEnvelope) -> Result<(), String> {
    let classification = classify(&envelope);
    if let Some((key, interval)) = classification.coalesce {
      self.publish_coalesced(key, interval, envelope, classification)
    } else {
      self.enqueue(QueueItem {
        envelope,
        priority: classification.priority,
        droppable: classification.droppable,
        drop_policy: classification.drop_policy,
      })
    }
  }

  fn publish_coalesced(
    &self,
    key: CoalesceKey,
    interval: Duration,
    envelope: EventEnvelope,
    classification: Classification,
  ) -> Result<(), String> {
    let item = QueueItem {
      envelope,
      priority: classification.priority,
      droppable: classification.droppable,
      drop_policy: classification.drop_policy,
    };

    let mut map = self
      .inner
      .coalesced
      .lock()
      .map_err(|_| "viewport event coalescer lock poisoned".to_string())?;
    let entry = map.entry(key).or_insert_with(|| CoalescedEntry {
      interval,
      last_emit_at: Instant::now()
        .checked_sub(interval)
        .unwrap_or_else(Instant::now),
      pending: None,
    });
    entry.interval = interval;
    entry.pending = Some(item);
    self.inner.coalesce_cv.notify_one();
    Ok(())
  }

  fn enqueue(&self, item: QueueItem) -> Result<(), String> {
    if self.inner.closed.load(Ordering::SeqCst) {
      return Err("viewport event bus is closed".to_string());
    }

    let mut queue = self
      .inner
      .queue
      .lock()
      .map_err(|_| "viewport event queue lock poisoned".to_string())?;

    if queue.len() < self.inner.queue_capacity {
      queue.push_back(item);
      self.inner.queue_cv.notify_one();
      return Ok(());
    }

    if item.drop_policy == DropPolicy::Never && !item.droppable {
      if drop_one_droppable_lowest_priority(&mut queue).is_some() {
        queue.push_back(item);
        self.inner.queue_cv.notify_one();
        return Ok(());
      }

      let (mut queue, _) = self
        .inner
        .queue_cv
        .wait_timeout(queue, Duration::from_secs(1))
        .map_err(|_| "viewport event queue wait failed".to_string())?;

      if queue.len() < self.inner.queue_capacity {
        queue.push_back(item);
        self.inner.queue_cv.notify_one();
        return Ok(());
      }

      return Err("viewport event queue saturated with non-droppable events".to_string());
    }

    if item.droppable {
      match item.drop_policy {
        DropPolicy::DropNewest => Ok(()),
        DropPolicy::DropOldest => {
          if drop_one_droppable_oldest(&mut queue).is_some() {
            queue.push_back(item);
            self.inner.queue_cv.notify_one();
          }
          Ok(())
        }
        DropPolicy::Never => Ok(()),
      }
    } else {
      Ok(())
    }
  }
}

impl Drop for ViewportEventBusGuard {
  fn drop(&mut self) {
    self.inner.closed.store(true, Ordering::SeqCst);
    self.inner.queue_cv.notify_all();
    self.inner.coalesce_cv.notify_all();

    if let Some(handle) = self.coalesce_thread.take() {
      let _ = handle.join();
    }
    if let Some(handle) = self.pump_thread.take() {
      let _ = handle.join();
    }
  }
}

#[derive(Clone, Copy, Debug)]
struct Classification {
  priority: Priority,
  droppable: bool,
  drop_policy: DropPolicy,
  coalesce: Option<(CoalesceKey, Duration)>,
}

fn classify(envelope: &EventEnvelope) -> Classification {
  match &envelope.message {
    ViewportEvent::Error(_) => Classification {
      priority: Priority::Critical,
      droppable: false,
      drop_policy: DropPolicy::Never,
      coalesce: None,
    },
    ViewportEvent::DeviceLost(_) => Classification {
      priority: Priority::Critical,
      droppable: false,
      drop_policy: DropPolicy::Never,
      coalesce: None,
    },
    ViewportEvent::ViewportReady(_) => Classification {
      priority: Priority::High,
      droppable: false,
      drop_policy: DropPolicy::Never,
      coalesce: None,
    },
    ViewportEvent::ViewportClosed(_) => Classification {
      priority: Priority::High,
      droppable: false,
      drop_policy: DropPolicy::Never,
      coalesce: None,
    },
    ViewportEvent::ShutdownAck(_) => Classification {
      priority: Priority::High,
      droppable: false,
      drop_policy: DropPolicy::Never,
      coalesce: None,
    },
    ViewportEvent::SceneLoaded(_) => Classification {
      priority: Priority::High,
      droppable: false,
      drop_policy: DropPolicy::Never,
      coalesce: None,
    },
    ViewportEvent::SelectionChanged(_) => Classification {
      priority: Priority::High,
      droppable: false,
      drop_policy: DropPolicy::Never,
      coalesce: None,
    },
    ViewportEvent::CameraChanged(_) => Classification {
      priority: Priority::Medium,
      droppable: true,
      drop_policy: DropPolicy::DropNewest,
      coalesce: Some((CoalesceKey::CameraChanged, Duration::from_millis(33))),
    },
    ViewportEvent::HoverChanged(_) => Classification {
      priority: Priority::Low,
      droppable: true,
      drop_policy: DropPolicy::DropNewest,
      coalesce: Some((CoalesceKey::HoverChanged, Duration::from_millis(16))),
    },
    ViewportEvent::PerfStats(_) => Classification {
      priority: Priority::Low,
      droppable: true,
      drop_policy: DropPolicy::DropOldest,
      coalesce: Some((CoalesceKey::PerfStats, Duration::from_millis(1000))),
    },
  }
}

fn pump_loop(inner: Arc<Inner>) {
  loop {
    let item = {
      let mut queue = match inner.queue.lock() {
        Ok(lock) => lock,
        Err(poisoned) => poisoned.into_inner(),
      };

      while queue.is_empty() && !inner.closed.load(Ordering::SeqCst) {
        queue = match inner.queue_cv.wait(queue) {
          Ok(lock) => lock,
          Err(poisoned) => poisoned.into_inner(),
        };
      }

      if queue.is_empty() && inner.closed.load(Ordering::SeqCst) {
        return;
      }

      let item = queue.pop_front();
      inner.queue_cv.notify_all();
      item
    };

    let Some(item) = item else { continue };
    let _ = inner
      .app_handle
      .emit(VIEWPORT_EVENT_CHANNEL, &item.envelope);
  }
}

fn coalesce_loop(inner: Arc<Inner>) {
  loop {
    let due_items = take_due_coalesced(&inner);

    for item in due_items.into_iter() {
      if inner.closed.load(Ordering::SeqCst) {
        return;
      }

      let bus = ViewportEventBus { inner: inner.clone() };
      let _ = bus.enqueue(item);
    }
  }
}

fn take_due_coalesced(inner: &Arc<Inner>) -> Vec<QueueItem> {
  let mut map = match inner.coalesced.lock() {
    Ok(lock) => lock,
    Err(poisoned) => poisoned.into_inner(),
  };

  loop {
    if inner.closed.load(Ordering::SeqCst) {
      return Vec::new();
    }

    if map.values().all(|entry| entry.pending.is_none()) {
      map = match inner.coalesce_cv.wait(map) {
        Ok(lock) => lock,
        Err(poisoned) => poisoned.into_inner(),
      };
      continue;
    }

    let now = Instant::now();
    let mut due_keys: Vec<CoalesceKey> = Vec::new();
    let mut next_due_at: Option<Instant> = None;

    for (key, entry) in map.iter() {
      let Some(_) = entry.pending else { continue };
      let due_at = entry.last_emit_at + entry.interval;
      if due_at <= now {
        due_keys.push(*key);
      } else {
        next_due_at = Some(match next_due_at {
          Some(existing) => existing.min(due_at),
          None => due_at,
        });
      }
    }

    if due_keys.is_empty() {
      if let Some(next_due_at) = next_due_at {
        let wait = next_due_at.saturating_duration_since(now);
        map = match inner.coalesce_cv.wait_timeout(map, wait) {
          Ok((lock, _)) => lock,
          Err(poisoned) => poisoned.into_inner().0,
        };
        continue;
      }

      map = match inner.coalesce_cv.wait(map) {
        Ok(lock) => lock,
        Err(poisoned) => poisoned.into_inner(),
      };
      continue;
    }

    let now = Instant::now();
    let mut due: Vec<QueueItem> = Vec::new();
    for key in due_keys {
      if let Some(entry) = map.get_mut(&key) {
        if let Some(item) = entry.pending.take() {
          entry.last_emit_at = now;
          due.push(item);
        }
      }
    }

    return due;
  }
}

fn drop_one_droppable_oldest(queue: &mut VecDeque<QueueItem>) -> Option<QueueItem> {
  let idx = queue.iter().position(|item| item.droppable)?;
  Some(queue.remove(idx)?)
}

fn drop_one_droppable_lowest_priority(queue: &mut VecDeque<QueueItem>) -> Option<QueueItem> {
  let mut best: Option<(usize, Priority)> = None;
  for (idx, item) in queue.iter().enumerate() {
    if !item.droppable {
      continue;
    }
    match best {
      Some((_, best_prio)) if item.priority >= best_prio => {}
      _ => best = Some((idx, item.priority)),
    }
  }
  let (idx, _) = best?;
  Some(queue.remove(idx)?)
}
