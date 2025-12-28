extends Node
class_name NetworkClient

## Network client wrapper for multiplayer games.
## Provides a GDScript-friendly interface to the NetworkBridge.

signal connected()
signal disconnected(reason: String)
signal join_accepted(player_id: int, reconnect_token: String)
signal join_rejected(reason: String)
signal lobby_updated(players: Array, host_id: int, min_players: int, max_players: int)
signal player_ready_changed(player_id: int, ready: bool)
signal game_starting(countdown_ms: int)
signal game_state_received(snapshot: Dictionary, checksum: int)
signal state_delta_received(turn: int, deltas: Array, checksum: int)
signal replay_received(replay_json: String)
signal replay_denied(message: String)
signal desync_detected(turn: int, expected_checksum: int, received_checksum: int)
signal rules_names_received(names: Dictionary)
signal rules_catalog_received(catalog: Dictionary)
signal promise_strip_received(promises: Array)
signal city_ui_received(city: Dictionary)
signal production_options_received(city_id: int, options: Array)
signal combat_preview_received(attacker_id: int, defender_id: int, preview)
signal path_preview_received(unit_id: int, destination: Vector2i, preview: Dictionary)
signal why_panel_received(kind: String, panel)
signal chat_received(from_player: int, message: String)
signal player_connected(player_id: int, name: String)
signal player_disconnected(player_id: int, ai_takeover: bool)
signal notification_received(notif_type: String, data: Dictionary)
signal latency_updated(latency_ms: int)
signal turn_started(active_player: int, turn: int, time_ms: int)
signal turn_ended(player_id: int, turn: int)
signal game_snapshot_received(snapshot: Dictionary)
signal error_received(message: String)
signal game_ended(is_victory: bool, victory_type: String, reason: String, stats: Dictionary)

var bridge: Node = null  # NetworkBridge from GDExtension
var player_id: int = -1
var player_name: String = ""
var is_host: bool = false
var players: Array = []
var latency_ms: int = 0

enum State { DISCONNECTED, CONNECTING, CONNECTED, IN_LOBBY, IN_GAME }
var state: State = State.DISCONNECTED


func _ready() -> void:
	# Try to create the NetworkBridge from GDExtension
	if ClassDB.class_exists("NetworkBridge"):
		bridge = ClassDB.instantiate("NetworkBridge")
		add_child(bridge)
		_connect_signals()
	else:
		push_warning("NetworkBridge not available - multiplayer disabled")


func _connect_signals() -> void:
	if bridge == null:
		return

	bridge.connected.connect(_on_connected)
	bridge.disconnected.connect(_on_disconnected)
	bridge.join_accepted.connect(_on_join_accepted)
	bridge.join_rejected.connect(_on_join_rejected)
	bridge.lobby_state.connect(_on_lobby_state)
	bridge.player_ready.connect(_on_player_ready)
	bridge.game_starting.connect(_on_game_starting)
	bridge.game_state.connect(_on_game_state)
	bridge.state_delta.connect(_on_state_delta)
	bridge.replay_file.connect(_on_replay_file)
	bridge.replay_denied.connect(_on_replay_denied)
	bridge.desync_detected.connect(_on_desync_detected)
	bridge.rules_names.connect(_on_rules_names)
	bridge.rules_catalog.connect(_on_rules_catalog)
	bridge.promise_strip.connect(_on_promise_strip)
	bridge.city_ui.connect(_on_city_ui)
	bridge.production_options.connect(_on_production_options)
	bridge.combat_preview.connect(_on_combat_preview)
	bridge.path_preview.connect(_on_path_preview)
	bridge.why_panel.connect(_on_why_panel)
	bridge.chat_received.connect(_on_chat_received)
	bridge.player_connected.connect(_on_player_connected)
	bridge.player_disconnected.connect(_on_player_disconnected)
	(bridge.get("notification") as Signal).connect(_on_notification)
	bridge.pong.connect(_on_pong)
	bridge.turn_started.connect(_on_turn_started)
	bridge.turn_ended.connect(_on_turn_ended)
	bridge.turn_rejected.connect(_on_turn_rejected)


