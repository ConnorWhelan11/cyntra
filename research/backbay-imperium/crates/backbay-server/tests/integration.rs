//! Integration tests for client-server communication.
//!
//! Tests the full flow from lobby join to game start and turn submission.

use std::time::Duration;

use backbay_core::{generate_map, load_rules, MapGenConfig, RulesSource};
use backbay_protocol::{
    Command, EntityId, Hex, MapSnapshot, PlayerId, PlayerSnapshot, Snapshot, UnitSnapshot,
    UnitTypeId,
};
use backbay_server::{
    protocol::{
        deserialize_server_message, serialize_client_message, serialize_server_message,
        ClientMessage, ServerMessage,
    },
    AddPlayerError, PlayerManager,
};

/// Test the complete lobby flow: join, ready, start
#[test]
fn lobby_flow_two_players() {
    let mut players = PlayerManager::new(2, 4, 2, Duration::from_secs(60));

    // Player 1 joins
    let (p1_id, p1_token) = players.add_player(100, "Alice".into(), false).unwrap();
    assert_eq!(p1_id, PlayerId(0));
    assert!(!p1_token.is_empty());
    assert!(players.is_host(p1_id));

    // Player 2 joins
    let (p2_id, _p2_token) = players.add_player(101, "Bob".into(), false).unwrap();
    assert_eq!(p2_id, PlayerId(1));
    assert!(!players.is_host(p2_id));

    // Can't start yet - not ready
    assert!(!players.can_start());

    // Both players ready up
    players.set_ready(p1_id, true).unwrap();
    assert!(!players.can_start()); // Still need p2

    players.set_ready(p2_id, true).unwrap();
    assert!(players.can_start());

    // Start the game
    let player_order = players.start_game().unwrap();
    assert_eq!(player_order, vec![PlayerId(0), PlayerId(1)]);
    assert!(players.has_started());

    // Both players are now in playing state
    assert!(players.is_connected(p1_id));
    assert!(players.is_connected(p2_id));
}

/// Test message serialization roundtrip
#[test]
fn message_serialization_roundtrip() {
    // Client messages
    let join_msg = ClientMessage::JoinRequest {
        player_name: "TestPlayer".into(),
        reconnect_token: None,
    };
    let data = serialize_client_message(&join_msg).unwrap();
    assert!(!data.is_empty());

    let turn_msg = ClientMessage::TurnSubmission {
        turn_number: 5,
        commands: vec![Command::EndTurn],
        end_turn: true,
        state_checksum: 0x12345678,
    };
    let data = serialize_client_message(&turn_msg).unwrap();
    assert!(!data.is_empty());

    // Server messages
    let accept_msg = ServerMessage::JoinAccepted {
        player_id: PlayerId(0),
        reconnect_token: "abc123".into(),
    };
    let data = backbay_server::protocol::serialize_server_message(&accept_msg).unwrap();
    let decoded = deserialize_server_message(&data).unwrap();
    match decoded {
        ServerMessage::JoinAccepted {
            player_id,
            reconnect_token,
        } => {
            assert_eq!(player_id, PlayerId(0));
            assert_eq!(reconnect_token, "abc123");
        }
        _ => panic!("Wrong message type"),
    }
}

/// Test game full rejection
#[test]
fn game_full_rejection() {
    let mut players = PlayerManager::new(2, 2, 0, Duration::from_secs(60));

    // Fill the game
    players.add_player(100, "Alice".into(), false).unwrap();
    players.add_player(101, "Bob".into(), false).unwrap();

    // Third player should be rejected
    let result = players.add_player(102, "Charlie".into(), false);
    assert!(matches!(result, Err(AddPlayerError::GameFull)));
}

/// Test reconnection flow
#[test]
fn reconnection_during_game() {
    let mut players = PlayerManager::new(2, 4, 2, Duration::from_secs(60));

    // Setup game
    let (p1_id, p1_token) = players.add_player(100, "Alice".into(), false).unwrap();
    let (p2_id, _) = players.add_player(101, "Bob".into(), false).unwrap();
    players.set_ready(p1_id, true).unwrap();
    players.set_ready(p2_id, true).unwrap();
    players.start_game().unwrap();

    // Player 1 disconnects
    let disconnected = players.disconnect(100);
    assert_eq!(disconnected, Some(p1_id));
    assert!(!players.is_connected(p1_id));

    // Player 1 reconnects with new client ID
    let reconnected = players.reconnect(200, &p1_token).unwrap();
    assert_eq!(reconnected, p1_id);
    assert!(players.is_connected(p1_id));
}

