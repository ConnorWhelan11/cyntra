//! Backbay Imperium Multiplayer Server
//!
//! Authoritative game server supporting 2-8 players with dynamic turn mode.

use std::collections::HashMap;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use backbay_core::{generate_map, load_rules, GameEngine, MapGenConfig, RulesSource};
use backbay_protocol::{Hex, PlayerId};
use renet::{ConnectionConfig, RenetServer};
use tracing::{info, warn};

use backbay_server::{
    channel_id,
    config::ServerConfig as AppConfig,
    create_channel_configs,
    game::ApplyResult,
    game::{GameState, TurnMode},
    player_manager::{AddPlayerError, PlayerManager},
    protocol::{
        deserialize_client_message, serialize_server_message, ClientMessage, JoinRejectReason,
        ServerMessage, ServerNotification, TurnRejectReason, WhyPanelKind,
    },
};

/// Server state
struct Server {
    /// Renet server
    renet: RenetServer,
    /// Application config
    config: AppConfig,
    /// Unified player manager (handles lobby, connections, rate limiting)
    players: PlayerManager,
    /// Game state (None until game starts)
    game: Option<GameState>,
    /// Client ID to player name (before game starts)
    pending_players: HashMap<u64, String>,
    /// Game code for authentication
    game_code: Option<String>,
    /// Last tick time for delta calculation
    last_tick: Instant,
    /// Timer warning sent flags (player_id, turn_number) -> warned_at_seconds
    timer_warnings_sent: HashMap<(PlayerId, u32), u32>,
}

impl Server {
    fn new(config: AppConfig) -> Self {
        let connection_config = ConnectionConfig {
            available_bytes_per_tick: 60_000,
            server_channels_config: create_channel_configs(),
            client_channels_config: create_channel_configs(),
        };

        let renet = RenetServer::new(connection_config);

        let players = PlayerManager::new(
            config.min_players.unwrap_or(2),
            config.max_players,
            config.max_observers,
            config.disconnect_grace,
        );

        let game_code = config.game_code.clone();

        Self {
            renet,
            config,
            players,
            game: None,
            pending_players: HashMap::new(),
            game_code,
            last_tick: Instant::now(),
            timer_warnings_sent: HashMap::new(),
        }
    }

    /// Main server loop tick - call this in your game loop or transport layer
    fn update(&mut self, delta: Duration) {
        // Process server events
        while let Some(event) = self.renet.get_event() {
            self.handle_server_event(event);
        }

        // Process client messages
        for client_id in self.renet.clients_id() {
            while let Some(message) = self.renet.receive_message(client_id, channel_id::COMMANDS) {
                self.handle_client_message(client_id, &message);
            }
        }

        // Process disconnections (AI takeover)
        let ai_takeovers = self.players.process_disconnections();
        for player_id in ai_takeovers {
            self.broadcast_message(ServerMessage::PlayerDisconnected {
                player_id,
                ai_takeover: true,
            });

            // If the disconnected player was active, force-end their turn to avoid stalling.
            self.force_end_turn(player_id, "disconnect");
        }

        // Process turn timers (using delta for countdown)
        self.process_turn_timers(delta);

        self.last_tick = Instant::now();
    }

