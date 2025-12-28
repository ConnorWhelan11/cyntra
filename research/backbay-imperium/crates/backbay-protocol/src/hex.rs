use serde::{Deserialize, Serialize};

/// Axial coordinates for a hex grid (q, r). The implicit cube coordinate is `s = -q - r`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Hex {
    pub q: i32,
    pub r: i32,
}

impl Hex {
    pub const DIRECTIONS: [Hex; 6] = [
        Hex { q: 1, r: 0 },  // East
        Hex { q: 1, r: -1 }, // Northeast
        Hex { q: 0, r: -1 }, // Northwest
        Hex { q: -1, r: 0 }, // West
        Hex { q: -1, r: 1 }, // Southwest
        Hex { q: 0, r: 1 },  // Southeast
    ];

    #[inline]
    pub const fn s(self) -> i32 {
        -self.q - self.r
    }

    pub fn neighbors(self) -> impl Iterator<Item = Hex> {
        Self::DIRECTIONS.into_iter().map(move |d| self + d)
    }

    #[inline]
    pub fn distance(self, other: Hex) -> i32 {
        ((self.q - other.q).abs() + (self.r - other.r).abs() + (self.s() - other.s()).abs()) / 2
    }

    /// All hexes at exactly `radius` distance, in a deterministic ring order.
    pub fn ring(self, radius: i32) -> impl Iterator<Item = Hex> {
        RingIter::new(self, radius)
    }

    /// All hexes with distance `<= radius`, in a deterministic order.
    pub fn ring_inclusive(self, radius: i32) -> impl Iterator<Item = Hex> {
        InclusiveRingIter::new(self, radius)
    }
}

impl std::ops::Add for Hex {
    type Output = Hex;

    fn add(self, other: Hex) -> Hex {
        Hex {
            q: self.q + other.q,
            r: self.r + other.r,
        }
    }
}

struct RingIter {
    radius: i32,
    side: usize,
    step: i32,
    current: Option<Hex>,
}

impl RingIter {
    fn new(center: Hex, radius: i32) -> Self {
        if radius <= 0 {
            return Self {
                radius,
                side: 0,
                step: 0,
                current: None,
            };
        }

        let start = center + Hex::DIRECTIONS[4] * radius;
        Self {
            radius,
            side: 0,
            step: 0,
            current: Some(start),
        }
    }
}

impl Iterator for RingIter {
    type Item = Hex;

    fn next(&mut self) -> Option<Self::Item> {
        let hex = self.current?;
        let out = hex;

        self.step += 1;
        if self.step >= self.radius {
            self.step = 0;
            self.side += 1;
            if self.side >= 6 {
                self.current = None;
                return Some(out);
            }
        }

        let direction = Hex::DIRECTIONS[self.side];
        self.current = Some(hex + direction);
        Some(out)
    }
}

struct InclusiveRingIter {
    center: Hex,
    radius: i32,
    dq: i32,
    dr: i32,
    dr_min: i32,
    dr_max: i32,
    started: bool,
}

impl InclusiveRingIter {
    fn new(center: Hex, radius: i32) -> Self {
        let radius = radius.max(0);
        let dq = -radius;
        let (dr_min, dr_max) = dr_bounds(dq, radius);
        Self {
            center,
            radius,
            dq,
            dr: dr_min,
            dr_min,
            dr_max,
            started: false,
        }
    }
}

impl Iterator for InclusiveRingIter {
    type Item = Hex;

    fn next(&mut self) -> Option<Self::Item> {
        if self.radius == 0 && self.started {
            return None;
        }
        self.started = true;

        if self.dq > self.radius {
            return None;
        }

        let out = Hex {
            q: self.center.q + self.dq,
            r: self.center.r + self.dr,
        };

        self.dr += 1;
        if self.dr > self.dr_max {
            self.dq += 1;
            if self.dq <= self.radius {
                let (dr_min, dr_max) = dr_bounds(self.dq, self.radius);
                self.dr_min = dr_min;
                self.dr_max = dr_max;
                self.dr = dr_min;
            }
        }

        Some(out)
    }
}

#[inline]
fn dr_bounds(dq: i32, radius: i32) -> (i32, i32) {
    // For axial coords (dq, dr), the third cube delta is ds = -dq - dr.
    // Constraint: max(|dq|, |dr|, |ds|) <= radius
    let dr_min = (-radius).max(-dq - radius);
    let dr_max = radius.min(-dq + radius);
    (dr_min, dr_max)
}

impl std::ops::Mul<i32> for Hex {
    type Output = Hex;

    fn mul(self, rhs: i32) -> Self::Output {
        Hex {
            q: self.q * rhs,
            r: self.r * rhs,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_distance_matches_expected() {
        let a = Hex { q: 0, r: 0 };
        let b = Hex { q: 3, r: -1 };
        assert_eq!(a.distance(b), 3);
    }

    #[test]
    fn hex_neighbors_has_six_adjacent() {
        let center = Hex { q: 0, r: 0 };
        let neighbors: Vec<_> = center.neighbors().collect();
        assert_eq!(neighbors.len(), 6);
        assert!(neighbors.iter().all(|n| center.distance(*n) == 1));
    }

    #[test]
    fn ring_inclusive_counts_match_redblob_formula() {
        let center = Hex { q: 0, r: 0 };
        for radius in 0..=4 {
            let count = center.ring_inclusive(radius).count() as i32;
            let expected = 1 + 3 * radius * (radius + 1);
            assert_eq!(count, expected);
        }
    }
}