/// Test rate limiting
#[test]
fn rate_limiting_enforced() {
    let mut players = PlayerManager::new(2, 4, 2, Duration::from_secs(60));
    players.add_player(100, "Alice".into(), false).unwrap();

    // Spam messages - should hit rate limit
    for i in 0..100 {
        let allowed = players.check_rate_limit(100);
        if i < 60 {
            assert!(allowed, "Message {} should be allowed", i);
        } else {
            assert!(!allowed, "Message {} should be rate limited", i);
        }
    }
}

/// Test host reassignment on disconnect
#[test]
fn host_reassignment() {
    let mut players = PlayerManager::new(2, 4, 2, Duration::from_secs(60));

    let (p1_id, _) = players.add_player(100, "Alice".into(), false).unwrap();
    let (p2_id, _) = players.add_player(101, "Bob".into(), false).unwrap();

    assert!(players.is_host(p1_id));
    assert!(!players.is_host(p2_id));

    // Host disconnects in lobby
    players.disconnect(100);

    // p2 becomes host
    assert!(players.is_host(p2_id));
}

/// Test AI takeover after grace period
#[test]
fn ai_takeover_timing() {
    let mut players = PlayerManager::new(2, 4, 2, Duration::from_millis(50));

    // Setup and start game
    let (p1_id, _) = players.add_player(100, "Alice".into(), false).unwrap();
    let (p2_id, _) = players.add_player(101, "Bob".into(), false).unwrap();
    players.set_ready(p1_id, true).unwrap();
    players.set_ready(p2_id, true).unwrap();
    players.start_game().unwrap();

    // Disconnect p1
    players.disconnect(100);
    assert!(!players.is_ai_controlled(p1_id));

    // Before grace period - no takeover
    let takeovers = players.process_disconnections();
    assert!(takeovers.is_empty());

    // Wait for grace period
    std::thread::sleep(Duration::from_millis(60));

    // After grace period - AI takeover
    let takeovers = players.process_disconnections();
    assert_eq!(takeovers, vec![p1_id]);
    assert!(players.is_ai_controlled(p1_id));
}

/// Test lobby state generation
#[test]
fn lobby_state_generation() {
    let mut players = PlayerManager::new(2, 4, 2, Duration::from_secs(60));

    players.add_player(100, "Alice".into(), false).unwrap();
    players.add_player(101, "Bob".into(), false).unwrap();
    players.set_ready(PlayerId(0), true).unwrap();

    let state = players.get_lobby_state();
    assert_eq!(state.len(), 2);

    let alice = state.iter().find(|p| p.name == "Alice").unwrap();
    assert!(alice.ready);
    assert!(alice.is_host);

    let bob = state.iter().find(|p| p.name == "Bob").unwrap();
    assert!(!bob.ready);
    assert!(!bob.is_host);
}

/// Test observer handling
#[test]
fn observer_separate_from_players() {
    let mut players = PlayerManager::new(2, 4, 2, Duration::from_secs(60));

    // Add players
    players.add_player(100, "Alice".into(), false).unwrap();
    players.add_player(101, "Bob".into(), false).unwrap();

    // Add observer
    players.add_player(102, "Observer1".into(), true).unwrap();

    assert_eq!(players.player_count(), 2);
    assert_eq!(players.observer_count(), 1);

    // Observers don't appear in lobby state
    let lobby = players.get_lobby_state();
    assert_eq!(lobby.len(), 2);
}

