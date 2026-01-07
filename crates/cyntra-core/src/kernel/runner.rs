//! Runner - executes tasks in workcells using toolchains.

use std::path::Path;

use anyhow::Result;
use chrono::Utc;
use serde_json::Value;

use crate::adapters::Toolchain;
use crate::config::KernelConfig;
use crate::state::Issue;
use crate::workcell::WorkcellManager;

/// Runner executes issues in isolated workcells.
pub struct Runner {
    config: KernelConfig,
    workcell_manager: WorkcellManager,
}

impl Runner {
    pub fn new(config: KernelConfig, project_root: &Path) -> Result<Self> {
        let workcell_manager = WorkcellManager::new(config.clone(), project_root)?;
        Ok(Self {
            config,
            workcell_manager,
        })
    }

    async fn write_context_pack(&self, issue: &Issue, workcell_path: &Path) -> Result<()> {
        let server_url = std::env::var("CYNTRA_COCOINDEX_SERVER_URL").ok();
        let Some(server_url) = server_url.filter(|s| !s.trim().is_empty()) else {
            return Ok(());
        };

        let query = format!(
            "{}\n\n{}\n[CYNTRA_ARGS]\nk=8\nrelated_issue_id={}\n[/CYNTRA_ARGS]",
            issue.title,
            issue.body,
            issue.id
        );

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        let url = format!(
            "{}/cocoindex/api/flows/CyntraIndex/queryHandlers/search_memories",
            server_url.trim_end_matches('/')
        );

        let resp = client.get(url).query(&[("query", query)]).send().await?;
        if !resp.status().is_success() {
            tracing::warn!(
                status = %resp.status(),
                "CocoIndex search_memories failed"
            );
            return Ok(());
        }

        let payload: Value = resp.json().await.unwrap_or(Value::Null);
        let results = payload.get("results").and_then(Value::as_array).cloned().unwrap_or_default();

        let mut lines: Vec<String> = Vec::new();
        lines.push("# Retrieved Context".to_string());
        lines.push("".to_string());
        lines.push(format!(
            "- generated_at: {}",
            Utc::now().format("%Y-%m-%dT%H:%M:%SZ")
        ));
        lines.push(format!("- cocoindex_server: {}", server_url));
        lines.push(format!("- issue_id: {}", issue.id));
        lines.push("".to_string());
        lines.push("## Relevant Memories".to_string());
        lines.push("".to_string());

        let mut hit_count = 0usize;
        for row in results {
            let Some(obj) = normalize_cocoindex_row(&row) else {
                continue;
            };
            let memory_id = obj.get("memory_id").and_then(Value::as_str).unwrap_or("");
            if memory_id.is_empty() {
                continue;
            }
            let title = obj.get("title").and_then(Value::as_str).unwrap_or("(untitled)");
            let visibility = obj.get("visibility").and_then(Value::as_str).unwrap_or("unknown");
            let status = obj.get("status").and_then(Value::as_str).unwrap_or("unknown");
            let score = obj.get("score").and_then(Value::as_f64);
            let repo_path = obj.get("repo_path").and_then(Value::as_str).unwrap_or("");
            let snippet = obj.get("snippet").and_then(Value::as_str).unwrap_or("");

            hit_count += 1;
            let score_txt = score.map(|s| format!("{s:.3}")).unwrap_or_else(|| "-".to_string());
            lines.push(format!(
                "{hit_count}. `{memory_id}` ({visibility}/{status}, score {score_txt})"
            ));
            if !repo_path.is_empty() {
                lines.push(format!("   - path: `{repo_path}`"));
            }
            lines.push(format!("   - title: {title}"));
            if !snippet.trim().is_empty() {
                let mut s = snippet.trim().to_string();
                if s.len() > 900 {
                    s.truncate(900);
                    s.push_str("…");
                }
                lines.push("".to_string());
                lines.push("   ```text".to_string());
                for ln in s.lines().take(20) {
                    lines.push(format!("   {ln}"));
                }
                lines.push("   ```".to_string());
            }
            lines.push("".to_string());
        }

        if hit_count == 0 {
            lines.push("_No matching memories found._".to_string());
            lines.push("".to_string());
        }

        let context_dir = workcell_path.join("context");
        std::fs::create_dir_all(&context_dir)?;
        std::fs::write(context_dir.join("retrieval.md"), lines.join("\n"))?;
        Ok(())
    }

    /// Run an issue with the specified toolchain
    pub async fn run(
        &self,
        issue: &Issue,
        toolchain: Toolchain,
    ) -> Result<RunResult> {
        // Create workcell
        let workcell_path = self.workcell_manager.create(&issue.id, None)?;

        if let Err(err) = self.write_context_pack(issue, &workcell_path).await {
            tracing::warn!(
                issue_id = %issue.id,
                error = %err,
                "Failed to write context pack"
            );
        }

        // Execute toolchain
        let result = toolchain.execute(issue, &workcell_path).await;

        // Capture result
        let run_result = match result {
            Ok(output) => RunResult {
                success: true,
                workcell_path: workcell_path.clone(),
                output: Some(output),
                error: None,
            },
            Err(e) => RunResult {
                success: false,
                workcell_path: workcell_path.clone(),
                output: None,
                error: Some(e.to_string()),
            },
        };

        Ok(run_result)
    }

    /// Get workcell manager for cleanup operations
    pub fn workcell_manager(&self) -> &WorkcellManager {
        &self.workcell_manager
    }
}

/// Result of running a task.
#[derive(Debug)]
pub struct RunResult {
    pub success: bool,
    pub workcell_path: std::path::PathBuf,
    pub output: Option<String>,
    pub error: Option<String>,
}

fn normalize_cocoindex_row(value: &Value) -> Option<serde_json::Map<String, Value>> {
    match value {
        Value::Object(map) => Some(map.clone()),
        Value::Array(items) => {
            let mut out = serde_json::Map::new();
            for item in items {
                match item {
                    Value::Array(pair) if pair.len() == 2 => {
                        let key = pair[0].as_str()?;
                        out.insert(key.to_string(), pair[1].clone());
                    }
                    _ => return None,
                }
            }
            Some(out)
        }
        _ => None,
    }
}
