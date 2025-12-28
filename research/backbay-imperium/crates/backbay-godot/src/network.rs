//! Network client for multiplayer games.
//!
//! Provides NetworkBridge GodotClass for connecting to Backbay Imperium servers.

use std::net::{SocketAddr, UdpSocket};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use godot::prelude::*;
use renet::RenetClient;
use renet_netcode::{ClientAuthentication, ConnectToken, NetcodeClientTransport};

use backbay_server::{
    channel_id, create_channel_configs,
    protocol::{
        deserialize_server_message, serialize_client_message, ClientMessage, JoinRejectReason,
        ServerMessage, TurnRejectReason,
    },
    PROTOCOL_ID,
};

/// Connection state for the network client
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ConnectionState {
    #[default]
    Disconnected,
    Connecting,
    Connected,
    InLobby,
    InGame,
}

/// Network client for multiplayer games.
#[derive(GodotClass)]
#[class(base = Node)]
pub struct NetworkBridge {
    base: Base<Node>,
    /// Renet client (None when disconnected)
    client: Option<RenetClient>,
    /// Netcode transport (None when disconnected)
    transport: Option<NetcodeClientTransport>,
    /// Current connection state
    state: ConnectionState,
    /// Our assigned player ID (None until join accepted)
    player_id: Option<i32>,
    /// Reconnection token for seamless reconnects
    reconnect_token: Option<String>,
    /// Ping interval
    ping_interval: Duration,
    /// Time since last ping
    time_since_ping: Duration,
    /// Queued commands for current turn
    command_queue: Vec<backbay_protocol::Command>,
    /// Current turn number
    current_turn: u32,
    /// Last known state checksum
    state_checksum: u64,
}

#[godot_api]
impl INode for NetworkBridge {
    fn init(base: Base<Node>) -> Self {
        Self {
            base,
            client: None,
            transport: None,
            state: ConnectionState::Disconnected,
            player_id: None,
            reconnect_token: None,
            ping_interval: Duration::from_secs(5),
            time_since_ping: Duration::ZERO,
            command_queue: Vec::new(),
            current_turn: 0,
            state_checksum: 0,
        }
    }

    fn process(&mut self, delta: f64) {
        let delta_duration = Duration::from_secs_f64(delta);

        // Check if we have transport and client
        if self.transport.is_none() || self.client.is_none() {
            return;
        }

        let current_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();

        // Update transport - need to borrow transport and client together
        {
            let transport = self.transport.as_mut().unwrap();
            let client = self.client.as_mut().unwrap();

            if let Err(e) = transport.update(current_time, client) {
                godot_error!("Transport error: {}", e);
                self.cleanup_connection();
                self.base_mut().emit_signal(
                    "disconnected",
                    &[GString::from("Transport error").to_variant()],
                );
                return;
            }

            // Send packets
            let _ = transport.send_packets(client);
        }

        // Check connection status and process messages
        let is_connected = self.client.as_ref().map_or(false, |c| c.is_connected());

        if self.state == ConnectionState::Connecting && is_connected {
            self.state = ConnectionState::Connected;
            self.base_mut().emit_signal("connected", &[]);
        }

        // Collect messages first, then process them
        let mut command_messages: Vec<Vec<u8>> = Vec::new();
        let mut chat_messages: Vec<Vec<u8>> = Vec::new();
        let mut heartbeat_messages: Vec<Vec<u8>> = Vec::new();

        if let Some(client) = &mut self.client {
            while let Some(data) = client.receive_message(channel_id::COMMANDS) {
                command_messages.push(data.to_vec());
            }
            while let Some(data) = client.receive_message(channel_id::CHAT) {
                chat_messages.push(data.to_vec());
            }
            while let Some(data) = client.receive_message(channel_id::HEARTBEAT) {
                heartbeat_messages.push(data.to_vec());
            }
        }

        // Now process collected messages
        for data in command_messages {
            self.handle_server_message(&data);
        }
        for data in chat_messages {
            self.handle_server_message(&data);
        }
        for data in heartbeat_messages {
            self.handle_server_message(&data);
        }

        // Periodic ping
        self.time_since_ping += delta_duration;
        if self.time_since_ping >= self.ping_interval && is_connected {
            self.time_since_ping = Duration::ZERO;
            self.send_ping();
        }
    }
}

#[godot_api]
impl NetworkBridge {
    // Signals
    #[signal]
    fn connected();

    #[signal]
    fn disconnected(reason: GString);

    #[signal]
    fn join_accepted(player_id: i32, reconnect_token: GString);

    #[signal]
    fn join_rejected(reason: GString);

    #[signal]
    fn game_state(snapshot_json: GString, checksum: i64);

    #[signal]
    fn state_delta(turn: i32, deltas_json: GString, checksum: i64);

    #[signal]
    fn replay_file(replay_json: GString);

    #[signal]
    fn replay_denied(message: GString);

    #[signal]
    fn rules_names(names_json: GString);