/// Test cannot join mid-game as player
#[test]
fn cannot_join_midgame_as_player() {
    let mut players = PlayerManager::new(2, 4, 2, Duration::from_secs(60));

    // Start game
    players.add_player(100, "Alice".into(), false).unwrap();
    players.add_player(101, "Bob".into(), false).unwrap();
    players.set_ready(PlayerId(0), true).unwrap();
    players.set_ready(PlayerId(1), true).unwrap();
    players.start_game().unwrap();

    // Try to join as player - should fail
    let result = players.add_player(102, "Charlie".into(), false);
    assert!(matches!(result, Err(AddPlayerError::GameInProgress)));
}

/// Test protocol message types
#[test]
fn all_client_message_types_serialize() {
    let messages = vec![
        ClientMessage::JoinRequest {
            player_name: "Test".into(),
            reconnect_token: Some("token".into()),
        },
        ClientMessage::Authenticate {
            game_code: "ABC123".into(),
        },
        ClientMessage::SetReady { ready: true },
        ClientMessage::StartGame { map_size: 64 },
        ClientMessage::TurnSubmission {
            turn_number: 1,
            commands: vec![Command::EndTurn],
            end_turn: true,
            state_checksum: 0,
        },
        ClientMessage::Chat {
            message: "Hello!".into(),
        },
        ClientMessage::Ping { timestamp: 12345 },
        ClientMessage::RequestState,
        ClientMessage::RequestReplay,
        ClientMessage::QueryPromiseStrip,
        ClientMessage::QueryCityUi {
            city: EntityId::new(0, 1),
        },
        ClientMessage::QueryProductionOptions {
            city: EntityId::new(0, 1),
        },
        ClientMessage::QueryCombatPreview {
            attacker: EntityId::new(0, 1),
            defender: EntityId::new(1, 1),
        },
        ClientMessage::QueryCombatWhy {
            attacker: EntityId::new(0, 1),
            defender: EntityId::new(1, 1),
        },
        ClientMessage::QueryPathPreview {
            unit: EntityId::new(0, 1),
            destination: Hex { q: 3, r: 4 },
        },
        ClientMessage::QueryMaintenanceWhy { player: PlayerId(0) },
        ClientMessage::QueryCityMaintenanceWhy {
            city: EntityId::new(0, 1),
        },
        ClientMessage::StateAck {
            turn_number: 1,
            checksum: 0xABCD,
        },
    ];

    for msg in messages {
        let data = serialize_client_message(&msg).expect("Serialization failed");
        assert!(!data.is_empty());
    }
}

