/// Deterministic PRNG with 256-bit state (32 bytes), suitable for snapshots/replays.
///
/// This is `xoshiro256**` seeded via SplitMix64.
#[derive(Clone, Copy, Debug)]
pub struct GameRng {
    state: [u64; 4],
}

impl GameRng {
    pub fn seed_from_u64(seed: u64) -> Self {
        let mut sm = SplitMix64 { state: seed };
        Self {
            state: [sm.next(), sm.next(), sm.next(), sm.next()],
        }
    }

    pub fn state_bytes(&self) -> [u8; 32] {
        let mut out = [0_u8; 32];
        for (i, word) in self.state.iter().enumerate() {
            out[i * 8..(i + 1) * 8].copy_from_slice(&word.to_le_bytes());
        }
        out
    }

    pub fn from_state_bytes(bytes: [u8; 32]) -> Self {
        let mut state = [0_u64; 4];
        for (i, word) in state.iter_mut().enumerate() {
            let mut w = [0_u8; 8];
            w.copy_from_slice(&bytes[i * 8..(i + 1) * 8]);
            *word = u64::from_le_bytes(w);
        }
        Self { state }
    }

    pub fn next_u64(&mut self) -> u64 {
        // xoshiro256**
        let result = self.state[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);

        let t = self.state[1] << 17;

        self.state[2] ^= self.state[0];
        self.state[3] ^= self.state[1];
        self.state[1] ^= self.state[2];
        self.state[0] ^= self.state[3];

        self.state[2] ^= t;

        self.state[3] = self.state[3].rotate_left(45);

        result
    }

    pub fn next_u32(&mut self) -> u32 {
        (self.next_u64() >> 32) as u32
    }

    pub fn gen_range_i32(&mut self, range: std::ops::Range<i32>) -> i32 {
        let start = range.start;
        let end = range.end;
        assert!(start < end, "empty range");

        let span = (end as i64 - start as i64) as u32;
        let threshold = u32::MAX - (u32::MAX % span);
        loop {
            let x = self.next_u32();
            if x < threshold {
                return start + (x % span) as i32;
            }
        }
    }

    /// Generate a random f32 in [0.0, 1.0).
    pub fn next_f32(&mut self) -> f32 {
        // Use top 24 bits for mantissa (f32 has 23-bit mantissa + implicit 1)
        (self.next_u32() >> 8) as f32 / (1u32 << 24) as f32
    }
}

struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    fn next(&mut self) -> u64 {
        let mut z = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        self.state = z;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }
}