    #[signal]
    fn rules_catalog(catalog_json: GString);

    #[signal]
    fn promise_strip(promises_json: GString);

    #[signal]
    fn city_ui(city_ui_json: GString);

    #[signal]
    fn production_options(city_id: i64, options_json: GString);

    #[signal]
    fn combat_preview(attacker_id: i64, defender_id: i64, preview_json: GString);

    #[signal]
    fn path_preview(unit_id: i64, dest_q: i32, dest_r: i32, preview_json: GString);

    #[signal]
    fn why_panel(kind: GString, panel_json: GString);

    #[signal]
    fn turn_started(player_id: i32, turn: i32, time_ms: i64);

    #[signal]
    fn turn_ended(player_id: i32, turn: i32);

    #[signal]
    fn turn_accepted(turn: i32);

    #[signal]
    fn turn_rejected(turn: i32, reason: GString);

    #[signal]
    fn desync_detected(turn: i32, expected: i64, received: i64);

    #[signal]
    fn player_connected(player_id: i32, name: GString);

    #[signal]
    fn player_disconnected(player_id: i32, ai_takeover: bool);

    #[signal]
    fn player_reconnected(player_id: i32);

    #[signal]
    fn chat_received(from_player: i32, message: GString);

    #[signal]
    fn pong(latency_ms: i64);

    #[signal]
    fn lobby_state(players_json: GString, host_id: i32, min_players: i32, max_players: i32);

    #[signal]
    fn player_ready(player_id: i32, ready: bool);

    #[signal]
    fn game_starting(countdown_ms: i32);

    #[signal]
    fn notification(notification_type: GString, data_json: GString);

    #[signal]
    fn game_ended(winner_id: i32, victory_type: GString);

    /// Connect to a server using unsecure mode (for development/LAN).
    #[func]
    fn connect_unsecure(&mut self, host: GString, port: i32) -> bool {
        if self.state != ConnectionState::Disconnected {
            godot_warn!("Already connected or connecting");
            return false;
        }

        let server_addr: SocketAddr = match format!("{}:{}", host, port).parse() {
            Ok(addr) => addr,
            Err(e) => {
                godot_error!("Invalid address: {}", e);
                return false;
            }
        };

        let socket = match UdpSocket::bind("0.0.0.0:0") {
            Ok(s) => s,
            Err(e) => {
                godot_error!("Failed to bind socket: {}", e);
                return false;
            }
        };

        if let Err(e) = socket.set_nonblocking(true) {
            godot_error!("Failed to set non-blocking: {}", e);
            return false;
        }

        let current_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();

        let client_id: u64 = rand_u64();

        let authentication = ClientAuthentication::Unsecure {
            client_id,
            protocol_id: PROTOCOL_ID,
            server_addr,
            user_data: None,
        };

        let transport = match NetcodeClientTransport::new(current_time, authentication, socket) {
            Ok(t) => t,
            Err(e) => {
                godot_error!("Failed to create transport: {}", e);
                return false;
            }
        };

        let connection_config = renet::ConnectionConfig {
            available_bytes_per_tick: 60_000,
            server_channels_config: create_channel_configs(),
            client_channels_config: create_channel_configs(),
        };

        let client = RenetClient::new(connection_config);

        self.transport = Some(transport);
        self.client = Some(client);
        self.state = ConnectionState::Connecting;

        godot_print!(
            "Connecting to {} (protocol {:016x})",
            server_addr,
            PROTOCOL_ID
        );
        true
    }

    /// Connect using a connect token from authentication server.
    #[func]
    fn connect_with_token(&mut self, token_bytes: PackedByteArray) -> bool {
        if self.state != ConnectionState::Disconnected {
            godot_warn!("Already connected or connecting");
            return false;
        }

        let token_data = token_bytes.to_vec();
        let token = match ConnectToken::read(&mut &token_data[..]) {
            Ok(t) => t,
            Err(e) => {
                godot_error!("Invalid connect token: {}", e);
                return false;
            }
        };

        let socket = match UdpSocket::bind("0.0.0.0:0") {
            Ok(s) => s,
            Err(e) => {
                godot_error!("Failed to bind socket: {}", e);
                return false;
            }
        };

        if let Err(e) = socket.set_nonblocking(true) {
            godot_error!("Failed to set non-blocking: {}", e);
            return false;
        }

        let current_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();

        let authentication = ClientAuthentication::Secure {
            connect_token: token,
        };

        let transport = match NetcodeClientTransport::new(current_time, authentication, socket) {
            Ok(t) => t,
            Err(e) => {
                godot_error!("Failed to create transport: {}", e);
                return false;
            }
        };

        let connection_config = renet::ConnectionConfig {
            available_bytes_per_tick: 60_000,
            server_channels_config: create_channel_configs(),
            client_channels_config: create_channel_configs(),
        };

        let client = RenetClient::new(connection_config);

        self.transport = Some(transport);
        self.client = Some(client);
        self.state = ConnectionState::Connecting;

        true
    }

