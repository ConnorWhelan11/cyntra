use serde::{Deserialize, Serialize};

use backbay_protocol::{CityId, Hex, ImprovementId, PlayerId, ResourceId, TerrainId};
use std::collections::VecDeque;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImprovementOnTile {
    pub id: ImprovementId,
    pub tier: u8,
    pub worked_turns: i32,
    pub pillaged: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tile {
    pub terrain: TerrainId,
    pub improvement: Option<ImprovementOnTile>,
    pub resource: Option<ResourceId>,
    pub owner: Option<PlayerId>,
    pub city: Option<CityId>,
    #[serde(default)]
    pub river_edges: u8,
}

#[derive(Clone, Debug)]
pub struct GameMap {
    width: u32,
    height: u32,
    tiles: Vec<Tile>,
    wrap_horizontal: bool,
}

impl GameMap {
    pub fn new(width: u32, height: u32, wrap_horizontal: bool, default_terrain: TerrainId) -> Self {
        let tiles = vec![
            Tile {
                terrain: default_terrain,
                improvement: None,
                resource: None,
                owner: None,
                city: None,
                river_edges: 0,
            };
            (width as usize) * (height as usize)
        ];
        Self {
            width,
            height,
            tiles,
            wrap_horizontal,
        }
    }

    /// Create a GameMap from generated tile snapshots.
    pub fn from_tile_snapshots(
        width: u32,
        height: u32,
        wrap_horizontal: bool,
        snapshots: Vec<backbay_protocol::TileSnapshot>,
    ) -> Self {
        let tiles = snapshots
            .into_iter()
            .map(|snap| Tile {
                terrain: snap.terrain,
                improvement: snap.improvement.map(|imp| ImprovementOnTile {
                    id: imp.id,
                    tier: imp.tier,
                    worked_turns: imp.worked_turns,
                    pillaged: imp.pillaged,
                }),
                resource: snap.resource,
                owner: snap.owner,
                city: snap.city,
                river_edges: snap.river_edges,
            })
            .collect();
        Self {
            width,
            height,
            tiles,
            wrap_horizontal,
        }
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn wrap_horizontal(&self) -> bool {
        self.wrap_horizontal
    }

    pub fn len(&self) -> usize {
        self.tiles.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tiles.is_empty()
    }

    pub fn tiles(&self) -> &Vec<Tile> {
        &self.tiles
    }

    pub fn normalize_hex(&self, hex: Hex) -> Option<Hex> {
        let y = hex.r;
        if y < 0 || y >= self.height as i32 {
            return None;
        }

        let x = if self.wrap_horizontal {
            hex.q.rem_euclid(self.width as i32)
        } else if hex.q >= 0 && hex.q < self.width as i32 {
            hex.q
        } else {
            return None;
        };

        Some(Hex { q: x, r: y })
    }

    pub fn index_of(&self, hex: Hex) -> Option<usize> {
        let hex = self.normalize_hex(hex)?;
        self.hex_to_index(hex)
    }

    pub fn hex_at_index(&self, index: usize) -> Option<Hex> {
        if index >= self.tiles.len() {
            return None;
        }
        let x = (index % self.width as usize) as i32;
        let y = (index / self.width as usize) as i32;
        Some(Hex { q: x, r: y })
    }

    pub fn neighbors_indices(&self, index: usize) -> [Option<usize>; 6] {
        let Some(hex) = self.hex_at_index(index) else {
            return [None; 6];
        };
        let mut out = [None; 6];
        for (i, dir) in Hex::DIRECTIONS.into_iter().enumerate() {
            out[i] = self.index_of(hex + dir);
        }
        out
    }

    pub fn is_neighbor(&self, a: Hex, b: Hex) -> bool {
        let Some(a_index) = self.index_of(a) else {
            return false;
        };
        let Some(b_index) = self.index_of(b) else {
            return false;
        };
        self.neighbors_indices(a_index)
            .into_iter()
            .flatten()
            .any(|n| n == b_index)
    }

    /// Returns tile indices within `radius` steps of `center` (inclusive), in stable index order.
    pub fn indices_in_radius(&self, center: Hex, radius: i32) -> Vec<usize> {
        let Some(start) = self.index_of(center) else {
            return Vec::new();
        };
        let radius = radius.max(0);

        let mut dist = vec![i32::MAX; self.len()];
        dist[start] = 0;

        let mut queue = VecDeque::new();
        queue.push_back(start);

        while let Some(index) = queue.pop_front() {
            let d = dist[index];
            if d >= radius {
                continue;
            }
            for neighbor in self.neighbors_indices(index).into_iter().flatten() {
                if dist[neighbor] <= d + 1 {
                    continue;
                }
                dist[neighbor] = d + 1;
                queue.push_back(neighbor);
            }
        }

        let mut out = Vec::new();
        for (index, d) in dist.into_iter().enumerate() {
            if d <= radius {
                out.push(index);
            }
        }
        out
    }

    pub fn get(&self, hex: Hex) -> Option<&Tile> {
        self.index_of(hex).map(|i| &self.tiles[i])
    }

    pub fn get_mut(&mut self, hex: Hex) -> Option<&mut Tile> {
        self.index_of(hex).map(move |i| &mut self.tiles[i])
    }

    fn hex_to_index(&self, hex: Hex) -> Option<usize> {
        let mut x = hex.q;
        let y = hex.r;
        if y < 0 || y >= self.height as i32 {
            return None;
        }

        if self.wrap_horizontal {
            x = x.rem_euclid(self.width as i32);
        } else if x < 0 || x >= self.width as i32 {
            return None;
        }

        Some((y as usize) * (self.width as usize) + (x as usize))
    }
}