/// End-to-end test: lobby join → game start → map generation → game state broadcast
#[test]
fn end_to_end_lobby_to_gameplay() {
    // Step 1: Set up player manager
    let mut players = PlayerManager::new(2, 4, 2, Duration::from_secs(60));

    // Step 2: Players join the lobby
    let (p1_id, _p1_token) = players.add_player(100, "Alice".into(), false).unwrap();
    let (p2_id, _p2_token) = players.add_player(101, "Bob".into(), false).unwrap();
    assert_eq!(p1_id, PlayerId(0));
    assert_eq!(p2_id, PlayerId(1));

    // Step 3: Verify lobby state is correct
    let lobby_state = players.get_lobby_state();
    assert_eq!(lobby_state.len(), 2);
    assert!(lobby_state.iter().any(|p| p.name == "Alice" && p.is_host));
    assert!(lobby_state.iter().any(|p| p.name == "Bob" && !p.is_host));

    // Step 4: Players set ready
    players.set_ready(p1_id, true).unwrap();
    players.set_ready(p2_id, true).unwrap();
    assert!(players.can_start());

    // Step 5: Host starts the game
    let player_order = players.start_game().unwrap();
    assert_eq!(player_order.len(), 2);
    assert!(players.has_started());

    // Step 6: Generate map (simulating server behavior)
    let map_config = MapGenConfig {
        width: 30,
        height: 20,
        num_players: 2,
        wrap_horizontal: true,
        water_ratio: 0.35,
        elevation_variance: 0.5,
        resource_density: 0.12,
    };
    let seed = 42u64;
    let rules = load_rules(RulesSource::Embedded).expect("rules load");
    let generated = generate_map(&rules, &map_config, seed);

    // Verify map generation
    assert_eq!(generated.tiles.len(), 30 * 20);
    assert_eq!(generated.width, 30);
    assert_eq!(generated.height, 20);
    assert_eq!(generated.start_positions.len(), 2);

    // Verify start positions are on land
    let ocean = rules
        .terrain_id("ocean")
        .unwrap_or_else(|| backbay_protocol::TerrainId::new(0));
    let coast = rules.terrain_id("coast").unwrap_or(ocean);
    for pos in &generated.start_positions {
        let idx = (pos.r as u32 * generated.width + pos.q as u32) as usize;
        let terrain = generated.tiles[idx].terrain;
        assert!(
            terrain != ocean && terrain != coast,
            "Start position should be on land, got terrain {}",
            terrain.raw
        );
    }

    // Step 7: Create game snapshot
    let settler_type = UnitTypeId::new(0);
    let mut units = Vec::new();
    for (idx, (&player_id, &start_pos)) in player_order
        .iter()
        .zip(generated.start_positions.iter())
        .enumerate()
    {
        units.push(UnitSnapshot {
            id: EntityId::new(idx as u32, 1),
            type_id: settler_type,
            owner: player_id,
            pos: start_pos,
            hp: 100,
            moves_left: 2,
            veteran_level: 0,
            orders: None,
            automated: false,
        });
    }

    let snapshot = Snapshot {
        turn: 1,
        current_player: player_order[0],
        map: MapSnapshot {
            width: generated.width,
            height: generated.height,
            wrap_horizontal: generated.wrap_horizontal,
            tiles: generated.tiles,
        },
        players: player_order
            .iter()
            .enumerate()
            .map(|(i, &id)| PlayerSnapshot {
                id,
                name: players
                    .get_player_name(id)
                    .unwrap_or_else(|| format!("Player {}", i + 1)),
                is_ai: false,
                researching: None,
                research: None,
                research_overflow: 0,
                known_techs: vec![],
                gold: 50,
                culture: 0,
                culture_milestones_reached: 0,
                available_policy_picks: 0,
                policies: vec![],
                policy_adopted_era: vec![],
                government: None,
                supply_used: 0,
                supply_cap: 5,
                war_weariness: 0,
            })
            .collect(),
        units,
        cities: vec![],
        trade_routes: vec![],
        rng_state: [0; 32],
        chronicle: vec![],
    };

    // Verify snapshot
    assert_eq!(snapshot.turn, 1);
    assert_eq!(snapshot.current_player, PlayerId(0));
    assert_eq!(snapshot.players.len(), 2);
    assert_eq!(snapshot.units.len(), 2);
    assert_eq!(snapshot.players[0].name, "Alice");
    assert_eq!(snapshot.players[1].name, "Bob");

    // Step 8: Serialize and broadcast game state
    let checksum = backbay_protocol::wire::snapshot_hash(&snapshot).unwrap();
    let game_state_msg = ServerMessage::GameState {
        snapshot: snapshot.clone(),
        checksum,
    };
    let encoded = serialize_server_message(&game_state_msg).unwrap();
    assert!(!encoded.is_empty());

    // Verify clients can decode it
    let decoded = deserialize_server_message(&encoded).unwrap();
    match decoded {
        ServerMessage::GameState {
            snapshot: recv_snapshot,
            checksum: recv_checksum,
        } => {
            assert_eq!(recv_checksum, checksum);
            assert_eq!(recv_snapshot.turn, 1);
            assert_eq!(recv_snapshot.players.len(), 2);
            assert_eq!(recv_snapshot.map.width, 30);
            assert_eq!(recv_snapshot.map.height, 20);
            assert_eq!(recv_snapshot.map.tiles.len(), 600);
        }
        _ => panic!("Expected GameState message"),
    }

    // Step 9: Simulate turn start notification
    let turn_start_msg = ServerMessage::TurnStarted {
        active_player: PlayerId(0),
        turn_number: 1,
        time_remaining_ms: 60000,
    };
    let encoded = serialize_server_message(&turn_start_msg).unwrap();
    let decoded = deserialize_server_message(&encoded).unwrap();
    match decoded {
        ServerMessage::TurnStarted {
            active_player,
            turn_number,
            time_remaining_ms,
        } => {
            assert_eq!(active_player, PlayerId(0));
            assert_eq!(turn_number, 1);
            assert_eq!(time_remaining_ms, 60000);
        }
        _ => panic!("Expected TurnStarted message"),
    }

    // Step 10: Client sends move command
    let move_cmd = Command::MoveUnit {
        unit: EntityId::new(0, 1),
        path: vec![Hex { q: 1, r: 0 }, Hex { q: 2, r: 0 }],
    };
    let turn_submit_msg = ClientMessage::TurnSubmission {
        turn_number: 1,
        commands: vec![move_cmd, Command::EndTurn],
        end_turn: true,
        state_checksum: checksum,
    };
    let encoded = serialize_client_message(&turn_submit_msg).unwrap();
    assert!(!encoded.is_empty());

    // Step 11: Server acknowledges turn
    let turn_accepted_msg = ServerMessage::TurnAccepted { turn_number: 1 };
    let encoded = serialize_server_message(&turn_accepted_msg).unwrap();
    let decoded = deserialize_server_message(&encoded).unwrap();
    match decoded {
        ServerMessage::TurnAccepted { turn_number } => {
            assert_eq!(turn_number, 1);
        }
        _ => panic!("Expected TurnAccepted message"),
    }
}