    /// Disconnect from the server.
    #[func]
    fn disconnect(&mut self) {
        if let Some(ref mut transport) = self.transport {
            transport.disconnect();
        }
        self.cleanup_connection();
        self.base_mut().emit_signal(
            "disconnected",
            &[GString::from("User requested disconnect").to_variant()],
        );
    }

    /// Get current connection state as string.
    #[func]
    fn get_state(&self) -> GString {
        GString::from(match self.state {
            ConnectionState::Disconnected => "disconnected",
            ConnectionState::Connecting => "connecting",
            ConnectionState::Connected => "connected",
            ConnectionState::InLobby => "in_lobby",
            ConnectionState::InGame => "in_game",
        })
    }

    /// Check if connected (Connected, InLobby, or InGame).
    #[func]
    fn is_connected(&self) -> bool {
        matches!(
            self.state,
            ConnectionState::Connected | ConnectionState::InLobby | ConnectionState::InGame
        )
    }

    /// Get our player ID (or -1 if not assigned).
    #[func]
    fn get_player_id(&self) -> i32 {
        self.player_id.unwrap_or(-1)
    }

    /// Request to join the game.
    #[func]
    fn join_game(&mut self, player_name: GString) {
        let msg = ClientMessage::JoinRequest {
            player_name: player_name.to_string(),
            reconnect_token: self.reconnect_token.clone(),
        };
        self.send_command(msg);
    }

    /// Authenticate with a game code (for private games).
    #[func]
    fn authenticate(&mut self, game_code: GString) {
        let msg = ClientMessage::Authenticate {
            game_code: game_code.to_string(),
        };
        self.send_command(msg);
    }

    /// Submit turn commands.
    #[func]
    fn submit_turn(
        &mut self,
        turn_number: i32,
        commands_bytes: PackedByteArray,
        end_turn: bool,
        state_checksum: i64,
    ) {
        let commands_data = commands_bytes.to_vec();
        let commands: Vec<backbay_protocol::Command> =
            match rmp_serde::decode::from_slice(&commands_data) {
                Ok(cmds) => cmds,
                Err(e) => {
                    godot_error!("Failed to decode commands: {}", e);
                    return;
                }
            };

        let msg = ClientMessage::TurnSubmission {
            turn_number: turn_number as u32,
            commands,
            end_turn,
            state_checksum: state_checksum as u64,
        };
        self.send_command(msg);
    }

    /// Send a chat message.
    #[func]
    fn send_chat(&mut self, message: GString) {
        let msg = ClientMessage::Chat {
            message: message.to_string(),
        };
        self.send_chat_message(msg);
    }

    /// Request the full game state (for reconnection).
    #[func]
    fn request_state(&mut self) {
        self.send_command(ClientMessage::RequestState);
    }

    /// Request a shareable replay file (seed + rules hash + command log).
    #[func]
    fn request_replay(&mut self) {
        self.send_command(ClientMessage::RequestReplay);
    }

    /// Query the promise strip for the current player.
    #[func]
    fn query_promise_strip(&mut self) {
        self.send_command(ClientMessage::QueryPromiseStrip);
    }

    /// Query UI city summary for a city.
    #[func]
    fn query_city_ui(&mut self, city_id: i64) {
        let city = backbay_protocol::EntityId::from_raw(city_id as u64);
        self.send_command(ClientMessage::QueryCityUi { city });
    }

    /// Query production options for a city.
    #[func]
    fn query_production_options(&mut self, city_id: i64) {
        let city = backbay_protocol::EntityId::from_raw(city_id as u64);
        self.send_command(ClientMessage::QueryProductionOptions { city });
    }

    /// Query combat preview for attacker vs defender.
    #[func]
    fn query_combat_preview(&mut self, attacker_id: i64, defender_id: i64) {
        let attacker = backbay_protocol::EntityId::from_raw(attacker_id as u64);
        let defender = backbay_protocol::EntityId::from_raw(defender_id as u64);
        self.send_command(ClientMessage::QueryCombatPreview { attacker, defender });
    }

    /// Query combat "Why?" panel for attacker vs defender.
    #[func]
    fn query_combat_why(&mut self, attacker_id: i64, defender_id: i64) {
        let attacker = backbay_protocol::EntityId::from_raw(attacker_id as u64);
        let defender = backbay_protocol::EntityId::from_raw(defender_id as u64);
        self.send_command(ClientMessage::QueryCombatWhy { attacker, defender });
    }

    /// Query path preview for a unit to a destination hex.
    #[func]
    fn query_path_preview(&mut self, unit_id: i64, q: i32, r: i32) {
        let unit = backbay_protocol::EntityId::from_raw(unit_id as u64);
        let destination = backbay_protocol::Hex { q, r };
        self.send_command(ClientMessage::QueryPathPreview { unit, destination });
    }

