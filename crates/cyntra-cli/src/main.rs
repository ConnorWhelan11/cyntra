//! Cyntra CLI - autonomous development kernel.
//!
//! Single binary that provides:
//! - `cyntra run` - headless kernel execution
//! - `cyntra status` - fast status check
//! - `cyntra workcell` - workcell management
//! - `cyntra` (no args) - launch desktop app (future)

use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};
use tracing_subscriber::{fmt, EnvFilter};

use cyntra_core::{
    KernelConfig, Scheduler, Dispatcher, Verifier, WorkcellManager,
    state::StateManager,
    observability::EventEmitter,
};

#[derive(Parser)]
#[command(name = "cyntra")]
#[command(about = "Autonomous development kernel", version)]
struct Cli {
    /// Project root directory
    #[arg(short, long, global = true)]
    project: Option<PathBuf>,

    /// Verbose output
    #[arg(short, long, global = true)]
    verbose: bool,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the kernel
    Run {
        /// Run once and exit
        #[arg(long)]
        once: bool,

        /// Run continuously, watching for changes
        #[arg(long)]
        watch: bool,

        /// Process a specific issue
        #[arg(long)]
        issue: Option<String>,
    },

    /// Show kernel status
    Status,

    /// Workcell management
    Workcell {
        #[command(subcommand)]
        command: WorkcellCommands,
    },

    /// Membrane (Web3 integration)
    Membrane {
        #[command(subcommand)]
        command: MembraneCommands,
    },

    /// Initialize a new project
    Init,

    /// Fab asset quality critics (requires --features fab)
    #[cfg(feature = "fab")]
    Fab {
        #[command(subcommand)]
        command: FabCommands,
    },
}

#[cfg(feature = "fab")]
#[derive(Subcommand)]
enum FabCommands {
    /// Evaluate mesh geometry
    Geometry {
        /// Path to GLB/glTF file
        path: PathBuf,
        /// Minimum triangle count
        #[arg(long, default_value = "100")]
        min_triangles: usize,
        /// Maximum triangle count
        #[arg(long, default_value = "500000")]
        max_triangles: usize,
    },
    /// Evaluate render realism
    Realism {
        /// Directory containing rendered images
        render_dir: PathBuf,
        /// Skip CLIP (stats only, faster)
        #[arg(long)]
        stats_only: bool,
    },
    /// Batch evaluate multiple GLB files
    Batch {
        /// Directory containing GLB files
        input: PathBuf,
        /// Output JSON file
        #[arg(short, long)]
        output: Option<PathBuf>,
        /// Continue on error
        #[arg(long)]
        continue_on_error: bool,
    },
    /// Show critic info
    Info,
}

#[derive(Subcommand)]
enum MembraneCommands {
    /// Publish a run to IPFS and create attestation
    Publish {
        /// Run ID to publish
        run_id: String,
    },

    /// Verify an attestation
    Verify {
        /// Attestation UID
        uid: String,
    },

    /// Check membrane service status
    Status,

    /// Setup membrane configuration
    Setup,
}

#[derive(Subcommand)]
enum WorkcellCommands {
    /// List active workcells
    Ls,

