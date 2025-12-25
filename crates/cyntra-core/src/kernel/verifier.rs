//! Verifier - runs quality gates on completed work.

use std::path::Path;
use std::process::Command;

use anyhow::Result;

use crate::config::{GatesConfig, KernelConfig};

/// Result of verification.
#[derive(Debug)]
pub struct VerifyResult {
    pub passed: bool,
    pub gates: Vec<GateResult>,
}

#[derive(Debug)]
pub struct GateResult {
    pub name: String,
    pub passed: bool,
    pub output: String,
    pub required: bool,
}

/// Verifier runs quality gates.
pub struct Verifier {
    config: GatesConfig,
}

impl Verifier {
    pub fn new(config: &KernelConfig) -> Self {
        Self {
            config: config.gates.clone(),
        }
    }

    /// Verify a workcell passes all gates
    pub fn verify(&self, workcell_path: &Path) -> Result<VerifyResult> {
        if !self.config.enabled {
            return Ok(VerifyResult {
                passed: true,
                gates: vec![],
            });
        }

        let mut gates = Vec::new();
        let mut all_required_passed = true;

        for gate_cmd in &self.config.commands {
            let result = self.run_gate(&gate_cmd.name, &gate_cmd.command, workcell_path);

            let passed = result.is_ok();
            let output = result.unwrap_or_else(|e| e.to_string());

            if gate_cmd.required && !passed {
                all_required_passed = false;
            }

            gates.push(GateResult {
                name: gate_cmd.name.clone(),
                passed,
                output,
                required: gate_cmd.required,
            });
        }

        Ok(VerifyResult {
            passed: all_required_passed,
            gates,
        })
    }

    fn run_gate(&self, name: &str, command: &str, workcell_path: &Path) -> Result<String> {
        tracing::info!(gate = name, "Running quality gate");

        let output = Command::new("sh")
            .arg("-c")
            .arg(command)
            .current_dir(workcell_path)
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success() {
            Ok(format!("{}{}", stdout, stderr))
        } else {
            anyhow::bail!("Gate failed: {}\n{}", stdout, stderr)
        }
    }
}