    /// Query maintenance "Why?" panel for a player.
    #[func]
    fn query_maintenance_why(&mut self, player_id: i32) {
        let player = backbay_protocol::PlayerId(player_id as u8);
        self.send_command(ClientMessage::QueryMaintenanceWhy { player });
    }

    /// Query city maintenance "Why?" panel for a city.
    #[func]
    fn query_city_maintenance_why(&mut self, city_id: i64) {
        let city = backbay_protocol::EntityId::from_raw(city_id as u64);
        self.send_command(ClientMessage::QueryCityMaintenanceWhy { city });
    }

    /// Acknowledge receipt of game state.
    #[func]
    fn ack_state(&mut self, turn_number: i32, checksum: i64) {
        let msg = ClientMessage::StateAck {
            turn_number: turn_number as u32,
            checksum: checksum as u64,
        };
        self.send_command(msg);
    }

    /// Set ready state in lobby.
    #[func]
    fn set_ready(&mut self, ready: bool) {
        let msg = ClientMessage::SetReady { ready };
        self.send_command(msg);
    }

    /// Request to start the game (host only).
    #[func]
    fn start_game(&mut self, map_size: i32) {
        let msg = ClientMessage::StartGame {
            map_size: map_size as u32,
        };
        self.send_command(msg);
    }

    // -------------------------------------------------------------------------
    // Game Commands - These submit commands as part of a turn
    // -------------------------------------------------------------------------

    /// Move a unit along a path.
    /// path_json: JSON array of {q, r} hex coordinates
    #[func]
    fn move_unit(&mut self, unit_id: i64, path_json: GString) {
        let path: Vec<backbay_protocol::Hex> = match serde_json::from_str(&path_json.to_string()) {
            Ok(p) => p,
            Err(e) => {
                godot_error!("Invalid path JSON: {}", e);
                return;
            }
        };

        let unit = backbay_protocol::EntityId::from_raw(unit_id as u64);
        let cmd = backbay_protocol::Command::MoveUnit { unit, path };
        self.queue_command(cmd);
    }

    /// Set goto orders for a unit.
    /// path_json: JSON array of {q, r} hex coordinates
    #[func]
    fn set_goto_orders(&mut self, unit_id: i64, path_json: GString) {
        let path: Vec<backbay_protocol::Hex> = match serde_json::from_str(&path_json.to_string()) {
            Ok(p) => p,
            Err(e) => {
                godot_error!("Invalid path JSON: {}", e);
                return;
            }
        };

        let unit = backbay_protocol::EntityId::from_raw(unit_id as u64);
        let orders = backbay_protocol::UnitOrders::Goto { path };
        let cmd = backbay_protocol::Command::SetOrders { unit, orders };
        self.queue_command(cmd);
    }

    /// Attack another unit.
    #[func]
    fn attack_unit(&mut self, attacker_id: i64, target_id: i64) {
        let attacker = backbay_protocol::EntityId::from_raw(attacker_id as u64);
        let target = backbay_protocol::EntityId::from_raw(target_id as u64);
        let cmd = backbay_protocol::Command::AttackUnit { attacker, target };
        self.queue_command(cmd);
    }

    /// Fortify a unit in place.
    #[func]
    fn fortify_unit(&mut self, unit_id: i64) {
        let unit = backbay_protocol::EntityId::from_raw(unit_id as u64);
        let cmd = backbay_protocol::Command::Fortify { unit };
        self.queue_command(cmd);
    }

    /// Cancel unit orders.
    #[func]
    fn cancel_orders(&mut self, unit_id: i64) {
        let unit = backbay_protocol::EntityId::from_raw(unit_id as u64);
        let cmd = backbay_protocol::Command::CancelOrders { unit };
        self.queue_command(cmd);
    }

    /// Toggle worker automation for a unit.
    #[func]
    fn set_worker_automation(&mut self, unit_id: i64, enabled: bool) {
        let unit = backbay_protocol::EntityId::from_raw(unit_id as u64);
        let cmd = backbay_protocol::Command::SetWorkerAutomation { unit, enabled };
        self.queue_command(cmd);
    }

    /// Set build-improvement orders for a unit.
    #[func]
    fn set_build_improvement_orders(&mut self, unit_id: i64, improvement_id: i32) {
        let unit = backbay_protocol::EntityId::from_raw(unit_id as u64);
        let improvement = backbay_protocol::ImprovementId::new(improvement_id as u16);
        let orders = backbay_protocol::UnitOrders::BuildImprovement {
            improvement,
            at: None,
            turns_remaining: None,
        };
        let cmd = backbay_protocol::Command::SetOrders { unit, orders };
        self.queue_command(cmd);
    }

    /// Set repair-improvement orders for a unit.
    #[func]
    fn set_repair_improvement_orders(&mut self, unit_id: i64) {
        let unit = backbay_protocol::EntityId::from_raw(unit_id as u64);
        let orders = backbay_protocol::UnitOrders::RepairImprovement {
            at: None,
            turns_remaining: None,
        };
        let cmd = backbay_protocol::Command::SetOrders { unit, orders };
        self.queue_command(cmd);
    }

