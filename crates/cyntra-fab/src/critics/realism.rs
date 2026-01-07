//! Realism critic for photorealism assessment.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

use super::clip::ClipCritic;

/// Configuration for realism evaluation.
#[derive(Debug, Clone)]
pub struct RealismConfig {
    pub min_realism_score: f32,
    pub min_sharpness: f32,
    pub min_contrast: f32,
    pub use_clip: bool,
}

impl Default for RealismConfig {
    fn default() -> Self {
        Self {
            min_realism_score: 0.5,
            min_sharpness: 0.3,
            min_contrast: 0.2,
            use_clip: true,
        }
    }
}

/// Result of realism evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealismResult {
    pub passed: bool,
    pub score: f32,
    pub realism_score: f32,
    pub sharpness_score: f32,
    pub contrast_score: f32,
    pub views_evaluated: usize,
    pub fail_codes: Vec<String>,
}

/// Critic for assessing photorealism of rendered images.
pub struct RealismCritic {
    config: RealismConfig,
    clip_critic: Option<ClipCritic>,
}

impl RealismCritic {
    /// Create a new realism critic with default configuration.
    pub fn new() -> Result<Self> {
        Self::with_config(RealismConfig::default())
    }

    /// Create a new realism critic with custom configuration.
    pub fn with_config(config: RealismConfig) -> Result<Self> {
        let clip_critic = if config.use_clip {
            Some(ClipCritic::new()?)
        } else {
            None
        };

        Ok(Self { config, clip_critic })
    }

    /// Create a stats-only critic (no CLIP, faster).
    pub fn stats_only(config: RealismConfig) -> Self {
        Self {
            config: RealismConfig {
                use_clip: false,
                ..config
            },
            clip_critic: None,
        }
    }

    /// Evaluate realism of images.
    pub fn evaluate(&self, image_paths: &[impl AsRef<Path>]) -> Result<RealismResult> {
        let mut fail_codes = Vec::new();
        let mut sharpness_scores = Vec::new();
        let mut contrast_scores = Vec::new();
        let mut realism_scores = Vec::new();

        for path in image_paths {
            let path = path.as_ref();

            // Calculate image statistics
            let (sharpness, contrast) = self.calculate_image_stats(path)?;
            sharpness_scores.push(sharpness);
            contrast_scores.push(contrast);

            // Calculate CLIP-based realism if available
            if let Some(ref clip) = self.clip_critic {
                let realism = self.calculate_clip_realism(clip, path)?;
                realism_scores.push(realism);
            }
        }

        // Average scores
        let sharpness_score =
            sharpness_scores.iter().sum::<f32>() / sharpness_scores.len() as f32;
        let contrast_score = contrast_scores.iter().sum::<f32>() / contrast_scores.len() as f32;

        let realism_score = if !realism_scores.is_empty() {
            realism_scores.iter().sum::<f32>() / realism_scores.len() as f32
        } else {
            // Estimate from stats if no CLIP
            (sharpness_score + contrast_score) / 2.0
        };

        // Validate
        if realism_score < self.config.min_realism_score {
            fail_codes.push(format!("low_realism:{:.3}", realism_score));
        }

        if sharpness_score < self.config.min_sharpness {
            fail_codes.push(format!("low_sharpness:{:.3}", sharpness_score));
        }

        if contrast_score < self.config.min_contrast {
            fail_codes.push(format!("low_contrast:{:.3}", contrast_score));
        }

        // Calculate aggregate score
        let score = if self.clip_critic.is_some() {
            realism_score * 0.5 + sharpness_score * 0.25 + contrast_score * 0.25
        } else {
            sharpness_score * 0.5 + contrast_score * 0.5
        };

        let passed = fail_codes.is_empty() && score >= self.config.min_realism_score;

        Ok(RealismResult {
            passed,
            score,
            realism_score,
            sharpness_score,
            contrast_score,
            views_evaluated: image_paths.len(),
            fail_codes,
        })
    }

    fn calculate_image_stats(&self, path: &Path) -> Result<(f32, f32)> {
        let img = image::open(path)
            .with_context(|| format!("Failed to open image: {}", path.display()))?;
        let gray = img.to_luma8();

        // Calculate sharpness using Laplacian variance
        let sharpness = self.laplacian_variance(&gray);

        // Calculate contrast using standard deviation
        let contrast = self.pixel_std_dev(&gray);

        // Normalize to 0-1 range
        let sharpness_norm = (sharpness / 1000.0).clamp(0.0, 1.0);
        let contrast_norm = (contrast / 80.0).clamp(0.0, 1.0);

        Ok((sharpness_norm, contrast_norm))
    }

    fn laplacian_variance(&self, img: &image::GrayImage) -> f32 {
        let (width, height) = img.dimensions();
        if width < 3 || height < 3 {
            return 0.0;
        }

        let mut sum = 0i64;
        let mut sum_sq = 0i64;
        let mut count = 0u32;

        for y in 1..height - 1 {
            for x in 1..width - 1 {
                // 3x3 Laplacian kernel: [0, 1, 0], [1, -4, 1], [0, 1, 0]
                let center = img.get_pixel(x, y)[0] as i32;
                let top = img.get_pixel(x, y - 1)[0] as i32;
                let bottom = img.get_pixel(x, y + 1)[0] as i32;
                let left = img.get_pixel(x - 1, y)[0] as i32;
                let right = img.get_pixel(x + 1, y)[0] as i32;

                let laplacian = top + bottom + left + right - 4 * center;

                sum += laplacian as i64;
                sum_sq += (laplacian * laplacian) as i64;
                count += 1;
            }
        }

        if count == 0 {
            return 0.0;
        }

        // Variance = E[X^2] - E[X]^2
        let mean = sum as f64 / count as f64;
        let mean_sq = sum_sq as f64 / count as f64;
        let variance = mean_sq - mean * mean;

        variance as f32
    }

    fn pixel_std_dev(&self, img: &image::GrayImage) -> f32 {
        let pixels: Vec<f32> = img.pixels().map(|p| p[0] as f32).collect();
        let n = pixels.len() as f32;

        if n == 0.0 {
            return 0.0;
        }

        let mean = pixels.iter().sum::<f32>() / n;
        let variance = pixels.iter().map(|&p| (p - mean).powi(2)).sum::<f32>() / n;

        variance.sqrt()
    }

    fn calculate_clip_realism(&self, clip: &ClipCritic, path: &Path) -> Result<f32> {
        // Use CLIP to compare against "realistic photograph" vs "CGI render"
        let result = clip.evaluate(
            &[path],
            "a realistic photograph",
            Some(&["a 3D render", "CGI graphics"]),
        )?;

        // The margin indicates how much more "realistic" vs "synthetic" the image appears
        let realism = (result.mean_margin + 0.5).clamp(0.0, 1.0);

        Ok(realism)
    }
}