func is_available() -> bool:
	return bridge != null


func connect_to_server(host: String, port: int, name: String) -> bool:
	if bridge == null:
		push_error("NetworkBridge not available")
		return false

	player_name = name
	state = State.CONNECTING
	return bridge.connect_unsecure(host, port)


func disconnect_from_server() -> void:
	if bridge:
		bridge.close()
	state = State.DISCONNECTED


func join_game() -> void:
	if bridge:
		bridge.join_game(player_name)


func set_ready(ready: bool) -> void:
	if bridge:
		bridge.set_ready(ready)


func start_game(map_size: int = 64) -> void:
	if bridge and is_host:
		bridge.start_game(map_size)


func send_chat(message: String) -> void:
	if bridge:
		bridge.send_chat(message)


func get_player_name(pid: int) -> String:
	for p in players:
		if p.get("player_id", -1) == pid:
			return p.get("name", "Unknown")
	return "Player %d" % pid


func is_player_ready(pid: int) -> bool:
	for p in players:
		if p.get("player_id", -1) == pid:
			return p.get("ready", false)
	return false


# Signal handlers

func _on_connected() -> void:
	state = State.CONNECTED
	connected.emit()
	# Automatically join after connecting
	join_game()


func _on_disconnected(reason: String) -> void:
	state = State.DISCONNECTED
	player_id = -1
	is_host = false
	players.clear()
	disconnected.emit(reason)


func _on_join_accepted(pid: int, token: String) -> void:
	player_id = pid
	state = State.IN_LOBBY
	join_accepted.emit(pid, token)


func _on_join_rejected(reason: String) -> void:
	state = State.DISCONNECTED
	join_rejected.emit(reason)


func _on_lobby_state(players_json: String, host_id: int, min_p: int, max_p: int) -> void:
	var parsed = JSON.parse_string(players_json)
	if typeof(parsed) == TYPE_ARRAY:
		players = parsed
	else:
		players = []

	is_host = (player_id == host_id)
	lobby_updated.emit(players, host_id, min_p, max_p)


func _on_player_ready(pid: int, ready: bool) -> void:
	# Update local player list
	for i in range(players.size()):
		if players[i].get("player_id", -1) == pid:
			players[i]["ready"] = ready
			break
	player_ready_changed.emit(pid, ready)


func _on_game_starting(countdown_ms: int) -> void:
	state = State.IN_GAME
	game_starting.emit(countdown_ms)


func _on_game_state(snapshot_json: String, checksum: int) -> void:
	# Decode the snapshot from JSON
	var snapshot: Dictionary = {}

	if not snapshot_json.is_empty():
		var parsed = JSON.parse_string(snapshot_json)
		if typeof(parsed) == TYPE_DICTIONARY:
			snapshot = parsed
		else:
			push_error("Failed to parse game state JSON")

	game_state_received.emit(snapshot, checksum)
	game_snapshot_received.emit(snapshot)

func _on_state_delta(turn: int, deltas_json: String, checksum: int) -> void:
	var parsed = JSON.parse_string(deltas_json)
	var deltas: Array = []
	if typeof(parsed) == TYPE_ARRAY:
		deltas = parsed
	else:
		push_error("Failed to parse state delta JSON")
	state_delta_received.emit(turn, deltas, checksum)


func _on_replay_file(replay_json: String) -> void:
	replay_received.emit(replay_json)

func _on_replay_denied(message: String) -> void:
	replay_denied.emit(message)


func _on_desync_detected(turn: int, expected: int, received: int) -> void:
	desync_detected.emit(turn, expected, received)