    /// Pillage an improvement with a unit.
    #[func]
    fn pillage_improvement(&mut self, unit_id: i64) {
        let unit = backbay_protocol::EntityId::from_raw(unit_id as u64);
        let cmd = backbay_protocol::Command::PillageImprovement { unit };
        self.queue_command(cmd);
    }

    /// Found a city with a settler.
    #[func]
    fn found_city(&mut self, settler_id: i64, city_name: GString) {
        let settler = backbay_protocol::EntityId::from_raw(settler_id as u64);
        let cmd = backbay_protocol::Command::FoundCity {
            settler,
            name: city_name.to_string(),
        };
        self.queue_command(cmd);
    }

    /// Set city production.
    /// item_type: "unit" or "building"
    /// item_id: The type ID of the unit or building to produce
    #[func]
    fn set_production(&mut self, city_id: i64, item_type: GString, item_id: i32) {
        let city = backbay_protocol::EntityId::from_raw(city_id as u64);
        let item = match item_type.to_string().as_str() {
            "unit" => backbay_protocol::ProductionItem::Unit(backbay_protocol::UnitTypeId::new(
                item_id as u16,
            )),
            "building" => backbay_protocol::ProductionItem::Building(
                backbay_protocol::BuildingId::new(item_id as u16),
            ),
            _ => {
                godot_error!("Invalid item_type: {}", item_type);
                return;
            }
        };
        let cmd = backbay_protocol::Command::SetProduction { city, item };
        self.queue_command(cmd);
    }

    /// Buy the current production in a city with gold.
    #[func]
    fn buy_production(&mut self, city_id: i64) {
        let city = backbay_protocol::EntityId::from_raw(city_id as u64);
        let cmd = backbay_protocol::Command::BuyProduction { city };
        self.queue_command(cmd);
    }

    /// Assign a citizen to work a tile.
    #[func]
    fn assign_citizen(&mut self, city_id: i64, tile_index: i32) {
        let city = backbay_protocol::EntityId::from_raw(city_id as u64);
        let cmd = backbay_protocol::Command::AssignCitizen {
            city,
            tile_index: tile_index as u8,
        };
        self.queue_command(cmd);
    }

    /// Unassign a citizen from a tile.
    #[func]
    fn unassign_citizen(&mut self, city_id: i64, tile_index: i32) {
        let city = backbay_protocol::EntityId::from_raw(city_id as u64);
        let cmd = backbay_protocol::Command::UnassignCitizen {
            city,
            tile_index: tile_index as u8,
        };
        self.queue_command(cmd);
    }

    /// Set the current research target.
    #[func]
    fn set_research(&mut self, tech_id: i32) {
        let tech = backbay_protocol::TechId::new(tech_id as u16);
        let cmd = backbay_protocol::Command::SetResearch { tech };
        self.queue_command(cmd);
    }

    /// Adopt a social policy.
    #[func]
    fn adopt_policy(&mut self, policy_id: i32) {
        let policy = backbay_protocol::PolicyId::new(policy_id as u16);
        let cmd = backbay_protocol::Command::AdoptPolicy { policy };
        self.queue_command(cmd);
    }

    /// Reform government to a new type.
    #[func]
    fn reform_government(&mut self, government_id: i32) {
        let government = backbay_protocol::GovernmentId::new(government_id as u16);
        let cmd = backbay_protocol::Command::ReformGovernment { government };
        self.queue_command(cmd);
    }

    /// Establish a trade route between two cities.
    #[func]
    fn establish_trade_route(&mut self, from_city_id: i64, to_city_id: i64) {
        let from = backbay_protocol::EntityId::from_raw(from_city_id as u64);
        let to = backbay_protocol::EntityId::from_raw(to_city_id as u64);
        let cmd = backbay_protocol::Command::EstablishTradeRoute { from, to };
        self.queue_command(cmd);
    }

    /// Cancel a trade route.
    #[func]
    fn cancel_trade_route(&mut self, route_id: i64) {
        let route = backbay_protocol::EntityId::from_raw(route_id as u64);
        let cmd = backbay_protocol::Command::CancelTradeRoute { route };
        self.queue_command(cmd);
    }

    /// Declare war on another player.
    #[func]
    fn declare_war(&mut self, target_player_id: i32) {
        let target = backbay_protocol::PlayerId(target_player_id as u8);
        let cmd = backbay_protocol::Command::DeclareWar { target };
        self.queue_command(cmd);
    }

    /// Declare peace with another player.
    #[func]
    fn declare_peace(&mut self, target_player_id: i32) {
        let target = backbay_protocol::PlayerId(target_player_id as u8);
        let cmd = backbay_protocol::Command::DeclarePeace { target };
        self.queue_command(cmd);
    }

    /// End the current turn (adds EndTurn command to queue).
    #[func]
    fn end_turn_command(&mut self) {
        let cmd = backbay_protocol::Command::EndTurn;
        self.queue_command(cmd);
    }

