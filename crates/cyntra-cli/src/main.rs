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

    /// Initialize a new project
    Init,
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
