use backbay_protocol::EntityId;

#[derive(Clone, Debug)]
struct Slot<T> {
    generation: u32,
    value: Option<T>,
}

impl<T> Default for Slot<T> {
    fn default() -> Self {
        Self {
            generation: 0,
            value: None,
        }
    }
}

/// Deterministic, generational storage for entities.
///
/// - Stable iteration order: ascending slot index.
/// - Safe handles: `EntityId { index, generation }`.
#[derive(Clone, Debug)]
pub struct EntityStore<T> {
    slots: Vec<Slot<T>>,
    free: Vec<u32>,
}

impl<T> Default for EntityStore<T> {
    fn default() -> Self {
        Self {
            slots: Vec::new(),
            free: Vec::new(),
        }
    }
}

impl<T> EntityStore<T> {
    pub fn insert(&mut self, value: T) -> EntityId {
        if let Some(index) = self.free.pop() {
            let slot = &mut self.slots[index as usize];
            debug_assert!(slot.value.is_none());
            slot.value = Some(value);
            EntityId::new(index, slot.generation)
        } else {
            let index = self.slots.len() as u32;
            self.slots.push(Slot {
                generation: 0,
                value: Some(value),
            });
            EntityId::new(index, 0)
        }
    }

    pub fn get(&self, id: EntityId) -> Option<&T> {
        let slot = self.slots.get(id.index as usize)?;
        if slot.generation == id.generation {
            slot.value.as_ref()
        } else {
            None
        }
    }

    pub fn get_mut(&mut self, id: EntityId) -> Option<&mut T> {
        let slot = self.slots.get_mut(id.index as usize)?;
        if slot.generation == id.generation {
            slot.value.as_mut()
        } else {
            None
        }
    }

    pub fn remove(&mut self, id: EntityId) -> Option<T> {
        let slot = self.slots.get_mut(id.index as usize)?;
        if slot.generation != id.generation {
            return None;
        }
        let value = slot.value.take()?;
        slot.generation = slot.generation.wrapping_add(1);
        self.free.push(id.index);
        Some(value)
    }

    pub fn get2_mut(&mut self, a: EntityId, b: EntityId) -> Option<(&mut T, &mut T)> {
        if a.index == b.index {
            return None;
        }

        let (low, high, a_is_low) = if a.index < b.index {
            (a, b, true)
        } else {
            (b, a, false)
        };

        let high_index = high.index as usize;
        if high_index >= self.slots.len() {
            return None;
        }

        let (left, right) = self.slots.split_at_mut(high_index);
        let low_slot = left.get_mut(low.index as usize)?;
        let high_slot = right.get_mut(0)?;

        if low_slot.generation != low.generation || high_slot.generation != high.generation {
            return None;
        }

        let low_val = low_slot.value.as_mut()?;
        let high_val = high_slot.value.as_mut()?;

        if a_is_low {
            Some((low_val, high_val))
        } else {
            Some((high_val, low_val))
        }
    }

    pub fn iter_ordered(&self) -> impl Iterator<Item = (EntityId, &T)> {
        self.slots.iter().enumerate().filter_map(|(index, slot)| {
            let value = slot.value.as_ref()?;
            Some((EntityId::new(index as u32, slot.generation), value))
        })
    }

    pub fn iter_ordered_mut(&mut self) -> impl Iterator<Item = (EntityId, &mut T)> {
        self.slots
            .iter_mut()
            .enumerate()
            .filter_map(|(index, slot)| {
                let value = slot.value.as_mut()?;
                Some((EntityId::new(index as u32, slot.generation), value))
            })
    }
}