    /// Get queued commands as JSON (for debugging/UI).
    #[func]
    fn get_queued_commands_json(&self) -> GString {
        match serde_json::to_string(&self.command_queue) {
            Ok(json) => GString::from(json.as_str()),
            Err(_) => GString::from("[]"),
        }
    }

    /// Get the number of queued commands.
    #[func]
    fn get_queued_command_count(&self) -> i32 {
        self.command_queue.len() as i32
    }

    /// Clear all queued commands without submitting.
    #[func]
    fn clear_command_queue(&mut self) {
        self.command_queue.clear();
    }

    /// Submit all queued commands and end turn.
    /// This sends all queued commands to the server and clears the queue.
    #[func]
    fn submit_queued_commands(&mut self, end_turn: bool) {
        if self.command_queue.is_empty() && !end_turn {
            godot_warn!("No commands to submit");
            return;
        }

        // Add EndTurn command if requested
        if end_turn {
            self.command_queue.push(backbay_protocol::Command::EndTurn);
        }

        // Serialize commands
        let commands_data = match rmp_serde::encode::to_vec(&self.command_queue) {
            Ok(data) => data,
            Err(e) => {
                godot_error!("Failed to serialize commands: {}", e);
                return;
            }
        };

        // Submit turn
        let msg = ClientMessage::TurnSubmission {
            turn_number: self.current_turn,
            commands: std::mem::take(&mut self.command_queue),
            end_turn,
            state_checksum: self.state_checksum,
        };
        self.send_command(msg);

        // Clear the queue (already taken via std::mem::take)
        godot_print!(
            "Submitted {} bytes of commands for turn {}",
            commands_data.len(),
            self.current_turn
        );
    }

    // Internal methods

    /// Queue a command for the current turn.
    fn queue_command(&mut self, cmd: backbay_protocol::Command) {
        self.command_queue.push(cmd);
    }

    fn send_command(&mut self, msg: ClientMessage) {
        if let Some(client) = &mut self.client {
            if let Ok(data) = serialize_client_message(&msg) {
                client.send_message(channel_id::COMMANDS, data);
            }
        }
    }

    fn send_chat_message(&mut self, msg: ClientMessage) {
        if let Some(client) = &mut self.client {
            if let Ok(data) = serialize_client_message(&msg) {
                client.send_message(channel_id::CHAT, data);
            }
        }
    }

    fn send_ping(&mut self) {
        if let Some(client) = &mut self.client {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            let msg = ClientMessage::Ping { timestamp };
            if let Ok(data) = serialize_client_message(&msg) {
                client.send_message(channel_id::HEARTBEAT, data);
            }
        }
    }

    fn cleanup_connection(&mut self) {
        self.client = None;
        self.transport = None;
        self.state = ConnectionState::Disconnected;
        self.player_id = None;
        self.command_queue.clear();
        self.current_turn = 0;
        self.state_checksum = 0;
        // Keep reconnect_token for potential reconnection
    }

