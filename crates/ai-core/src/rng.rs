/// Deterministic RNG helpers.
///
/// This is intentionally small and dependency-free. It is **not** cryptographic.

pub trait DeterministicRng {
    fn next_u64(&mut self) -> u64;

    fn next_u32(&mut self) -> u32 {
        self.next_u64() as u32
    }

    fn next_f32_unit(&mut self) -> f32 {
        // 24 bits of mantissa -> (0, 1)
        let x = (self.next_u32() >> 8) as u32;
        (x as f32) / ((1u32 << 24) as f32)
    }

    fn next_bool(&mut self) -> bool {
        (self.next_u64() & 1) == 1
    }
}

/// SplitMix64: good seeding RNG and small deterministic generator.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn step(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }
}

impl DeterministicRng for SplitMix64 {
    fn next_u64(&mut self) -> u64 {
        self.step()
    }
}

pub fn mix64(mut x: u64) -> u64 {
    x ^= x >> 30;
    x = x.wrapping_mul(0xBF58476D1CE4E5B9);
    x ^= x >> 27;
    x = x.wrapping_mul(0x94D049BB133111EB);
    x ^ (x >> 31)
}

pub fn derive_seed(global_seed: u64, agent_id: u64, stream: u64) -> u64 {
    let x = global_seed ^ mix64(agent_id.wrapping_add(0x9E3779B97F4A7C15)) ^ mix64(stream);
    mix64(x)
}

