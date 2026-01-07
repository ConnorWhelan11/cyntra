//! CLIP-based text-to-image alignment critic.

use anyhow::{Context, Result};
use candle_core::{DType, Device, Module, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::clip::{
    self,
    text_model::ClipTextTransformer,
    vision_model::ClipVisionTransformer,
};
use hf_hub::{api::sync::Api, Repo, RepoType};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokenizers::Tokenizer;
use tracing::info;

/// Configuration for CLIP alignment evaluation.
#[derive(Debug, Clone)]
pub struct ClipConfig {
    pub model_id: String,
    pub min_similarity: f32,
    pub min_margin: f32,
    pub min_score: f32,
}

impl Default for ClipConfig {
    fn default() -> Self {
        Self {
            model_id: "openai/clip-vit-base-patch32".to_string(),
            min_similarity: 0.2,
            min_margin: 0.05,
            min_score: 0.5,
        }
    }
}

/// Result of CLIP alignment evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipResult {
    pub passed: bool,
    pub score: f32,
    pub mean_similarity: f32,
    pub mean_margin: f32,
    pub views_evaluated: usize,
    pub views_passing: usize,
    pub fail_codes: Vec<String>,
}

/// CLIP-based text-to-image alignment critic.
pub struct ClipCritic {
    config: ClipConfig,
    device: Device,
    vision_model: ClipVisionTransformer,
    text_model: ClipTextTransformer,
    tokenizer: Tokenizer,
}

impl ClipCritic {
    /// Create a new CLIP critic with default configuration.
    pub fn new() -> Result<Self> {
        Self::with_config(ClipConfig::default())
    }