/// Test map generation produces varied terrain
#[test]
fn map_generation_terrain_variety() {
    let config = MapGenConfig {
        width: 40,
        height: 30,
        num_players: 4,
        wrap_horizontal: true,
        water_ratio: 0.4,
        elevation_variance: 0.5,
        resource_density: 0.15,
    };

    let rules = load_rules(RulesSource::Embedded).expect("rules load");
    let map = generate_map(&rules, &config, 12345);

    // Count terrain types
    let mut terrain_counts = std::collections::HashMap::new();
    for tile in &map.tiles {
        *terrain_counts.entry(tile.terrain.raw).or_insert(0) += 1;
    }

    // Should have at least 4 different terrain types
    assert!(
        terrain_counts.len() >= 4,
        "Map should have varied terrain, got {} types",
        terrain_counts.len()
    );

    // Should have some water (ocean/coast)
    let ocean = rules
        .terrain_id("ocean")
        .unwrap_or_else(|| backbay_protocol::TerrainId::new(0));
    let coast = rules.terrain_id("coast").unwrap_or(ocean);
    let water_count = terrain_counts.get(&ocean.raw).unwrap_or(&0) + terrain_counts.get(&coast.raw).unwrap_or(&0);
    assert!(water_count > 0, "Map should have some water tiles");

    // Count resources
    let resource_count = map.tiles.iter().filter(|t| t.resource.is_some()).count();
    assert!(resource_count > 0, "Map should have some resources");

    // Verify start positions are spread apart
    for i in 0..map.start_positions.len() {
        for j in (i + 1)..map.start_positions.len() {
            let a = map.start_positions[i];
            let b = map.start_positions[j];
            let dist = a.distance(b);
            assert!(
                dist >= 5,
                "Start positions should be spread apart, got distance {}",
                dist
            );
        }
    }
}

/// Test deterministic map generation for replay
#[test]
fn map_generation_deterministic_for_replay() {
    let config = MapGenConfig {
        width: 30,
        height: 20,
        num_players: 2,
        ..Default::default()
    };

    // Same seed should produce identical maps
    let rules = load_rules(RulesSource::Embedded).expect("rules load");
    let seed = 999999u64;
    let map1 = generate_map(&rules, &config, seed);
    let map2 = generate_map(&rules, &config, seed);

    // Verify tiles are identical
    for (t1, t2) in map1.tiles.iter().zip(map2.tiles.iter()) {
        assert_eq!(t1.terrain, t2.terrain, "Terrain should match");
        assert_eq!(t1.resource, t2.resource, "Resources should match");
    }

    // Verify start positions are identical
    assert_eq!(
        map1.start_positions, map2.start_positions,
        "Start positions should match"
    );

    // Different seeds should produce different maps
    let map3 = generate_map(&rules, &config, seed + 1);
    let different = map1
        .tiles
        .iter()
        .zip(map3.tiles.iter())
        .any(|(t1, t3)| t1.terrain != t3.terrain);
    assert!(different, "Different seeds should produce different maps");
}