    fn handle_server_message(&mut self, data: &[u8]) {
        let msg = match deserialize_server_message(data) {
            Ok(m) => m,
            Err(e) => {
                godot_error!("Failed to deserialize server message: {}", e);
                return;
            }
        };

        match msg {
            ServerMessage::JoinAccepted {
                player_id,
                reconnect_token,
            } => {
                self.player_id = Some(player_id.0 as i32);
                self.reconnect_token = Some(reconnect_token.clone());
                self.state = ConnectionState::InLobby;
                self.base_mut().emit_signal(
                    "join_accepted",
                    &[
                        (player_id.0 as i32).to_variant(),
                        GString::from(reconnect_token.as_str()).to_variant(),
                    ],
                );
            }

            ServerMessage::JoinRejected { reason } => {
                let reason_str = format_join_reject_reason(&reason);
                self.base_mut().emit_signal(
                    "join_rejected",
                    &[GString::from(reason_str.as_str()).to_variant()],
                );
            }

            ServerMessage::GameState { snapshot, checksum } => {
                self.state = ConnectionState::InGame;
                self.current_turn = snapshot.turn;
                self.state_checksum = checksum;
                self.command_queue.clear(); // Clear any stale commands

                // Serialize to JSON for GDScript consumption
                let snapshot_json = match serde_json::to_string(&snapshot) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize snapshot to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut().emit_signal(
                    "game_state",
                    &[snapshot_json.to_variant(), (checksum as i64).to_variant()],
                );
            }

            ServerMessage::ReplayFile { replay } => {
                let replay_json = match serde_json::to_string(&replay) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize replay file to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut()
                    .emit_signal("replay_file", &[replay_json.to_variant()]);
            }

            ServerMessage::ReplayDenied { message } => {
                self.base_mut().emit_signal(
                    "replay_denied",
                    &[GString::from(message.as_str()).to_variant()],
                );
            }

            ServerMessage::RulesNames { names } => {
                let names_json = match serde_json::to_string(&names) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize rules names to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut()
                    .emit_signal("rules_names", &[names_json.to_variant()]);
            }

            ServerMessage::RulesCatalog { catalog } => {
                let catalog_json = match serde_json::to_string(&catalog) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize rules catalog to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut()
                    .emit_signal("rules_catalog", &[catalog_json.to_variant()]);
            }

            ServerMessage::PromiseStrip { promises } => {
                let promises_json = match serde_json::to_string(&promises) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize promises to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut()
                    .emit_signal("promise_strip", &[promises_json.to_variant()]);
            }

            ServerMessage::CityUi { city } => {
                let city_json = match serde_json::to_string(&city) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize city ui to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut()
                    .emit_signal("city_ui", &[city_json.to_variant()]);
            }

            ServerMessage::ProductionOptions { city, options } => {
                let options_json = match serde_json::to_string(&options) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize production options to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut().emit_signal(
                    "production_options",
                    &[
                        (city.to_raw() as i64).to_variant(),
                        options_json.to_variant(),
                    ],
                );
            }

            ServerMessage::CombatPreview {
                attacker,
                defender,
                preview,
            } => {
                let preview_json = match serde_json::to_string(&preview) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize combat preview to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut().emit_signal(
                    "combat_preview",
                    &[
                        (attacker.to_raw() as i64).to_variant(),
                        (defender.to_raw() as i64).to_variant(),
                        preview_json.to_variant(),
                    ],
                );
            }

            ServerMessage::PathPreview {
                unit,
                destination,
                preview,
            } => {
                let preview_json = match serde_json::to_string(&preview) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize path preview to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut().emit_signal(
                    "path_preview",
                    &[
                        (unit.to_raw() as i64).to_variant(),
                        destination.q.to_variant(),
                        destination.r.to_variant(),
                        preview_json.to_variant(),
                    ],
                );
            }

            ServerMessage::WhyPanel { kind, panel } => {
                let kind_str = match kind {
                    backbay_server::protocol::WhyPanelKind::Combat => "Combat",
                    backbay_server::protocol::WhyPanelKind::Maintenance => "Maintenance",
                    backbay_server::protocol::WhyPanelKind::CityMaintenance => "CityMaintenance",
                };
                let panel_json = match serde_json::to_string(&panel) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize why panel to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut().emit_signal(
                    "why_panel",
                    &[
                        GString::from(kind_str).to_variant(),
                        panel_json.to_variant(),
                    ],
                );
            }

            ServerMessage::StateDelta {
                turn_number,
                deltas,
                checksum,
            } => {
                self.current_turn = turn_number;
                self.state_checksum = checksum;

                let deltas_json = match serde_json::to_string(&deltas) {
                    Ok(s) => GString::from(s.as_str()),
                    Err(e) => {
                        godot_error!("Failed to serialize deltas to JSON: {}", e);
                        return;
                    }
                };
                self.base_mut().emit_signal(
                    "state_delta",
                    &[
                        (turn_number as i32).to_variant(),
                        deltas_json.to_variant(),
                        (checksum as i64).to_variant(),
                    ],
                );
            }

            ServerMessage::TurnStarted {
                active_player,
                turn_number,
                time_remaining_ms,
            } => {
                self.current_turn = turn_number;
                self.command_queue.clear(); // Clear queue for new turn

                self.base_mut().emit_signal(
                    "turn_started",
                    &[
                        (active_player.0 as i32).to_variant(),
                        (turn_number as i32).to_variant(),
                        (time_remaining_ms as i64).to_variant(),
                    ],
                );
            }

            ServerMessage::TurnEnded {
                player,
                turn_number,
            } => {
                self.base_mut().emit_signal(
                    "turn_ended",
                    &[
                        (player.0 as i32).to_variant(),
                        (turn_number as i32).to_variant(),
                    ],
                );
            }

            ServerMessage::TurnAccepted { turn_number } => {
                self.base_mut()
                    .emit_signal("turn_accepted", &[(turn_number as i32).to_variant()]);
            }

            ServerMessage::TurnRejected {
                turn_number,
                reason,
            } => {
                let reason_str = format_turn_reject_reason(&reason);
                self.base_mut().emit_signal(
                    "turn_rejected",
                    &[
                        (turn_number as i32).to_variant(),
                        GString::from(reason_str.as_str()).to_variant(),
                    ],
                );
            }

            ServerMessage::DesyncDetected {
                turn_number,
                expected_checksum,
                received_checksum,
            } => {
                self.base_mut().emit_signal(
                    "desync_detected",
                    &[
                        (turn_number as i32).to_variant(),
                        (expected_checksum as i64).to_variant(),
                        (received_checksum as i64).to_variant(),
                    ],
                );
            }

            ServerMessage::PlayerConnected {
                player_id,
                player_name,
            } => {
                self.base_mut().emit_signal(
                    "player_connected",
                    &[
                        (player_id.0 as i32).to_variant(),
                        GString::from(player_name.as_str()).to_variant(),
                    ],
                );
            }

            ServerMessage::PlayerDisconnected {
                player_id,
                ai_takeover,
            } => {
                self.base_mut().emit_signal(
                    "player_disconnected",
                    &[(player_id.0 as i32).to_variant(), ai_takeover.to_variant()],
                );
            }

            ServerMessage::PlayerReconnected { player_id } => {
                self.base_mut()
                    .emit_signal("player_reconnected", &[(player_id.0 as i32).to_variant()]);
            }

            ServerMessage::Chat { from, message } => {
                self.base_mut().emit_signal(
                    "chat_received",
                    &[
                        (from.0 as i32).to_variant(),
                        GString::from(message.as_str()).to_variant(),
                    ],
                );
            }

            ServerMessage::Pong {
                client_timestamp,
                server_timestamp: _,
            } => {
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;
                let latency = now_ms.saturating_sub(client_timestamp);
                self.base_mut()
                    .emit_signal("pong", &[(latency as i64).to_variant()]);
            }

            ServerMessage::Notification { notification } => {
                use backbay_server::protocol::ServerNotification;
                let (notif_type, data) = match notification {
                    ServerNotification::TurnTimerWarning { seconds_remaining } => (
                        "TurnTimerWarning",
                        format!("{{\"seconds\": {}}}", seconds_remaining),
                    ),
                    ServerNotification::AITakeoverWarning {
                        player_id,
                        seconds_until,
                    } => (
                        "AITakeoverWarning",
                        format!(
                            "{{\"player\": {}, \"seconds\": {}}}",
                            player_id.0, seconds_until
                        ),
                    ),
                    ServerNotification::GamePaused { reason } => {
                        ("GamePaused", format!("{{\"reason\": \"{}\"}}", reason))
                    }
                    ServerNotification::GameResumed => ("GameResumed", "{}".to_string()),
                };
                self.base_mut().emit_signal(
                    "notification",
                    &[
                        GString::from(notif_type).to_variant(),
                        GString::from(data.as_str()).to_variant(),
                    ],
                );
            }

            ServerMessage::GameEnded { result } => {
                let winner_id = result.winner.map_or(-1, |p| p.0 as i32);
                let victory_type = format!("{:?}", result.victory_type);
                self.base_mut().emit_signal(
                    "game_ended",
                    &[
                        winner_id.to_variant(),
                        GString::from(victory_type.as_str()).to_variant(),
                    ],
                );
            }

            ServerMessage::LobbyState {
                players,
                host,
                min_players,
                max_players,
            } => {
                // Serialize players to JSON for GDScript
                let players_json =
                    serde_json::to_string(&players).unwrap_or_else(|_| "[]".to_string());
                self.base_mut().emit_signal(
                    "lobby_state",
                    &[
                        GString::from(players_json.as_str()).to_variant(),
                        (host.0 as i32).to_variant(),
                        (min_players as i32).to_variant(),
                        (max_players as i32).to_variant(),
                    ],
                );
            }

            ServerMessage::PlayerReady { player_id, ready } => {
                self.base_mut().emit_signal(
                    "player_ready",
                    &[(player_id.0 as i32).to_variant(), ready.to_variant()],
                );
            }

            ServerMessage::GameStarting { countdown_ms } => {
                self.state = ConnectionState::InGame;
                self.base_mut()
                    .emit_signal("game_starting", &[(countdown_ms as i32).to_variant()]);
            }
        }
    }
}