    /// Process turn timers - send warnings and handle expirations
    fn process_turn_timers(&mut self, _delta: Duration) {
        // Collect timer info first to avoid borrow conflicts
        let timer_info: Vec<(PlayerId, u32, u32)> = {
            let Some(game) = &self.game else { return };
            let status = game.turn_manager().status();
            let turn_number = status.turn_number;

            status
                .active_players
                .iter()
                .map(|&player_id| {
                    let unit_count = game.unit_count(player_id);
                    let city_count = game.city_count(player_id);
                    let remaining = game
                        .turn_manager()
                        .calculate_time_remaining(unit_count, city_count);
                    (player_id, turn_number, remaining.as_secs() as u32)
                })
                .collect()
        };

        // Process warnings and expirations
        let mut expired_players = Vec::new();
        let mut warnings_to_send = Vec::new();

        for (player_id, turn_number, remaining_secs) in timer_info {
            // Send warning at 30 seconds and 10 seconds
            let warning_thresholds = [30, 10];
            for &threshold in &warning_thresholds {
                if remaining_secs <= threshold && remaining_secs > 0 {
                    let key = (player_id, turn_number);
                    let last_warning = self
                        .timer_warnings_sent
                        .get(&key)
                        .copied()
                        .unwrap_or(u32::MAX);

                    if last_warning > threshold {
                        self.timer_warnings_sent.insert(key, threshold);

                        // Queue warning to send
                        if let Some(player) = self.players.get_player(player_id) {
                            if let Some(client_id) = player.client_id {
                                warnings_to_send.push((client_id, remaining_secs));
                            }
                        }
                    }
                    break;
                }
            }

            // Handle timer expiration
            if remaining_secs == 0 {
                expired_players.push((player_id, turn_number));
            }
        }

        // Send queued warnings
        for (client_id, remaining_secs) in warnings_to_send {
            self.send_message(
                client_id,
                ServerMessage::Notification {
                    notification: ServerNotification::TurnTimerWarning {
                        seconds_remaining: remaining_secs,
                    },
                },
            );
        }

        // Handle expired timers
        for (player_id, turn_number) in expired_players {
            info!("Turn timer expired for player {:?}", player_id);
            self.force_end_turn(player_id, "timer");

            // Clean up warnings for this player/turn
            self.timer_warnings_sent
                .retain(|(p, t), _| *p != player_id || *t != turn_number);
        }
    }

    fn handle_server_event(&mut self, event: renet::ServerEvent) {
        match event {
            renet::ServerEvent::ClientConnected { client_id } => {
                info!("Client {:?} connected", client_id);
            }
            renet::ServerEvent::ClientDisconnected { client_id, reason } => {
                info!("Client {:?} disconnected: {:?}", client_id, reason);
                if let Some(player_id) = self.players.disconnect(client_id) {
                    self.broadcast_message(ServerMessage::PlayerDisconnected {
                        player_id,
                        ai_takeover: false,
                    });

                    // Broadcast updated lobby state if still in lobby
                    if !self.players.has_started() {
                        self.broadcast_lobby_state();
                    }
                }
                self.pending_players.remove(&client_id);
            }
        }
    }

    fn handle_client_message(&mut self, client_id: u64, data: &[u8]) {
        // Rate limiting check
        if !self.players.check_rate_limit(client_id) {
            warn!("Rate limit exceeded for client {:?}", client_id);
            return;
        }

        let message = match deserialize_client_message(data) {
            Ok(msg) => msg,
            Err(e) => {
                warn!("Failed to deserialize message from {:?}: {}", client_id, e);
                return;
            }
        };

        self.players.update_activity(client_id);

        match message {
            ClientMessage::JoinRequest {
                player_name,
                reconnect_token,
            } => {
                self.handle_join_request(client_id, player_name, reconnect_token);
            }
            ClientMessage::Authenticate { game_code } => {
                self.handle_authenticate(client_id, game_code);
            }
            ClientMessage::TurnSubmission {
                turn_number,
                commands,
                end_turn,
                state_checksum,
            } => {
                self.handle_turn_submission(
                    client_id,
                    turn_number,
                    commands,
                    end_turn,
                    state_checksum,
                );
            }
            ClientMessage::Chat { message } => {
                self.handle_chat(client_id, message);
            }
            ClientMessage::Ping { timestamp } => {
                self.handle_ping(client_id, timestamp);
            }
            ClientMessage::RequestState => {
                self.handle_state_request(client_id);
            }
            ClientMessage::RequestReplay => {
                self.handle_request_replay(client_id);
            }
            ClientMessage::QueryPromiseStrip => {
                self.handle_query_promise_strip(client_id);
            }
            ClientMessage::QueryCityUi { city } => {
                self.handle_query_city_ui(client_id, city);
            }
            ClientMessage::QueryProductionOptions { city } => {
                self.handle_query_production_options(client_id, city);
            }
            ClientMessage::QueryCombatPreview { attacker, defender } => {
                self.handle_query_combat_preview(client_id, attacker, defender);
            }
            ClientMessage::QueryCombatWhy { attacker, defender } => {
                self.handle_query_combat_why(client_id, attacker, defender);
            }
            ClientMessage::QueryPathPreview { unit, destination } => {
                self.handle_query_path_preview(client_id, unit, destination);
            }
            ClientMessage::QueryMaintenanceWhy { player } => {
                self.handle_query_maintenance_why(client_id, player);
            }
            ClientMessage::QueryCityMaintenanceWhy { city } => {
                self.handle_query_city_maintenance_why(client_id, city);
            }
            ClientMessage::StateAck {
                turn_number,
                checksum,
            } => {
                info!(
                    "Client {:?} acked turn {} checksum {:x}",
                    client_id, turn_number, checksum
                );
            }
            ClientMessage::SetReady { ready } => {
                self.handle_set_ready(client_id, ready);
            }
            ClientMessage::StartGame { map_size } => {
                self.handle_start_game(client_id, map_size);
            }
        }
    }

