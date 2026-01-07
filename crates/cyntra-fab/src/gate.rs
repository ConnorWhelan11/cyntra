//! Gate runner for orchestrating multiple critics.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;

use crate::critics::{ClipCritic, GeometryCritic, RealismCritic};

/// Configuration for gate evaluation.
#[derive(Debug, Clone)]
pub struct GateConfig {
    pub run_alignment: bool,
    pub run_geometry: bool,
    pub run_realism: bool,
    pub min_score: f32,
    pub require_all_pass: bool,
}

impl Default for GateConfig {
    fn default() -> Self {
        Self {
            run_alignment: true,
            run_geometry: true,
            run_realism: true,
            min_score: 0.6,
            require_all_pass: true,
        }
    }
}

/// Asset to evaluate.
pub struct Asset {
    pub mesh_path: String,
    pub render_paths: Vec<String>,
    pub prompt: String,
}

/// Result from an individual critic.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CriticResult {
    Geometry(crate::critics::geometry::GeometryResult),
    Alignment(crate::critics::clip::ClipResult),
    Realism(crate::critics::realism::RealismResult),
}

impl CriticResult {
    pub fn passed(&self) -> bool {
        match self {
            CriticResult::Geometry(r) => r.passed,
            CriticResult::Alignment(r) => r.passed,
            CriticResult::Realism(r) => r.passed,
        }
    }

    pub fn score(&self) -> f32 {
        match self {
            CriticResult::Geometry(r) => r.score,
            CriticResult::Alignment(r) => r.score,
            CriticResult::Realism(r) => r.score,
        }
    }
}

/// Result of gate evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateResult {
    pub passed: bool,
    pub aggregate_score: f32,
    pub critics: HashMap<String, CriticResult>,
    pub all_fail_codes: Vec<String>,
    pub execution_time_ms: u64,
}

/// Gate runner that orchestrates multiple critics.
pub struct GateRunner {
    config: GateConfig,
    geometry_critic: GeometryCritic,
    clip_critic: Option<ClipCritic>,
    realism_critic: Option<RealismCritic>,
}

impl GateRunner {
    /// Create a new gate runner with default configuration.
    pub fn new() -> Result<Self> {
        Self::with_config(GateConfig::default())
    }

    /// Create a new gate runner with custom configuration.
    pub fn with_config(config: GateConfig) -> Result<Self> {
        let geometry_critic = GeometryCritic::new();

        let clip_critic = if config.run_alignment {
            Some(ClipCritic::new()?)
        } else {
            None
        };

        let realism_critic = if config.run_realism {
            Some(RealismCritic::new()?)
        } else {
            None
        };

        Ok(Self {
            config,
            geometry_critic,
            clip_critic,
            realism_critic,
        })
    }

    /// Evaluate an asset through all configured critics.
    pub fn evaluate(&self, asset: &Asset) -> Result<GateResult> {
        let start = Instant::now();
        let mut critics = HashMap::new();
        let mut all_fail_codes = Vec::new();
        let mut scores = Vec::new();

        // Run geometry critic
        if self.config.run_geometry {
            let mesh_path = Path::new(&asset.mesh_path);
            let result = self.geometry_critic.evaluate(mesh_path)?;
            all_fail_codes.extend(result.fail_codes.clone());
            scores.push(result.score);
            critics.insert("geometry".to_string(), CriticResult::Geometry(result));
        }

        // Run alignment critic
        if self.config.run_alignment {
            if let Some(ref clip) = self.clip_critic {
                let render_paths: Vec<&Path> = asset
                    .render_paths
                    .iter()
                    .map(|p| Path::new(p.as_str()))
                    .collect();

                let result = clip.evaluate(&render_paths, &asset.prompt, None)?;
                all_fail_codes.extend(result.fail_codes.clone());
                scores.push(result.score);
                critics.insert("alignment".to_string(), CriticResult::Alignment(result));
            }
        }

        // Run realism critic
        if self.config.run_realism {
            if let Some(ref realism) = self.realism_critic {
                let render_paths: Vec<&Path> = asset
                    .render_paths
                    .iter()
                    .map(|p| Path::new(p.as_str()))
                    .collect();

                let result = realism.evaluate(&render_paths)?;
                all_fail_codes.extend(result.fail_codes.clone());
                scores.push(result.score);
                critics.insert("realism".to_string(), CriticResult::Realism(result));
            }
        }

        // Calculate aggregate score
        let aggregate_score = if scores.is_empty() {
            0.0
        } else {
            scores.iter().sum::<f32>() / scores.len() as f32
        };

        // Determine pass/fail
        let all_critics_passed = critics.values().all(|c| c.passed());
        let passed = if self.config.require_all_pass {
            all_critics_passed && aggregate_score >= self.config.min_score
        } else {
            aggregate_score >= self.config.min_score
        };

        let execution_time_ms = start.elapsed().as_millis() as u64;

        Ok(GateResult {
            passed,
            aggregate_score,
            critics,
            all_fail_codes,
            execution_time_ms,
        })
    }
}
