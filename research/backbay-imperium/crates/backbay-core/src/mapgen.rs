//! Procedural hex map generation.
//!
//! Generates diverse terrain using Perlin-like noise and biome rules.

use backbay_protocol::{Hex, TerrainId, TileSnapshot};

use crate::rng::GameRng;
use crate::rules::CompiledRules;

/// Configuration for map generation.
#[derive(Clone, Debug)]
pub struct MapGenConfig {
    pub width: u32,
    pub height: u32,
    pub num_players: u32,
    pub wrap_horizontal: bool,
    /// Fraction of tiles that should be water (0.0-1.0)
    pub water_ratio: f32,
    /// How hilly/mountainous the terrain should be (0.0-1.0)
    pub elevation_variance: f32,
    /// Resource density (0.0-1.0)
    pub resource_density: f32,
}

impl Default for MapGenConfig {
    fn default() -> Self {
        Self {
            width: 60,
            height: 40,
            num_players: 2,
            wrap_horizontal: true,
            water_ratio: 0.4,
            elevation_variance: 0.5,
            resource_density: 0.15,
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct TerrainPalette {
    plains: TerrainId,
    grassland: TerrainId,
    hills: TerrainId,
    mountains: TerrainId,
    coast: TerrainId,
    ocean: TerrainId,
}

impl TerrainPalette {
    fn from_rules(rules: &CompiledRules) -> Self {
        let plains = rules
            .terrain_id("plains")
            .unwrap_or_else(|| TerrainId::new(0));
        let grassland = rules.terrain_id("grassland").unwrap_or(plains);
        let hills = rules.terrain_id("hills").unwrap_or(plains);
        let mountains = rules.terrain_id("mountains").unwrap_or(hills);
        let coast = rules.terrain_id("coast").unwrap_or(plains);
        let ocean = rules.terrain_id("ocean").unwrap_or(mountains);

        Self {
            plains,
            grassland,
            hills,
            mountains,
            coast,
            ocean,
        }
    }

    fn is_water(self, terrain: TerrainId) -> bool {
        terrain == self.ocean || terrain == self.coast
    }
}

/// Resource type constants.
pub mod resource {
    use backbay_protocol::ResourceId;

    pub const WHEAT: ResourceId = ResourceId::new(0);
    pub const CATTLE: ResourceId = ResourceId::new(1);
    pub const HORSES: ResourceId = ResourceId::new(2);
    pub const IRON: ResourceId = ResourceId::new(3);
    pub const COAL: ResourceId = ResourceId::new(4);
    pub const OIL: ResourceId = ResourceId::new(5);
    pub const GOLD: ResourceId = ResourceId::new(6);
    pub const GEMS: ResourceId = ResourceId::new(7);
    pub const FISH: ResourceId = ResourceId::new(8);
    pub const STONE: ResourceId = ResourceId::new(9);
}

/// Result of map generation.
pub struct GeneratedMap {
    pub tiles: Vec<TileSnapshot>,
    pub width: u32,
    pub height: u32,
    pub wrap_horizontal: bool,
    /// Suggested starting positions for players.
    pub start_positions: Vec<Hex>,
}

/// Generate a map with the given configuration and seed.
pub fn generate_map(rules: &CompiledRules, config: &MapGenConfig, seed: u64) -> GeneratedMap {
    let mut rng = GameRng::seed_from_u64(seed);
    let size = (config.width * config.height) as usize;
    let palette = TerrainPalette::from_rules(rules);

    // Generate base noise layers
    let elevation = generate_noise_layer(config.width, config.height, &mut rng, 4, 0.6);
    let moisture = generate_noise_layer(config.width, config.height, &mut rng, 3, 0.5);
    let temperature = generate_temperature_layer(config.height);

    // Determine sea level based on water ratio
    let sea_level = calculate_percentile(&elevation, config.water_ratio);

    // Generate terrain from noise
    let mut tiles: Vec<TileSnapshot> = Vec::with_capacity(size);
    for y in 0..config.height {
        for x in 0..config.width {
            let idx = (y * config.width + x) as usize;
            let elev = elevation[idx];
            let moist = moisture[idx];
            let temp = temperature[y as usize];

            let terrain = determine_terrain(
                palette,
                elev,
                moist,
                temp,
                sea_level,
                config.elevation_variance,
            );

            tiles.push(TileSnapshot {
                terrain,
                owner: None,
                city: None,
                improvement: None,
                resource: None,
            });
        }
    }

    // Mark coastal tiles
    mark_coastal_tiles(
        palette,
        &mut tiles,
        config.width,
        config.height,
        config.wrap_horizontal,
    );

    // Place resources
    place_resources(
        palette,
        &mut tiles,
        config.width,
        config.height,
        &mut rng,
        config.resource_density,
    );

    // Find starting positions
    let start_positions = find_start_positions(
        palette,
        &tiles,
        config.width,
        config.height,
        config.num_players,
        config.wrap_horizontal,
        &mut rng,
    );

    GeneratedMap {
        tiles,
        width: config.width,
        height: config.height,
        wrap_horizontal: config.wrap_horizontal,
        start_positions,
    }
}

/// Generate a noise layer using multiple octaves.
fn generate_noise_layer(
    width: u32,
    height: u32,
    rng: &mut GameRng,
    octaves: u32,
    persistence: f32,
) -> Vec<f32> {
    let size = (width * height) as usize;
    let mut result = vec![0.0f32; size];

    let mut amplitude = 1.0f32;
    let mut total_amplitude = 0.0f32;

    for octave in 0..octaves {
        let scale = 1 << octave;
        let grid_w = (width / scale.max(1)).max(2);
        let grid_h = (height / scale.max(1)).max(2);

        // Generate random gradient grid
        let grid_size = (grid_w * grid_h) as usize;
        let gradients: Vec<(f32, f32)> = (0..grid_size)
            .map(|_| {
                let angle = rng.next_f32() * std::f32::consts::TAU;
                (angle.cos(), angle.sin())
            })
            .collect();

        // Sample noise
        for y in 0..height {
            for x in 0..width {
                let idx = (y * width + x) as usize;
                let fx = (x as f32 / width as f32) * (grid_w - 1) as f32;
                let fy = (y as f32 / height as f32) * (grid_h - 1) as f32;

                let value = perlin_2d(fx, fy, grid_w, &gradients);
                result[idx] += value * amplitude;
            }
        }

        total_amplitude += amplitude;
        amplitude *= persistence;
    }

    // Normalize
    for val in &mut result {
        *val = (*val / total_amplitude + 1.0) * 0.5;
    }

    result
}

/// 2D Perlin noise interpolation.
fn perlin_2d(x: f32, y: f32, grid_w: u32, gradients: &[(f32, f32)]) -> f32 {
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let x1 = x0 + 1;
    let y1 = y0 + 1;

    let sx = x - x0 as f32;
    let sy = y - y0 as f32;

    // Smootherstep
    let u = sx * sx * sx * (sx * (sx * 6.0 - 15.0) + 10.0);
    let v = sy * sy * sy * (sy * (sy * 6.0 - 15.0) + 10.0);

    let grad_idx = |gx: i32, gy: i32| -> usize {
        let gx = gx.rem_euclid(grid_w as i32) as usize;
        let gy = gy.rem_euclid((gradients.len() / grid_w as usize) as i32) as usize;
        (gy * grid_w as usize + gx).min(gradients.len() - 1)
    };

    let dot_grid = |gx: i32, gy: i32, dx: f32, dy: f32| -> f32 {
        let (gvx, gvy) = gradients[grad_idx(gx, gy)];
        dx * gvx + dy * gvy
    };

    let n00 = dot_grid(x0, y0, sx, sy);
    let n10 = dot_grid(x1, y0, sx - 1.0, sy);
    let n01 = dot_grid(x0, y1, sx, sy - 1.0);
    let n11 = dot_grid(x1, y1, sx - 1.0, sy - 1.0);

    let nx0 = n00 + u * (n10 - n00);
    let nx1 = n01 + u * (n11 - n01);

    nx0 + v * (nx1 - nx0)
}

/// Generate temperature based on latitude (y position).
fn generate_temperature_layer(height: u32) -> Vec<f32> {
    (0..height)
        .map(|y| {
            // Temperature highest at equator (middle), lowest at poles
            let lat = (y as f32 / height as f32) * 2.0 - 1.0; // -1 to 1
            1.0 - lat.abs()
        })
        .collect()
}

/// Calculate the value at a given percentile.
fn calculate_percentile(values: &[f32], percentile: f32) -> f32 {
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let idx = ((percentile * sorted.len() as f32) as usize).min(sorted.len() - 1);
    sorted[idx]
}

/// Determine terrain type from elevation, moisture, and temperature.
fn determine_terrain(
    palette: TerrainPalette,
    elevation: f32,
    moisture: f32,
    temperature: f32,
    sea_level: f32,
    elevation_variance: f32,
) -> TerrainId {
    // Water
    if elevation < sea_level {
        return palette.ocean;
    }

    // High elevation = mountains/hills
    let mountain_threshold = sea_level + (1.0 - sea_level) * (0.8 - elevation_variance * 0.3);
    let hills_threshold = sea_level + (1.0 - sea_level) * (0.6 - elevation_variance * 0.2);

    if elevation > mountain_threshold {
        return palette.mountains;
    }
    if elevation > hills_threshold {
        return palette.hills;
    }

    // Biome based on temperature and moisture
    if temperature < 0.2 {
        // Cold regions
        palette.plains
    } else if temperature > 0.8 {
        // Hot regions
        if moisture < 0.3 {
            palette.plains
        } else if moisture > 0.7 {
            palette.grassland
        } else {
            palette.plains
        }
    } else {
        // Temperate regions
        if moisture < 0.3 {
            palette.plains
        } else if moisture > 0.7 {
            palette.grassland
        } else {
            palette.grassland
        }
    }
}

/// Mark tiles adjacent to ocean as coast.
fn mark_coastal_tiles(
    palette: TerrainPalette,
    tiles: &mut [TileSnapshot],
    width: u32,
    height: u32,
    wrap: bool,
) {
    let directions = Hex::DIRECTIONS;

    let mut coastal_indices = Vec::new();

    for y in 0..height as i32 {
        for x in 0..width as i32 {
            let idx = (y as u32 * width + x as u32) as usize;
            if tiles[idx].terrain != palette.ocean {
                continue;
            }

            // Check if any neighbor is land
            let hex = Hex { q: x, r: y };
            for dir in directions {
                let neighbor = hex + dir;
                let nx = if wrap {
                    neighbor.q.rem_euclid(width as i32)
                } else if neighbor.q < 0 || neighbor.q >= width as i32 {
                    continue;
                } else {
                    neighbor.q
                };

                if neighbor.r < 0 || neighbor.r >= height as i32 {
                    continue;
                }

                let nidx = (neighbor.r as u32 * width + nx as u32) as usize;
                if tiles[nidx].terrain != palette.ocean && tiles[nidx].terrain != palette.coast {
                    coastal_indices.push(idx);
                    break;
                }
            }
        }
    }

    for idx in coastal_indices {
        tiles[idx].terrain = palette.coast;
    }
}

/// Place resources on appropriate terrain.
fn place_resources(
    palette: TerrainPalette,
    tiles: &mut [TileSnapshot],
    width: u32,
    height: u32,
    rng: &mut GameRng,
    density: f32,
) {
    for y in 0..height {
        for x in 0..width {
            let idx = (y * width + x) as usize;
            let terrain = tiles[idx].terrain;

            // Skip water (except coast for fish)
            if terrain == palette.ocean {
                continue;
            }

            // Random chance to place resource
            if rng.next_f32() > density {
                continue;
            }

            let resource = match terrain {
                t if t == palette.coast => Some(resource::FISH),
                t if t == palette.grassland => match rng.next_u32() % 3 {
                    0 => Some(resource::WHEAT),
                    1 => Some(resource::CATTLE),
                    _ => None,
                },
                t if t == palette.plains => match rng.next_u32() % 4 {
                    0 => Some(resource::HORSES),
                    1 => Some(resource::WHEAT),
                    _ => None,
                },
                t if t == palette.hills => match rng.next_u32() % 4 {
                    0 => Some(resource::IRON),
                    1 => Some(resource::COAL),
                    2 => Some(resource::STONE),
                    _ => None,
                },
                t if t == palette.mountains => match rng.next_u32() % 3 {
                    0 => Some(resource::GOLD),
                    1 => Some(resource::GEMS),
                    _ => None,
                },
                _ => None,
            };

            tiles[idx].resource = resource;
        }
    }
}

/// Find good starting positions for players, spread apart.
fn find_start_positions(
    palette: TerrainPalette,
    tiles: &[TileSnapshot],
    width: u32,
    height: u32,
    num_players: u32,
    wrap: bool,
    rng: &mut GameRng,
) -> Vec<Hex> {
    // Find all valid starting tiles (grassland/plains).
    let mut candidates: Vec<(usize, u32)> = Vec::new();

    for y in 0..height {
        for x in 0..width {
            let idx = (y * width + x) as usize;
            let terrain = tiles[idx].terrain;

            // Good starting terrains
            if terrain == palette.grassland || terrain == palette.plains {
                // Score based on nearby resources and fertile land
                let score =
                    score_start_position(palette, tiles, x as i32, y as i32, width, height, wrap);
                candidates.push((idx, score));
            }
        }
    }

    if candidates.is_empty() {
        // Fallback: just return some land tiles
        return (0..num_players)
            .map(|i| {
                let x = ((i + 1) * width / (num_players + 1)) as i32;
                let y = (height / 2) as i32;
                Hex { q: x, r: y }
            })
            .collect();
    }

    // Sort by score (descending)
    candidates.sort_by(|a, b| b.1.cmp(&a.1));

    // Pick spread-out positions
    let mut positions = Vec::new();
    let min_distance = ((width + height) / (num_players + 1)) as i32;

    for &(idx, _score) in &candidates {
        let x = (idx % width as usize) as i32;
        let y = (idx / width as usize) as i32;
        let hex = Hex { q: x, r: y };

        // Check distance from existing positions
        let too_close = positions.iter().any(|other: &Hex| {
            let dist = hex_distance(hex, *other, width as i32, wrap);
            dist < min_distance
        });

        if !too_close {
            positions.push(hex);
            if positions.len() >= num_players as usize {
                break;
            }
        }
    }

    // If we couldn't find enough, add random valid tiles
    while positions.len() < num_players as usize {
        let idx = rng.next_u32() as usize % candidates.len();
        let x = (candidates[idx].0 % width as usize) as i32;
        let y = (candidates[idx].0 / width as usize) as i32;
        positions.push(Hex { q: x, r: y });
    }

    positions
}

/// Score a potential starting position.
fn score_start_position(
    palette: TerrainPalette,
    tiles: &[TileSnapshot],
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    wrap: bool,
) -> u32 {
    let mut score = 0u32;
    let center = Hex { q: x, r: y };

    // Check tiles in radius 3
    for dy in -3..=3 {
        for dx in -3..=3 {
            let nx = if wrap {
                (x + dx).rem_euclid(width as i32)
            } else if x + dx < 0 || x + dx >= width as i32 {
                continue;
            } else {
                x + dx
            };

            let ny = y + dy;
            if ny < 0 || ny >= height as i32 {
                continue;
            }

            let dist = center.distance(Hex { q: x + dx, r: ny });
            if dist > 3 {
                continue;
            }

            let idx = (ny as u32 * width + nx as u32) as usize;
            let tile = &tiles[idx];

            // Score based on terrain
            score += match tile.terrain {
                t if t == palette.grassland => 3,
                t if t == palette.plains => 2,
                t if t == palette.hills => 2,
                t if t == palette.coast => 1,
                t if t == palette.ocean => 0,
                t if t == palette.mountains => 0,
                _ => 1,
            };

            // Bonus for resources
            if tile.resource.is_some() {
                score += 5;
            }
        }
    }

    score
}

/// Calculate hex distance, accounting for wrap.
fn hex_distance(a: Hex, b: Hex, width: i32, wrap: bool) -> i32 {
    if wrap {
        // Consider wrapping
        let dx1 = (b.q - a.q).abs();
        let dx2 = width - dx1;
        let dx = dx1.min(dx2);
        let dy = (b.r - a.r).abs();
        (dx + dy + (dx - dy).abs()) / 2
    } else {
        a.distance(b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{load_rules, RulesSource};

    #[test]
    fn generate_map_basic() {
        let config = MapGenConfig {
            width: 20,
            height: 15,
            num_players: 2,
            ..Default::default()
        };

        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let map = generate_map(&rules, &config, 12345);

        assert_eq!(map.tiles.len(), 20 * 15);
        assert_eq!(map.width, 20);
        assert_eq!(map.height, 15);
        assert_eq!(map.start_positions.len(), 2);

        // Check we have some variety of terrain
        let mut terrain_counts = std::collections::HashMap::new();
        for tile in &map.tiles {
            *terrain_counts.entry(tile.terrain.raw).or_insert(0) += 1;
        }
        assert!(
            terrain_counts.len() >= 3,
            "Should have at least 3 terrain types"
        );
    }

    #[test]
    fn deterministic_generation() {
        let config = MapGenConfig::default();
        let rules = load_rules(RulesSource::Embedded).expect("rules load");

        let map1 = generate_map(&rules, &config, 42);
        let map2 = generate_map(&rules, &config, 42);

        for (t1, t2) in map1.tiles.iter().zip(map2.tiles.iter()) {
            assert_eq!(t1.terrain, t2.terrain);
            assert_eq!(t1.resource, t2.resource);
        }

        assert_eq!(map1.start_positions, map2.start_positions);
    }

    #[test]
    fn different_seeds_different_maps() {
        let config = MapGenConfig {
            width: 20,
            height: 15,
            ..Default::default()
        };
        let rules = load_rules(RulesSource::Embedded).expect("rules load");

        let map1 = generate_map(&rules, &config, 1);
        let map2 = generate_map(&rules, &config, 2);

        let different = map1
            .tiles
            .iter()
            .zip(map2.tiles.iter())
            .any(|(t1, t2)| t1.terrain != t2.terrain);
        assert!(different, "Different seeds should produce different maps");
    }

    #[test]
    fn start_positions_on_land() {
        let config = MapGenConfig {
            width: 30,
            height: 20,
            num_players: 4,
            ..Default::default()
        };

        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let palette = TerrainPalette::from_rules(&rules);
        let map = generate_map(&rules, &config, 99999);

        for pos in &map.start_positions {
            let idx = (pos.r as u32 * config.width + pos.q as u32) as usize;
            let terrain = map.tiles[idx].terrain;
            assert!(
                !palette.is_water(terrain),
                "Start position should be on land"
            );
        }
    }
}
