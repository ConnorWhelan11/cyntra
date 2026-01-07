//! Geometry critic for mesh validation.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Configuration for geometry validation.
#[derive(Debug, Clone)]
pub struct GeometryConfig {
    pub min_triangles: usize,
    pub max_triangles: usize,
    pub require_normals: bool,
    pub require_uvs: bool,
    pub min_score: f32,
}

impl Default for GeometryConfig {
    fn default() -> Self {
        Self {
            min_triangles: 100,
            max_triangles: 500_000,
            require_normals: true,
            require_uvs: false,
            min_score: 0.6,
        }
    }
}

/// Result of geometry evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometryResult {
    pub passed: bool,
    pub score: f32,
    pub vertex_count: usize,
    pub triangle_count: usize,
    pub has_normals: bool,
    pub has_uvs: bool,
    pub bounds: [f32; 3],
    pub fail_codes: Vec<String>,
}

/// Critic for validating mesh geometry.
pub struct GeometryCritic {
    config: GeometryConfig,
}

impl GeometryCritic {
    pub fn new() -> Self {
        Self::with_config(GeometryConfig::default())
    }

    pub fn with_config(config: GeometryConfig) -> Self {
        Self { config }
    }

    /// Evaluate a GLB/glTF mesh file.
    pub fn evaluate(&self, path: &Path) -> Result<GeometryResult> {
        let (document, buffers, _) =
            gltf::import(path).with_context(|| format!("Failed to load {}", path.display()))?;

        let mut total_vertices = 0usize;
        let mut total_triangles = 0usize;
        let mut has_normals = true;
        let mut has_uvs = true;
        let mut min_bounds = [f32::MAX; 3];
        let mut max_bounds = [f32::MIN; 3];
        let mut fail_codes = Vec::new();

        for mesh in document.meshes() {
            for primitive in mesh.primitives() {
                // Count vertices
                if let Some(positions) = primitive.get(&gltf::Semantic::Positions) {
                    let count = positions.count();
                    total_vertices += count;

                    // Update bounds
                    let accessor = positions;
                    let view = accessor.view().unwrap();
                    let buffer = &buffers[view.buffer().index()];
                    let offset = view.offset() + accessor.offset();
                    let stride = view.stride().unwrap_or(12);

                    for i in 0..count {
                        let base = offset + i * stride;
                        if base + 12 <= buffer.len() {
                            let x = f32::from_le_bytes([
                                buffer[base],
                                buffer[base + 1],
                                buffer[base + 2],
                                buffer[base + 3],
                            ]);
                            let y = f32::from_le_bytes([
                                buffer[base + 4],
                                buffer[base + 5],
                                buffer[base + 6],
                                buffer[base + 7],
                            ]);
                            let z = f32::from_le_bytes([
                                buffer[base + 8],
                                buffer[base + 9],
                                buffer[base + 10],
                                buffer[base + 11],
                            ]);

                            min_bounds[0] = min_bounds[0].min(x);
                            min_bounds[1] = min_bounds[1].min(y);
                            min_bounds[2] = min_bounds[2].min(z);
                            max_bounds[0] = max_bounds[0].max(x);
                            max_bounds[1] = max_bounds[1].max(y);
                            max_bounds[2] = max_bounds[2].max(z);
                        }
                    }
                }

                // Check normals
                if primitive.get(&gltf::Semantic::Normals).is_none() {
                    has_normals = false;
                }

                // Check UVs
                if primitive.get(&gltf::Semantic::TexCoords(0)).is_none() {
                    has_uvs = false;
                }

                // Count triangles from indices
                if let Some(indices) = primitive.indices() {
                    total_triangles += indices.count() / 3;
                } else {
                    // No indices, assume triangle list
                    total_triangles += total_vertices / 3;
                }
            }
        }

        // Calculate bounds dimensions
        let bounds = [
            max_bounds[0] - min_bounds[0],
            max_bounds[1] - min_bounds[1],
            max_bounds[2] - min_bounds[2],
        ];

        // Validate against config
        if total_triangles < self.config.min_triangles {
            fail_codes.push(format!(
                "too_few_triangles:{}",
                total_triangles
            ));
        }

        if total_triangles > self.config.max_triangles {
            fail_codes.push(format!(
                "too_many_triangles:{}",
                total_triangles
            ));
        }

        if self.config.require_normals && !has_normals {
            fail_codes.push("missing_normals".to_string());
        }

        if self.config.require_uvs && !has_uvs {
            fail_codes.push("missing_uvs".to_string());
        }

        // Calculate score
        let mut score = 1.0f32;

        // Penalize triangle count issues
        if total_triangles < self.config.min_triangles {
            score *= total_triangles as f32 / self.config.min_triangles as f32;
        } else if total_triangles > self.config.max_triangles {
            score *= self.config.max_triangles as f32 / total_triangles as f32;
        }

        // Penalize missing attributes
        if self.config.require_normals && !has_normals {
            score *= 0.5;
        }
        if self.config.require_uvs && !has_uvs {
            score *= 0.7;
        }

        let passed = fail_codes.is_empty() && score >= self.config.min_score;

        Ok(GeometryResult {
            passed,
            score,
            vertex_count: total_vertices,
            triangle_count: total_triangles,
            has_normals,
            has_uvs,
            bounds,
            fail_codes,
        })
    }
}

impl Default for GeometryCritic {
    fn default() -> Self {
        Self::new()
    }
}