func _on_rules_names(names_json: String) -> void:
	var parsed = JSON.parse_string(names_json)
	var names: Dictionary = {}
	if typeof(parsed) == TYPE_DICTIONARY:
		names = parsed
	else:
		push_error("Failed to parse rules names JSON")
	rules_names_received.emit(names)


func _on_rules_catalog(catalog_json: String) -> void:
	var parsed = JSON.parse_string(catalog_json)
	var catalog: Dictionary = {}
	if typeof(parsed) == TYPE_DICTIONARY:
		catalog = parsed
	else:
		push_error("Failed to parse rules catalog JSON")
	rules_catalog_received.emit(catalog)


func _on_path_preview(unit_id: int, dest_q: int, dest_r: int, preview_json: String) -> void:
	var parsed = JSON.parse_string(preview_json)
	var preview: Dictionary = {}
	if typeof(parsed) == TYPE_DICTIONARY:
		preview = parsed
	path_preview_received.emit(unit_id, Vector2i(dest_q, dest_r), preview)

func _on_promise_strip(promises_json: String) -> void:
	var parsed = JSON.parse_string(promises_json)
	var promises: Array = []
	if typeof(parsed) == TYPE_ARRAY:
		promises = parsed
	else:
		push_error("Failed to parse promise strip JSON")
	promise_strip_received.emit(promises)


func _on_city_ui(city_ui_json: String) -> void:
	var parsed = JSON.parse_string(city_ui_json)
	var city: Dictionary = {}
	if typeof(parsed) == TYPE_DICTIONARY:
		city = parsed
	else:
		push_error("Failed to parse city ui JSON")
	city_ui_received.emit(city)


func _on_production_options(city_id: int, options_json: String) -> void:
	var parsed = JSON.parse_string(options_json)
	var options: Array = []
	if typeof(parsed) == TYPE_ARRAY:
		options = parsed
	else:
		push_error("Failed to parse production options JSON")
	production_options_received.emit(city_id, options)


func _on_combat_preview(attacker_id: int, defender_id: int, preview_json: String) -> void:
	var preview = JSON.parse_string(preview_json)
	combat_preview_received.emit(attacker_id, defender_id, preview)


func _on_why_panel(kind: String, panel_json: String) -> void:
	var panel = JSON.parse_string(panel_json)
	why_panel_received.emit(kind, panel)


func _on_chat_received(from_player: int, message: String) -> void:
	chat_received.emit(from_player, message)


func _on_player_connected(pid: int, name: String) -> void:
	player_connected.emit(pid, name)


func _on_player_disconnected(pid: int, ai_takeover: bool) -> void:
	player_disconnected.emit(pid, ai_takeover)


func _on_notification(notif_type: String, data_json: String) -> void:
	var data = JSON.parse_string(data_json)
	if typeof(data) != TYPE_DICTIONARY:
		data = {}
	notification_received.emit(notif_type, data)

	# Handle game_ended notification
	if notif_type == "game_ended":
		_handle_game_ended(data)


func _on_pong(latency: int) -> void:
	latency_ms = latency
	latency_updated.emit(latency)


func _on_turn_started(active_player: int, turn: int, time_ms: int) -> void:
	turn_started.emit(active_player, turn, time_ms)


func _on_turn_ended(pid: int, turn: int) -> void:
	turn_ended.emit(pid, turn)


func _on_turn_rejected(turn: int, reason: String) -> void:
	error_received.emit("Turn rejected: " + reason)


# Game command methods - these queue commands on the bridge

func send_move(unit_id: int, q: int, r: int) -> void:
	if bridge == null:
		return
	# Move to a single hex position
	var path_json := JSON.stringify([{"q": q, "r": r}])
	bridge.move_unit(unit_id, path_json)
	bridge.submit_queued_commands(false)


func send_attack(attacker_id: int, target_id: int) -> void:
	if bridge:
		bridge.attack_unit(attacker_id, target_id)
		bridge.submit_queued_commands(false)