    /// Create a new CLIP critic with custom configuration.
    pub fn with_config(config: ClipConfig) -> Result<Self> {
        // Select device (Metal/CUDA/CPU)
        let device = Self::get_device()?;
        info!("Using device: {:?}", device);

        // Download model from HuggingFace Hub
        let api = Api::new().context("Failed to create HF API")?;
        let repo = api.repo(Repo::new(config.model_id.clone(), RepoType::Model));

        info!("Loading CLIP model: {}", config.model_id);

        // Use default CLIP ViT-B/32 config
        let clip_config = clip::ClipConfig::vit_base_patch32();

        // Load weights
        let model_path = repo
            .get("model.safetensors")
            .context("Failed to download model.safetensors")?;

        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&[model_path], DType::F32, &device)?
        };

        // Build models
        let vision_model =
            ClipVisionTransformer::new(vb.pp("vision_model"), &clip_config.vision_config)?;
        let text_model =
            ClipTextTransformer::new(vb.pp("text_model"), &clip_config.text_config)?;

        // Load tokenizer
        let tokenizer_path = repo
            .get("tokenizer.json")
            .context("Failed to download tokenizer.json")?;
        let tokenizer =
            Tokenizer::from_file(tokenizer_path).map_err(|e| anyhow::anyhow!("{}", e))?;

        Ok(Self {
            config,
            device,
            vision_model,
            text_model,
            tokenizer,
        })
    }

    fn get_device() -> Result<Device> {
        #[cfg(feature = "metal")]
        {
            if let Ok(device) = Device::new_metal(0) {
                return Ok(device);
            }
        }

        #[cfg(feature = "cuda")]
        {
            if let Ok(device) = Device::new_cuda(0) {
                return Ok(device);
            }
        }

        Ok(Device::Cpu)
    }

    /// Evaluate alignment of images against a text prompt.
    pub fn evaluate(
        &self,
        image_paths: &[impl AsRef<Path>],
        prompt: &str,
        decoys: Option<&[&str]>,
    ) -> Result<ClipResult> {
        let mut fail_codes = Vec::new();
        let mut similarities = Vec::new();
        let mut margins = Vec::new();

        // Encode the target prompt
        let target_embedding = self.encode_text(prompt)?;

        // Encode decoy prompts
        let decoy_prompts: Vec<&str> = decoys.map(|d| d.to_vec()).unwrap_or_else(|| {
            vec![
                "a random object",
                "abstract shapes",
                "nothing recognizable",
            ]
        });

        let decoy_embeddings: Vec<Tensor> = decoy_prompts
            .iter()
            .map(|p| self.encode_text(p))
            .collect::<Result<Vec<_>>>()?;

        // Process each image
        for path in image_paths {
            let image_embedding = self.encode_image(path.as_ref())?;

            // Calculate similarity to target
            let similarity = Self::cosine_similarity(&image_embedding, &target_embedding)?;

            // Calculate max similarity to decoys
            let max_decoy_sim: f32 = decoy_embeddings
                .iter()
                .map(|d| Self::cosine_similarity(&image_embedding, d))
                .collect::<Result<Vec<f32>>>()?
                .into_iter()
                .fold(f32::MIN, f32::max);

            let margin = similarity - max_decoy_sim;

            similarities.push(similarity);
            margins.push(margin);
        }

        // Calculate aggregate metrics
        let mean_similarity = similarities.iter().sum::<f32>() / similarities.len() as f32;
        let mean_margin = margins.iter().sum::<f32>() / margins.len() as f32;

        let views_passing = similarities
            .iter()
            .zip(margins.iter())
            .filter(|(&sim, &margin)| {
                sim >= self.config.min_similarity && margin >= self.config.min_margin
            })
            .count();

        // Validate
        if mean_similarity < self.config.min_similarity {
            fail_codes.push(format!("low_similarity:{:.3}", mean_similarity));
        }

        if mean_margin < self.config.min_margin {
            fail_codes.push(format!("low_margin:{:.3}", mean_margin));
        }

        // Calculate score (weighted average)
        let score = (mean_similarity * 0.6 + (mean_margin + 0.5).clamp(0.0, 1.0) * 0.4).clamp(0.0, 1.0);

        let passed = fail_codes.is_empty() && score >= self.config.min_score;

        Ok(ClipResult {
            passed,
            score,
            mean_similarity,
            mean_margin,
            views_evaluated: image_paths.len(),
            views_passing,
            fail_codes,
        })
    }

    fn encode_text(&self, text: &str) -> Result<Tensor> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| anyhow::anyhow!("Tokenizer error: {}", e))?;

        let tokens: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();

        // Pad or truncate to 77 tokens (CLIP's context length)
        let mut padded = vec![0i64; 77];
        for (i, &t) in tokens.iter().take(77).enumerate() {
            padded[i] = t;
        }

        let input_ids = Tensor::new(&padded[..], &self.device)?.unsqueeze(0)?;
        let embeddings = self.text_model.forward(&input_ids)?;

        // Get the [EOS] token embedding (last non-padded position)
        let eos_pos = tokens.len().min(77) - 1;
        let text_embed = embeddings.get(0)?.get(eos_pos)?;

        // L2 normalize
        let norm = text_embed.sqr()?.sum_all()?.sqrt()?;
        let normalized = text_embed.broadcast_div(&norm)?;

        Ok(normalized)
    }

    fn encode_image(&self, path: &Path) -> Result<Tensor> {
        // Load and preprocess image
        let img = image::open(path)
            .with_context(|| format!("Failed to open image: {}", path.display()))?;
        let img = img.resize_exact(224, 224, image::imageops::FilterType::Triangle);
        let img = img.to_rgb8();

        // Convert to tensor [C, H, W]
        let mut pixels = vec![0f32; 3 * 224 * 224];
        for (i, pixel) in img.pixels().enumerate() {
            // CLIP normalization: (pixel / 255 - mean) / std
            let mean = [0.48145466, 0.4578275, 0.40821073];
            let std = [0.26862954, 0.26130258, 0.27577711];

            pixels[i] = (pixel[0] as f32 / 255.0 - mean[0]) / std[0];
            pixels[224 * 224 + i] = (pixel[1] as f32 / 255.0 - mean[1]) / std[1];
            pixels[2 * 224 * 224 + i] = (pixel[2] as f32 / 255.0 - mean[2]) / std[2];
        }

        let input = Tensor::from_vec(pixels, (1, 3, 224, 224), &self.device)?;
        let embeddings = self.vision_model.forward(&input)?;

        // Get the [CLS] token embedding
        let image_embed = embeddings.get(0)?.get(0)?;

        // L2 normalize
        let norm = image_embed.sqr()?.sum_all()?.sqrt()?;
        let normalized = image_embed.broadcast_div(&norm)?;

        Ok(normalized)
    }

    fn cosine_similarity(a: &Tensor, b: &Tensor) -> Result<f32> {
        let dot = (a * b)?.sum_all()?;
        Ok(dot.to_scalar::<f32>()?)
    }
}