    fn handle_query_promise_strip(&mut self, client_id: u64) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            return;
        };
        let promises = match self.game.as_ref() {
            Some(game) => game.promise_strip(player_id),
            None => return,
        };
        self.send_message(client_id, ServerMessage::PromiseStrip { promises });
    }

    fn handle_query_city_ui(&mut self, client_id: u64, city_id: backbay_protocol::CityId) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            return;
        };
        let Some(city_ui) = self
            .game
            .as_ref()
            .and_then(|game| game.query_city_ui(player_id, city_id))
        else {
            return;
        };
        self.send_message(client_id, ServerMessage::CityUi { city: city_ui });
    }

    fn handle_query_production_options(&mut self, client_id: u64, city_id: backbay_protocol::CityId) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            return;
        };
        let Some(options) = self
            .game
            .as_ref()
            .and_then(|game| game.query_production_options(player_id, city_id))
        else {
            return;
        };
        self.send_message(
            client_id,
            ServerMessage::ProductionOptions {
                city: city_id,
                options,
            },
        );
    }

    fn handle_query_combat_preview(
        &mut self,
        client_id: u64,
        attacker: backbay_protocol::UnitId,
        defender: backbay_protocol::UnitId,
    ) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            return;
        };
        let preview = match self.game.as_ref() {
            Some(game) => game.query_combat_preview(player_id, attacker, defender),
            None => return,
        };
        self.send_message(
            client_id,
            ServerMessage::CombatPreview {
                attacker,
                defender,
                preview,
            },
        );
    }

    fn handle_query_path_preview(
        &mut self,
        client_id: u64,
        unit: backbay_protocol::UnitId,
        destination: backbay_protocol::Hex,
    ) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            return;
        };
        let preview = match self.game.as_ref() {
            Some(game) => game.query_path_preview(player_id, unit, destination),
            None => return,
        };
        self.send_message(
            client_id,
            ServerMessage::PathPreview {
                unit,
                destination,
                preview,
            },
        );
    }

    fn handle_query_combat_why(
        &mut self,
        client_id: u64,
        attacker: backbay_protocol::UnitId,
        defender: backbay_protocol::UnitId,
    ) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            return;
        };
        let panel = match self.game.as_ref() {
            Some(game) => game.query_combat_why(player_id, attacker, defender),
            None => return,
        };
        self.send_message(
            client_id,
            ServerMessage::WhyPanel {
                kind: WhyPanelKind::Combat,
                panel,
            },
        );
    }

    fn handle_query_maintenance_why(
        &mut self,
        client_id: u64,
        _player: backbay_protocol::PlayerId,
    ) {
        let Some(pid) = self.players.get_player_by_client(client_id) else {
            return;
        };
        let panel = match self.game.as_ref() {
            Some(game) => game.query_maintenance_why(pid),
            None => return,
        };
        self.send_message(
            client_id,
            ServerMessage::WhyPanel {
                kind: WhyPanelKind::Maintenance,
                panel: Some(panel),
            },
        );
    }

    fn handle_query_city_maintenance_why(
        &mut self,
        client_id: u64,
        city_id: backbay_protocol::CityId,
    ) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            return;
        };
        let panel = match self.game.as_ref() {
            Some(game) => game.query_city_maintenance_why(player_id, city_id),
            None => return,
        };
        self.send_message(
            client_id,
            ServerMessage::WhyPanel {
                kind: WhyPanelKind::CityMaintenance,
                panel,
            },
        );
    }

    fn handle_join_request(
        &mut self,
        client_id: u64,
        player_name: String,
        reconnect_token: Option<String>,
    ) {
        // Check game code if required
        if self.game_code.is_some() && !self.pending_players.contains_key(&client_id) {
            self.send_message(
                client_id,
                ServerMessage::JoinRejected {
                    reason: JoinRejectReason::InvalidGameCode,
                },
            );
            return;
        }

        // Try reconnection first
        if let Some(token) = reconnect_token {
            match self.players.reconnect(client_id, &token) {
                Ok(player_id) => {
                    info!("Player {} reconnected as {:?}", player_name, player_id);

                    self.broadcast_message(ServerMessage::PlayerReconnected { player_id });

                    self.send_game_state_with_visibility(client_id);
                    return;
                }
                Err(e) => {
                    warn!("Reconnection failed for {}: {:?}", player_name, e);
                }
            }
        }

        // New player join (unified - handles both lobby and connection state atomically)
        match self
            .players
            .add_player(client_id, player_name.clone(), false)
        {
            Ok((player_id, token)) => {
                info!("Player {} joined as {:?}", player_name, player_id);

                self.send_message(
                    client_id,
                    ServerMessage::JoinAccepted {
                        player_id,
                        reconnect_token: token,
                    },
                );

                self.broadcast_message(ServerMessage::PlayerConnected {
                    player_id,
                    player_name,
                });

                if self.game.is_some() {
                    self.send_game_state_with_visibility(client_id);
                } else {
                    // In lobby - send lobby state to all
                    self.broadcast_lobby_state();
                }
            }
            Err(AddPlayerError::GameFull) | Err(AddPlayerError::ObserversFull) => {
                self.send_message(
                    client_id,
                    ServerMessage::JoinRejected {
                        reason: JoinRejectReason::GameFull,
                    },
                );
            }
            Err(AddPlayerError::GameInProgress) => {
                self.send_message(
                    client_id,
                    ServerMessage::JoinRejected {
                        reason: JoinRejectReason::GameInProgress,
                    },
                );
            }
            Err(AddPlayerError::AlreadyExists) => {
                warn!("Player already exists for client {:?}", client_id);
            }
        }
    }

    fn handle_authenticate(&mut self, client_id: u64, game_code: String) {
        if let Some(expected) = &self.game_code {
            if game_code == *expected {
                self.pending_players.insert(client_id, game_code);
            } else {
                self.send_message(
                    client_id,
                    ServerMessage::JoinRejected {
                        reason: JoinRejectReason::InvalidGameCode,
                    },
                );
            }
        }
    }

    fn handle_turn_submission(
        &mut self,
        client_id: u64,
        turn_number: u32,
        commands: Vec<backbay_protocol::Command>,
        end_turn: bool,
        state_checksum: u64,
    ) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            warn!("Turn submission from unknown client {:?}", client_id);
            return;
        };

        // Check game exists and turn number matches
        let current_turn = match &self.game {
            Some(game) => game.turn_number(),
            None => {
                warn!("Turn submission before game started");
                return;
            }
        };

        if turn_number != current_turn {
            self.send_message(
                client_id,
                ServerMessage::TurnRejected {
                    turn_number,
                    reason: TurnRejectReason::InvalidTurnNumber,
                },
            );
            return;
        }

        // Apply commands and collect results
        let apply_result = {
            let game = self.game.as_mut().unwrap();
            game.apply_commands(player_id, commands, end_turn, state_checksum)
        };

        match apply_result {
            ApplyResult::Success {
                deltas_by_player,
                turn_ended,
            } => {
                self.send_message(client_id, ServerMessage::TurnAccepted { turn_number });

                let (state_turn, checksum) = {
                    let game = self.game.as_ref().unwrap();
                    (game.turn_number(), game.checksum())
                };
                self.broadcast_state_deltas(state_turn, checksum, &deltas_by_player);

                if turn_ended {
                    // TurnManager was advanced inside `apply_commands` when EndTurn was applied.
                    let active_players_info = {
                        let game = self.game.as_ref().unwrap();
                        let status = game.turn_manager().status();
                        status
                            .active_players
                            .iter()
                            .map(|&p| {
                                let unit_count = game.unit_count(p);
                                let city_count = game.city_count(p);
                                let time = game
                                    .turn_manager()
                                    .calculate_time_remaining(unit_count, city_count);
                                (p, status.turn_number, time.as_millis() as u64)
                            })
                            .collect::<Vec<_>>()
                    };

                    self.broadcast_message(ServerMessage::TurnEnded {
                        player: player_id,
                        turn_number,
                    });

                    // Notify active players
                    for (active_player, turn_num, time_ms) in active_players_info {
                        if let Some(player) = self.players.get_player(active_player) {
                            if let Some(active_client) = player.client_id {
                                self.send_message(
                                    active_client,
                                    ServerMessage::TurnStarted {
                                        active_player,
                                        turn_number: turn_num,
                                        time_remaining_ms: time_ms,
                                    },
                                );
                            }
                        }
                    }
                }
            }
            ApplyResult::NotYourTurn => {
                self.send_message(
                    client_id,
                    ServerMessage::TurnRejected {
                        turn_number,
                        reason: TurnRejectReason::NotYourTurn,
                    },
                );
            }
            ApplyResult::ValidationError { index, reason } => {
                self.send_message(
                    client_id,
                    ServerMessage::TurnRejected {
                        turn_number,
                        reason: TurnRejectReason::InvalidCommand { index, reason },
                    },
                );
            }
            ApplyResult::DesyncDetected { expected, received } => {
                warn!(
                    "Desync detected for player {:?}: expected {:x}, received {:x}",
                    player_id, expected, received
                );

                self.send_message(
                    client_id,
                    ServerMessage::DesyncDetected {
                        turn_number,
                        expected_checksum: expected,
                        received_checksum: received,
                    },
                );
                self.send_game_state_with_visibility(client_id);
            }
        }
    }

    fn broadcast_state_deltas(
        &mut self,
        state_turn: u32,
        checksum: u64,
        deltas_by_player: &HashMap<PlayerId, Vec<backbay_protocol::Event>>,
    ) {
        if deltas_by_player.values().all(|d| d.is_empty()) {
            return;
        }

        let clients: Vec<u64> = self.renet.clients_id();
        for target_client in clients {
            let player_for_client = self.players.get_player_by_client(target_client);
            let deltas = match player_for_client {
                Some(pid) => deltas_by_player.get(&pid).cloned().unwrap_or_default(),
                None => Vec::new(),
            };

            if deltas.is_empty() {
                continue;
            }

            let promises = match (player_for_client, self.game.as_ref()) {
                (Some(pid), Some(game)) => Some(game.promise_strip(pid)),
                _ => None,
            };

            self.send_message(
                target_client,
                ServerMessage::StateDelta {
                    turn_number: state_turn,
                    deltas,
                    checksum,
                },
            );

            if let Some(promises) = promises {
                self.send_message(target_client, ServerMessage::PromiseStrip { promises });
            }
        }
    }

    fn force_end_turn(&mut self, player_id: PlayerId, reason: &'static str) {
        let should_force = self
            .game
            .as_ref()
            .is_some_and(|g| g.snapshot().current_player == player_id);
        if !should_force {
            return;
        }

        info!("Forcing end turn for {:?} ({})", player_id, reason);

        let (turn_before, state_turn, checksum, deltas_by_player, turn_ended) = {
            let game = self.game.as_mut().expect("game exists");
            let turn_before = game.turn_number();
            let result = game.apply_commands(player_id, Vec::new(), true, 0);
            match result {
                ApplyResult::Success {
                    deltas_by_player,
                    turn_ended,
                } => (
                    turn_before,
                    game.turn_number(),
                    game.checksum(),
                    deltas_by_player,
                    turn_ended,
                ),
                ApplyResult::NotYourTurn => return,
                ApplyResult::ValidationError { reason, .. } => {
                    warn!("force_end_turn failed: {}", reason);
                    return;
                }
                ApplyResult::DesyncDetected { .. } => return,
            }
        };

        self.broadcast_state_deltas(state_turn, checksum, &deltas_by_player);

        if !turn_ended {
            return;
        }

        self.broadcast_message(ServerMessage::TurnEnded {
            player: player_id,
            turn_number: turn_before,
        });

        let active_players_info = {
            let game = self.game.as_ref().expect("game exists");
            let status = game.turn_manager().status();
            status
                .active_players
                .iter()
                .map(|&p| {
                    let unit_count = game.unit_count(p);
                    let city_count = game.city_count(p);
                    let time = game
                        .turn_manager()
                        .calculate_time_remaining(unit_count, city_count);
                    (p, status.turn_number, time.as_millis() as u64)
                })
                .collect::<Vec<_>>()
        };

        for (active_player, turn_num, time_ms) in active_players_info {
            if let Some(player) = self.players.get_player(active_player) {
                if let Some(active_client) = player.client_id {
                    self.send_message(
                        active_client,
                        ServerMessage::TurnStarted {
                            active_player,
                            turn_number: turn_num,
                            time_remaining_ms: time_ms,
                        },
                    );
                }
            }
        }
    }

    fn handle_chat(&mut self, client_id: u64, message: String) {
        if let Some(player_id) = self.players.get_player_by_client(client_id) {
            self.broadcast_message(ServerMessage::Chat {
                from: player_id,
                message,
            });
        }
    }

    fn handle_ping(&mut self, client_id: u64, client_timestamp: u64) {
        let server_timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        self.send_message(
            client_id,
            ServerMessage::Pong {
                client_timestamp,
                server_timestamp,
            },
        );
    }

    fn handle_state_request(&mut self, client_id: u64) {
        self.send_game_state_with_visibility(client_id);
    }

    fn handle_request_replay(&mut self, client_id: u64) {
        let Some(pid) = self.players.get_player_by_client(client_id) else {
            self.send_message(
                client_id,
                ServerMessage::ReplayDenied {
                    message: "Replay denied (not a player in this game)".to_string(),
                },
            );
            return;
        };
        let Some(game) = self.game.as_ref() else {
            self.send_message(
                client_id,
                ServerMessage::ReplayDenied {
                    message: "Replay denied (no active game)".to_string(),
                },
            );
            return;
        };
        let allowed = self.players.is_host(pid) || game.is_game_over();
        if !allowed {
            self.send_message(
                client_id,
                ServerMessage::ReplayDenied {
                    message: "Replay denied (host-only until game over)".to_string(),
                },
            );
            return;
        }
        let Some(replay) = game.export_replay() else {
            self.send_message(
                client_id,
                ServerMessage::ReplayDenied {
                    message: "Replay export failed".to_string(),
                },
            );
            return;
        };
        self.send_message(client_id, ServerMessage::ReplayFile { replay });
    }

    fn send_game_state_with_visibility(&mut self, client_id: u64) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            return;
        };
        let (checksum, snapshot, turn_number, rules_names, rules_catalog, deltas, promises) = {
            let Some(game) = self.game.as_ref() else {
                return;
            };

            let checksum = game.checksum();
            let snapshot = game.snapshot_for_player(player_id);
            let turn_number = game.turn_number();
            let rules_names = game.rules_names();
            let rules_catalog = game.rules_catalog();
            let deltas = game.visibility_sync_deltas(player_id);
            let promises = game.promise_strip(player_id);

            (
                checksum,
                snapshot,
                turn_number,
                rules_names,
                rules_catalog,
                deltas,
                promises,
            )
        };

        self.send_message(client_id, ServerMessage::GameState { snapshot, checksum });
        self.send_message(client_id, ServerMessage::RulesNames { names: rules_names });
        self.send_message(
            client_id,
            ServerMessage::RulesCatalog {
                catalog: rules_catalog,
            },
        );
        if !deltas.is_empty() {
            self.send_message(
                client_id,
                ServerMessage::StateDelta {
                    turn_number,
                    deltas,
                    checksum,
                },
            );
        }

        self.send_message(client_id, ServerMessage::PromiseStrip { promises });
    }

    fn handle_set_ready(&mut self, client_id: u64, ready: bool) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            return;
        };

        if self.players.set_ready(player_id, ready).is_ok() {
            // Broadcast ready state change
            self.broadcast_message(ServerMessage::PlayerReady { player_id, ready });
            self.broadcast_lobby_state();
        }
    }

    fn handle_start_game(&mut self, client_id: u64, map_size: u32) {
        let Some(player_id) = self.players.get_player_by_client(client_id) else {
            return;
        };

        // Only host can start
        if !self.players.is_host(player_id) {
            warn!("Non-host {:?} tried to start game", player_id);
            return;
        }

        // Check if game can start
        if !self.players.can_start() {
            warn!("Cannot start: not enough players or not all ready");
            return;
        }

        // Start the game (atomically transitions all players from lobby to playing)
        let Ok(players) = self.players.start_game() else {
            return;
        };

        info!("Starting game with {} players", players.len());

        // Notify clients
        self.broadcast_message(ServerMessage::GameStarting { countdown_ms: 0 });

        // Generate initial game state via the authoritative core engine.
        let engine = self.generate_initial_engine(map_size, &players);
        self.start_game_state(engine);
    }

    fn generate_initial_engine(&self, map_size: u32, players: &[PlayerId]) -> GameEngine {
        // Generate map with procedural terrain.
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64;

        let map_config = MapGenConfig {
            width: map_size,
            height: (map_size * 2 / 3).max(10), // 3:2 aspect ratio
            num_players: players.len() as u32,
            wrap_horizontal: true,
            water_ratio: 0.35,
            elevation_variance: 0.5,
            resource_density: 0.12,
        };

        let rules = load_rules(RulesSource::Embedded).expect("rules load");
        let generated = generate_map(&rules, &map_config, seed);

        // Mapgen returns start positions in a stable order; bind them to the lobby's player order.
        let mut start_positions_by_player_id = vec![Hex { q: 0, r: 0 }; players.len()];
        for (idx, &player_id) in players.iter().enumerate() {
            let Some(pos) = generated.start_positions.get(idx).copied() else {
                continue;
            };
            let slot = player_id.0 as usize;
            if slot < start_positions_by_player_id.len() {
                start_positions_by_player_id[slot] = pos;
            }
        }

        let mut engine = backbay_core::GameEngine::new_game_with_generated_map(
            rules,
            seed,
            generated.tiles,
            generated.width,
            generated.height,
            generated.wrap_horizontal,
            &start_positions_by_player_id,
            players.len() as u32,
        );

        // Bind runtime player names/AI flags from the lobby state.
        for p in engine.state_mut().players.iter_mut() {
            let slot = p.id.0 as usize;
            p.name = self
                .players
                .get_player_name(p.id)
                .unwrap_or_else(|| format!("Player {}", slot + 1));
            p.is_ai = self.players.is_ai_controlled(p.id);
        }
        engine
    }

    #[allow(dead_code)]
    fn send_lobby_state(&mut self, client_id: u64) {
        let lobby_players = self.players.get_lobby_state();
        let host = self.players.host().unwrap_or(PlayerId(0));
        self.send_message(
            client_id,
            ServerMessage::LobbyState {
                players: lobby_players,
                host,
                min_players: self.players.min_players(),
                max_players: self.players.max_players(),
            },
        );
    }

    fn broadcast_lobby_state(&mut self) {
        let lobby_players = self.players.get_lobby_state();
        let host = self.players.host().unwrap_or(PlayerId(0));
        self.broadcast_message(ServerMessage::LobbyState {
            players: lobby_players,
            host,
            min_players: self.players.min_players(),
            max_players: self.players.max_players(),
        });
    }

    /// Initialize game state and broadcast to all clients
    fn start_game_state(&mut self, engine: GameEngine) {
        info!("Starting game with {} players", self.players.player_count());

        // The authoritative sim is sequential today; dynamic/simultaneous is a later upgrade.
        let game = GameState::new(engine, TurnMode::Sequential, self.config.turn_timer.clone());
        self.game = Some(game);

        for renet_client in self.renet.clients_id() {
            self.send_game_state_with_visibility(renet_client);
        }
    }

    fn send_message(&mut self, client_id: u64, message: ServerMessage) {
        if let Ok(data) = serialize_server_message(&message) {
            let channel = match &message {
                ServerMessage::Chat { .. } => channel_id::CHAT,
                ServerMessage::Pong { .. } => channel_id::HEARTBEAT,
                _ => channel_id::COMMANDS,
            };
            self.renet.send_message(client_id, channel, data);
        }
    }

    fn broadcast_message(&mut self, message: ServerMessage) {
        if let Ok(data) = serialize_server_message(&message) {
            let channel = match &message {
                ServerMessage::Chat { .. } => channel_id::CHAT,
                _ => channel_id::COMMANDS,
            };
            self.renet.broadcast_message(channel, data);
        }
    }

    /// Access to Renet server for transport integration
    #[allow(dead_code)]
    pub fn renet_server(&mut self) -> &mut RenetServer {
        &mut self.renet
    }
}

fn main() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("backbay_server=info")
        .init();

    let config = AppConfig::default();
    let mut server = Server::new(config.clone());

    // Create transport layer
    let transport_config = backbay_server::TransportConfig {
        public_address: config.bind_address,
        max_clients: (config.max_players + config.max_observers) as usize,
        private_key: None, // Unsecure mode for development
    };

    let mut transport = match backbay_server::ServerRunner::new(transport_config) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("Failed to create transport: {}", e);
            std::process::exit(1);
        }
    };

    info!("Backbay Imperium Server v{}", env!("CARGO_PKG_VERSION"));
    info!("Listening on {}", config.bind_address);
    info!("Protocol ID: {:016x}", backbay_server::PROTOCOL_ID);

    // Main server loop
    let tick_duration = Duration::from_millis(16); // ~60 Hz
    loop {
        let start = Instant::now();

        // Update transport (receive/send packets)
        transport.update(server.renet_server(), tick_duration);

        // Update game logic
        server.update(tick_duration);

        let elapsed = start.elapsed();
        if let Some(sleep_time) = tick_duration.checked_sub(elapsed) {
            std::thread::sleep(sleep_time);
        }
    }
}