func send_fortify(unit_id: int) -> void:
	if bridge:
		bridge.fortify_unit(unit_id)
		bridge.submit_queued_commands(false)


func send_found_city(settler_id: int, city_name: String, _q: int, _r: int) -> void:
	if bridge:
		bridge.found_city(settler_id, city_name)
		bridge.submit_queued_commands(false)


func send_build(city_id: int, item_type: String, item_id: int) -> void:
	if bridge:
		bridge.set_production(city_id, item_type, item_id)
		bridge.submit_queued_commands(false)


func send_research(tech_id: int) -> void:
	if bridge:
		bridge.set_research(tech_id)
		bridge.submit_queued_commands(false)


func send_end_turn() -> void:
	if bridge:
		bridge.submit_queued_commands(true)


func send_goto_orders(unit_id: int, full_path: Array) -> void:
	if bridge == null:
		return
	if full_path.is_empty():
		return
	var path_json := JSON.stringify(full_path)
	bridge.set_goto_orders(unit_id, path_json)
	bridge.submit_queued_commands(false)


func cancel_orders(unit_id: int) -> void:
	if bridge:
		bridge.cancel_orders(unit_id)
		bridge.submit_queued_commands(false)


func set_worker_automation(unit_id: int, enabled: bool) -> void:
	if bridge:
		bridge.set_worker_automation(unit_id, enabled)
		bridge.submit_queued_commands(false)


func set_build_improvement_orders(unit_id: int, improvement_id: int) -> void:
	if bridge:
		bridge.set_build_improvement_orders(unit_id, improvement_id)
		bridge.submit_queued_commands(false)


func set_repair_improvement_orders(unit_id: int) -> void:
	if bridge:
		bridge.set_repair_improvement_orders(unit_id)
		bridge.submit_queued_commands(false)


func query_promise_strip() -> void:
	if bridge:
		bridge.query_promise_strip()


func query_city_ui(city_id: int) -> void:
	if bridge:
		bridge.query_city_ui(city_id)


func query_production_options(city_id: int) -> void:
	if bridge:
		bridge.query_production_options(city_id)


func query_combat_preview(attacker_id: int, defender_id: int) -> void:
	if bridge:
		bridge.query_combat_preview(attacker_id, defender_id)


func query_combat_why(attacker_id: int, defender_id: int) -> void:
	if bridge:
		bridge.query_combat_why(attacker_id, defender_id)


func query_path_preview(unit_id: int, dest: Vector2i) -> void:
	if bridge:
		bridge.query_path_preview(unit_id, dest.x, dest.y)


func query_maintenance_why(player_id: int) -> void:
	if bridge:
		bridge.query_maintenance_why(player_id)


func query_city_maintenance_why(city_id: int) -> void:
	if bridge:
		bridge.query_city_maintenance_why(city_id)


func request_snapshot() -> void:
	if bridge:
		bridge.request_state()


func request_replay() -> void:
	if bridge:
		bridge.request_replay()


func _handle_game_ended(data: Dictionary) -> void:
	var winner_id := -1
	var winner_data = data.get("winner", -1)
	if typeof(winner_data) == TYPE_DICTIONARY:
		winner_id = int(winner_data.get("0", -1))
	else:
		winner_id = int(winner_data)

	var is_victory := (winner_id == player_id)
	var victory_type = String(data.get("victory_type", ""))
	var reason = String(data.get("defeat_reason", ""))

	# Extract player stats
	var stats: Dictionary = {}
	var all_stats = data.get("player_stats", {})
	if typeof(all_stats) == TYPE_DICTIONARY:
		var my_stats = all_stats.get(str(player_id), {})
		if typeof(my_stats) == TYPE_DICTIONARY:
			stats = my_stats

	# Add turn count if available
	if data.has("final_turn"):
		stats["turns"] = int(data.get("final_turn", 0))

	game_ended.emit(is_victory, victory_type, reason, stats)