fn format_join_reject_reason(reason: &JoinRejectReason) -> String {
    match reason {
        JoinRejectReason::GameFull => "Game is full".to_string(),
        JoinRejectReason::GameInProgress => "Game already in progress".to_string(),
        JoinRejectReason::InvalidGameCode => "Invalid game code".to_string(),
        JoinRejectReason::InvalidReconnectToken => "Invalid reconnect token".to_string(),
        JoinRejectReason::Banned => "You are banned from this game".to_string(),
    }
}

fn format_turn_reject_reason(reason: &TurnRejectReason) -> String {
    match reason {
        TurnRejectReason::NotYourTurn => "Not your turn".to_string(),
        TurnRejectReason::InvalidTurnNumber => "Invalid turn number".to_string(),
        TurnRejectReason::InvalidCommand { index, reason } => {
            format!("Invalid command at index {}: {}", index, reason)
        }
        TurnRejectReason::TimerExpired => "Turn timer expired".to_string(),
        TurnRejectReason::ChecksumMismatch => "State checksum mismatch".to_string(),
    }
}

/// Simple pseudo-random u64 for client IDs.
fn rand_u64() -> u64 {
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let pid = std::process::id() as u64;
    (time as u64).wrapping_mul(0x517cc1b727220a95) ^ pid.wrapping_mul(0x2545f4914f6cdd1d)
}
