use std::any::Any;
use std::collections::BTreeMap;
use std::marker::PhantomData;

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct BbKey<T: 'static> {
    id: u64,
    _phantom: PhantomData<fn() -> T>,
}

impl<T: 'static> Copy for BbKey<T> {}

impl<T: 'static> Clone for BbKey<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T: 'static> BbKey<T> {
    pub const fn new(id: u64) -> Self {
        Self {
            id,
            _phantom: PhantomData,
        }
    }

    pub fn id(self) -> u64 {
        self.id
    }
}

#[derive(Default)]
pub struct Blackboard {
    values: BTreeMap<u64, Box<dyn Any>>,
}

impl Blackboard {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clear(&mut self) {
        self.values.clear();
    }

    pub fn contains<T: 'static>(&self, key: BbKey<T>) -> bool {
        self.values.contains_key(&key.id)
    }

    pub fn set<T: 'static>(&mut self, key: BbKey<T>, value: T) {
        self.values.insert(key.id, Box::new(value));
    }

    pub fn get<T: 'static>(&self, key: BbKey<T>) -> Option<&T> {
        let value = self.values.get(&key.id)?;
        value.downcast_ref::<T>().or_else(|| {
            panic!(
                "blackboard type mismatch for key id={} (stored type differs from requested)",
                key.id
            )
        })
    }

    pub fn get_mut<T: 'static>(&mut self, key: BbKey<T>) -> Option<&mut T> {
        let value = self.values.get_mut(&key.id)?;
        value.downcast_mut::<T>().or_else(|| {
            panic!(
                "blackboard type mismatch for key id={} (stored type differs from requested)",
                key.id
            )
        })
    }

    pub fn remove<T: 'static>(&mut self, key: BbKey<T>) -> Option<T> {
        let value = self.values.remove(&key.id)?;
        value.downcast::<T>().map(|b| *b).ok().or_else(|| {
            panic!(
                "blackboard type mismatch for key id={} (stored type differs from requested)",
                key.id
            )
        })
    }
}