    /// Clean up completed workcells
    Cleanup {
        /// Keep logs when cleaning
        #[arg(long, default_value = "true")]
        keep_logs: bool,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    let filter = if cli.verbose {
        EnvFilter::new("debug")
    } else {
        EnvFilter::new("info")
    };

    fmt()
        .with_env_filter(filter)
        .with_target(false)
        .init();

    // Find project root
    let project_root = cli.project.unwrap_or_else(|| {
        std::env::current_dir().expect("Failed to get current directory")
    });

    match cli.command {
        Some(Commands::Run { once, watch, issue }) => {
            run_kernel(&project_root, once, watch, issue).await
        }
        Some(Commands::Status) => {
            show_status(&project_root)
        }
        Some(Commands::Workcell { command }) => {
            handle_workcell(&project_root, command)
        }
        Some(Commands::Membrane { command }) => {
            handle_membrane(&project_root, command).await
        }
        Some(Commands::Init) => {
            init_project(&project_root)
        }
        None => {
            // No subcommand - show help or launch desktop
            println!("Cyntra - Autonomous Development Kernel");
            println!();
            println!("Usage: cyntra <COMMAND>");
            println!();
            println!("Commands:");
            println!("  run       Run the kernel");
            println!("  status    Show kernel status");
            println!("  workcell  Workcell management");
            println!("  membrane  Web3 integration (IPFS, attestations)");
            println!("  init      Initialize a new project");
            println!();
            println!("Run 'cyntra --help' for more information.");
            Ok(())
        }
    }
}

async fn run_kernel(
    project_root: &PathBuf,
    once: bool,
    watch: bool,
    specific_issue: Option<String>,
) -> Result<()> {
    tracing::info!(project = %project_root.display(), "Starting kernel");

    // Load configuration
    let mut config = KernelConfig::load_from_project(project_root)?;
    config.resolve_paths(project_root);

    // Initialize components
    let state = StateManager::new(project_root)?;
    let scheduler = Scheduler::new(config.clone());
    let dispatcher = Dispatcher::new(config.clone());
    let verifier = Verifier::new(&config);
    let events = EventEmitter::new(project_root);

    events.emit_simple("kernel_start", "Kernel started")?;

    loop {
        // Schedule work
        let schedule = scheduler.schedule(state.graph());
        tracing::info!(summary = %schedule.summary(), "Scheduling cycle");

        if schedule.scheduled.is_empty() && schedule.speculate.is_empty() {
            if once {
                tracing::info!("No work to do, exiting");
                break;
            }
            if !watch {
                break;
            }
            // Wait and retry
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            continue;
        }

        // Process scheduled issues
        for issue_id in &schedule.scheduled {
            if let Some(specific) = &specific_issue {
                if issue_id != specific {
                    continue;
                }
            }

            let issue = match state.graph().get(issue_id) {
                Some(i) => i.clone(),
                None => continue,
            };

            let toolchain = dispatcher.select_toolchain(&issue);
            tracing::info!(
                issue_id = %issue_id,
                toolchain = %toolchain.name(),
                "Dispatching issue"
            );

            // TODO: Actually run the issue
            // For now, just log it
            events.emit_simple("issue_dispatched", &format!("Dispatched {} to {}", issue_id, toolchain.name()))?;
        }

        if once {
            break;
        }

        if !watch {
            break;
        }

        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }

    events.emit_simple("kernel_stop", "Kernel stopped")?;
    Ok(())
}

fn show_status(project_root: &PathBuf) -> Result<()> {
    let config = KernelConfig::load_from_project(project_root)?;
    let mut resolved_config = config.clone();
    resolved_config.resolve_paths(project_root);

    let state = StateManager::new(project_root)?;
    let workcell_manager = WorkcellManager::new(resolved_config, project_root)?;
    let events = EventEmitter::new(project_root);

    let active_workcells = workcell_manager.list_active();
    let ready_issues = state.graph().ready_issues();
    let recent_events = events.read_recent(5);

    println!("Cyntra Kernel Status");
    println!("====================");
    println!();
    println!("Project: {}", project_root.display());
    println!();
    println!("Workcells: {} active", active_workcells.len());
    for wc in &active_workcells {
        if let Some(info) = workcell_manager.get_info(wc) {
            println!("  - {} (issue: {})", info.id, info.issue_id);
        }
    }
    println!();
    println!("Ready issues: {}", ready_issues.len());
    for issue in ready_issues.iter().take(5) {
        println!("  - {} {}", issue.id, issue.title);
    }
    if ready_issues.len() > 5 {
        println!("  ... and {} more", ready_issues.len() - 5);
    }
    println!();
    println!("Recent events:");
    for event in &recent_events {
        println!("  [{}] {}", event.event_type, event.message);
    }

    Ok(())
}

fn handle_workcell(project_root: &PathBuf, command: WorkcellCommands) -> Result<()> {
    let config = KernelConfig::load_from_project(project_root)?;
    let mut resolved_config = config.clone();
    resolved_config.resolve_paths(project_root);

    let workcell_manager = WorkcellManager::new(resolved_config, project_root)?;

    match command {
        WorkcellCommands::Ls => {
            let active = workcell_manager.list_active();
            println!("Active workcells: {}", active.len());
            for wc in active {
                if let Some(info) = workcell_manager.get_info(&wc) {
                    println!("  {} - issue: {}, created: {}", info.id, info.issue_id, info.created);
                }
            }
        }
        WorkcellCommands::Cleanup { keep_logs } => {
            let active = workcell_manager.list_active();
            // Only cleanup workcells that are done (no running process)
            // For now, just list what would be cleaned
            println!("Would clean {} workcells (keep_logs: {})", active.len(), keep_logs);
        }
    }

    Ok(())
}

fn init_project(project_root: &PathBuf) -> Result<()> {
    let cyntra_dir = project_root.join(".cyntra");
    let beads_dir = project_root.join(".beads");

    std::fs::create_dir_all(&cyntra_dir)?;
    std::fs::create_dir_all(&beads_dir)?;

    // Create default config
    let config_path = cyntra_dir.join("config.yaml");
    if !config_path.exists() {
        let default_config = r#"# Cyntra Kernel Configuration

max_parallel: 3
max_tokens_per_cycle: 500000

routing:
  default_toolchain: claude
  rules: []

gates:
  enabled: true
  commands:
    - name: test
      command: "pytest -v"
      required: true
    - name: lint
      command: "ruff check ."
      required: false

speculation:
  enabled: false
  count: 3
  risk_levels:
    - high
    - critical
"#;
        std::fs::write(&config_path, default_config)?;
    }

    // Create empty issues file
    let issues_path = beads_dir.join("issues.jsonl");
    if !issues_path.exists() {
        std::fs::write(&issues_path, "")?;
    }

    println!("Initialized Cyntra project at {}", project_root.display());
    println!();
    println!("Created:");
    println!("  .cyntra/config.yaml - kernel configuration");
    println!("  .beads/issues.jsonl - work graph");
    println!();
    println!("Next steps:");
    println!("  1. Add issues to .beads/issues.jsonl");
    println!("  2. Run: cyntra run --once");

    Ok(())
}

// ============================================================================
// Membrane Commands
// ============================================================================

const MEMBRANE_URL: &str = "http://localhost:7331";

async fn handle_membrane(project_root: &PathBuf, command: MembraneCommands) -> Result<()> {
    match command {
        MembraneCommands::Publish { run_id } => {
            membrane_publish(project_root, &run_id).await
        }
        MembraneCommands::Verify { uid } => {
            membrane_verify(&uid).await
        }
        MembraneCommands::Status => {
            membrane_status().await
        }
        MembraneCommands::Setup => {
            membrane_setup()
        }
    }
}

async fn membrane_publish(project_root: &PathBuf, run_id: &str) -> Result<()> {
    let runs_dir = project_root.join(".cyntra").join("runs");
    let run_dir = runs_dir.join(run_id);

    if !run_dir.exists() {
        anyhow::bail!("Run directory not found: {}", run_dir.display());
    }

    println!("Publishing run: {}", run_id);
    println!("  Directory: {}", run_dir.display());

    // Check if membrane is running
    let client = reqwest::Client::new();
    let health = client
        .get(MEMBRANE_URL)
        .send()
        .await;

    if health.is_err() {
        println!();
        println!("Membrane service is not running.");
        println!("Start it with: cd packages/membrane && bun run start");
        anyhow::bail!("Membrane service unavailable");
    }

    // Call publish endpoint
    let response = client
        .post(format!("{}/publish", MEMBRANE_URL))
        .json(&serde_json::json!({
            "runDir": run_dir.to_string_lossy()
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        anyhow::bail!("Publish failed: {}", error.get("error").and_then(|e| e.as_str()).unwrap_or("unknown error"));
    }

    let result: serde_json::Value = response.json().await?;

    println!();
    println!("Published successfully!");
    println!("  CID:         {}", result.get("cid").and_then(|c| c.as_str()).unwrap_or("?"));
    println!("  Attestation: {}", result.get("attestationUid").and_then(|u| u.as_str()).unwrap_or("?"));

    if let Some(url) = result.get("explorerUrl").and_then(|u| u.as_str()) {
        println!("  Explorer:    {}", url);
    }
    if let Some(url) = result.get("ipfsGatewayUrl").and_then(|u| u.as_str()) {
        println!("  IPFS:        {}", url);
    }

    Ok(())
}

async fn membrane_verify(uid: &str) -> Result<()> {
    println!("Verifying attestation: {}", uid);

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/verify/{}", MEMBRANE_URL, uid))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        anyhow::bail!("Verify failed: {}", error.get("error").and_then(|e| e.as_str()).unwrap_or("unknown error"));
    }

    let result: serde_json::Value = response.json().await?;

    let valid = result.get("valid").and_then(|v| v.as_bool()).unwrap_or(false);

    println!();
    if valid {
        println!("Attestation is VALID");
        if let Some(attester) = result.get("attester").and_then(|a| a.as_str()) {
            println!("  Attester:   {}", attester);
        }
        if let Some(time) = result.get("attestedAt").and_then(|t| t.as_str()) {
            println!("  Attested:   {}", time);
        }
    } else {
        println!("Attestation is INVALID");
        if let Some(error) = result.get("error").and_then(|e| e.as_str()) {
            println!("  Error: {}", error);
        }
    }

    Ok(())
}

async fn membrane_status() -> Result<()> {
    println!("Membrane Service Status");
    println!("=======================");
    println!();

    let client = reqwest::Client::new();
    let response = client
        .get(MEMBRANE_URL)
        .send()
        .await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = resp.json().await?;
            println!("Status: Running");
            if let Some(version) = data.get("version").and_then(|v| v.as_str()) {
                println!("Version: {}", version);
            }
            if let Some(uptime) = data.get("uptime").and_then(|u| u.as_f64()) {
                println!("Uptime: {:.1}s", uptime);
            }
        }
        _ => {
            println!("Status: Not running");
            println!();
            println!("Start with: cd packages/membrane && bun run start");
        }
    }

    Ok(())
}

fn membrane_setup() -> Result<()> {
    println!("Membrane Setup");
    println!("==============");
    println!();
    println!("Run the setup wizard from the membrane package:");
    println!();
    println!("  cd packages/membrane && bun run start setup");
    println!();
    println!("Or configure environment variables:");
    println!();
    println!("  export MEMBRANE_CHAIN=\"base-sepolia\"");
    println!("  export MEMBRANE_SCHEMA_UID=\"0x...\"");
    println!("  export MEMBRANE_PRIVATE_KEY=\"0x...\"");
    println!("  export MEMBRANE_W3UP_SPACE_DID=\"did:key:...\"");
    println!();

    Ok(())
}
