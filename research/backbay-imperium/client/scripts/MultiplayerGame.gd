extends Node2D
class_name MultiplayerGame

## Main multiplayer game controller.
## Connects MapViewMultiplayer, GameHUD, NetworkClient, and CityNameDialog.

signal game_over(winner_id: int)
signal return_to_lobby()

# Scene references
@onready var map_view: MapViewMultiplayer = $MapViewMultiplayer
@onready var hud: GameHUD = $GameHUD
@onready var city_dialog: CityNameDialog = $CityNameDialog
@onready var network_client: NetworkClient = $NetworkClient
@onready var combat_effects: CombatEffects = $CombatEffects
@onready var research_panel: ResearchPanel = $ResearchPanel
@onready var diplomacy_panel: DiplomacyPanel = $DiplomacyPanel
@onready var city_production_panel: CityProductionPanel = $CityProductionPanel
@onready var game_end_screen: GameEndScreen = $GameEndScreen

# Game state
var my_player_id := 0
var current_snapshot: Dictionary = {}
var selected_unit_id := -1
var pending_found_city_unit_id := -1
var last_chronicle_size := 0  # Track chronicle to detect new events
var current_turn_timer_ms := 0
var _is_game_over := false

var _replay_json_cache := ""
var _pending_replay_jump_turn := -1
var _replay_loaded := false
var _replay_client: GameClient = null

# Rules data (sent by server; drives UI panels)
var rules_names: Dictionary = {}
var rules_catalog: Dictionary = {}
var _unit_rules_by_id: Dictionary = {}        # unit_type_id -> RulesCatalogUnitType
var _building_rules_by_id: Dictionary = {}    # building_id -> RulesCatalogBuilding
var _tech_rules_by_id: Dictionary = {}        # tech_id -> RulesCatalogTech
var _improvement_rules_by_id: Dictionary = {} # improvement_id -> RulesCatalogImprovement
var _settler_type_id := -1

var _city_ui_by_id: Dictionary = {} # city_id -> CityUi dict (server-derived)
var _prod_options_by_city_id: Dictionary = {} # city_id -> Array of {name,cost,type,id}
var _pending_production_picker_city_id := -1

# Context panel state
var _context_last_hover := Vector2i(-999, -999)
var _context_last_selected_unit_id := -1
var _context_kind := ""
var _context_attacker_id := -1
var _context_defender_id := -1

# Path preview / goto state
var _last_path_preview_unit_id := -1
var _last_path_preview_dest := Vector2i(-999, -999)
var _last_path_preview: Dictionary = {}
var _pending_goto_unit_id := -1
var _pending_goto_dest := Vector2i(-999, -999)

# Configuration
var server_host := "127.0.0.1"
var server_port := 3000


func _ready() -> void:
	# Connect map view signals
	map_view.unit_selected.connect(_on_unit_selected)
	map_view.tile_clicked.connect(_on_tile_clicked)
	map_view.unit_action_requested.connect(_on_unit_action_requested)
	map_view.city_action_requested.connect(_on_city_action_requested)
	map_view.set_use_authoritative_visibility(true)

	# Connect HUD signals
	hud.end_turn_pressed.connect(_on_end_turn_pressed)
	hud.menu_pressed.connect(_on_menu_pressed)
	hud.city_panel_close_requested.connect(_on_city_panel_closed)
	hud.found_city_requested.connect(_on_found_city_requested)
	hud.production_selected.connect(_on_production_selected)
	hud.research_button_pressed.connect(_on_research_button_pressed)
	hud.minimap_clicked.connect(_on_minimap_clicked)
	hud.promise_selected.connect(_on_promise_selected)
	hud.timeline_turn_selected.connect(_on_timeline_turn_selected)
	hud.context_attack_pressed.connect(_on_context_attack_pressed)
	hud.context_why_pressed.connect(_on_context_why_pressed)
	hud.worker_automation_toggled.connect(_on_worker_automation_toggled)
	hud.share_replay_pressed.connect(_on_share_replay_pressed)
	hud.fortify_requested.connect(_on_fortify_requested)

	# Connect research panel signals
	research_panel.research_selected.connect(_on_research_selected)
	research_panel.panel_closed.connect(_on_research_panel_closed)

	# Connect diplomacy panel signals
	diplomacy_panel.declare_war.connect(_on_declare_war)
	diplomacy_panel.propose_peace.connect(_on_propose_peace)
	diplomacy_panel.panel_closed.connect(_on_diplomacy_panel_closed)
	hud.diplomacy_button_pressed.connect(_on_diplomacy_button_pressed)

	# Connect city production panel signals
	city_production_panel.production_queued.connect(_on_production_queued)
	city_production_panel.production_removed.connect(_on_production_removed)
	city_production_panel.production_moved.connect(_on_production_moved)
	city_production_panel.panel_closed.connect(_on_city_production_panel_closed)

	# Connect city dialog signals
	city_dialog.city_name_confirmed.connect(_on_city_name_confirmed)
	city_dialog.cancelled.connect(_on_city_dialog_cancelled)

	# Connect network signals
	network_client.connected.connect(_on_network_connected)
	network_client.disconnected.connect(_on_network_disconnected)
	network_client.game_snapshot_received.connect(_on_game_snapshot)
	network_client.state_delta_received.connect(_on_state_delta_received)
	network_client.replay_received.connect(_on_replay_received)
	network_client.replay_denied.connect(_on_replay_denied)
	network_client.error_received.connect(_on_network_error)
	network_client.desync_detected.connect(_on_desync_detected)
	network_client.rules_names_received.connect(_on_rules_names_received)
	network_client.rules_catalog_received.connect(_on_rules_catalog_received)
	network_client.promise_strip_received.connect(_on_promise_strip_received)
	network_client.city_ui_received.connect(_on_city_ui_received)
	network_client.production_options_received.connect(_on_production_options_received)
	network_client.combat_preview_received.connect(_on_combat_preview_received)
	network_client.path_preview_received.connect(_on_path_preview_received)
	network_client.why_panel_received.connect(_on_why_panel_received)
	network_client.turn_started.connect(_on_turn_started)
	network_client.game_ended.connect(_on_game_ended)

	# Connect game end screen signals
	game_end_screen.return_to_menu.connect(_on_end_screen_return_to_menu)
	game_end_screen.play_again.connect(_on_end_screen_play_again)


func start_game(host: String, port: int, player_id: int, player_name: String) -> void:
	server_host = host
	server_port = port
	my_player_id = player_id
	network_client.connect_to_server(host, port, player_name)
	hud.add_message("Connecting to server...")


func _on_network_connected() -> void:
	hud.add_message("Connected to game server")
	# Request initial game state
	network_client.request_snapshot()


func _on_network_disconnected() -> void:
	hud.add_message("Disconnected from server")


func _on_network_error(message: String) -> void:
	hud.add_message("Error: " + message)


func _on_turn_started(active_player: int, turn: int, time_ms: int) -> void:
	current_turn_timer_ms = time_ms
	hud.set_turn_info(turn, active_player, my_player_id, time_ms)
	if active_player == my_player_id:
		hud.add_message("Your turn!")
		AudioManager.play("turn_start")

func _on_state_delta_received(_turn: int, deltas: Array, _checksum: int) -> void:
	# Apply authoritative visibility events immediately (fog-of-war lens).
	map_view.apply_state_deltas(deltas)

	var apply = _apply_state_deltas_to_snapshot(deltas)
	if not bool(apply.get("ok", false)):
		network_client.request_snapshot()
		return
	if bool(apply.get("changed", false)):
		_refresh_from_current_snapshot()


func _on_desync_detected(turn: int, expected_checksum: int, received_checksum: int) -> void:
	hud.add_message("Desync detected on turn %d (expected %x, got %x)" % [turn, expected_checksum, received_checksum])
	network_client.request_snapshot()

func _on_share_replay_pressed() -> void:
	hud.add_message("Requesting replay…")
	network_client.request_replay()


func _process(_delta: float) -> void:
	# Update minimap viewport bounds
	if map_view.map_width > 0:
		var bounds := map_view.get_visible_hex_bounds()
		hud.update_minimap_viewport(bounds)
	_maybe_refresh_context_panel()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		var key := event as InputEventKey
		if key.keycode == KEY_P:
			hud.add_message("Requesting replay…")
			network_client.request_replay()


func _on_game_snapshot(snapshot: Dictionary) -> void:
	current_snapshot = snapshot

	_refresh_from_current_snapshot(true)


func _refresh_from_current_snapshot(full_resync: bool = false) -> void:
	if current_snapshot.is_empty():
		return

	var snapshot := current_snapshot

	# Update map view
	map_view.set_my_player_id(my_player_id)
	map_view.load_snapshot(snapshot, full_resync)

	# Update minimap
	hud.update_minimap(snapshot, my_player_id)

	# Update HUD with turn info
	var turn = int(snapshot.get("turn", 1))
	var current_player = _extract_player_id(snapshot.get("current_player", 0))
	var timer_ms := current_turn_timer_ms
	if snapshot.has("turn_timer_ms"):
		var t = int(snapshot.get("turn_timer_ms", 0))
		if t > 0:
			timer_ms = t
	hud.set_turn_info(turn, current_player, my_player_id, timer_ms)

	# Update player resources
	var players: Array = []
	var raw_players = snapshot.get("players", [])
	if typeof(raw_players) == TYPE_ARRAY:
		players = raw_players
	var my_player_data: Dictionary = {}
	for p in players:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		if _extract_player_id(p.get("id", -1)) == my_player_id:
			my_player_data = p
			break

	if not my_player_data.is_empty():
		var gold = int(my_player_data.get("gold", 0))
		var research: Dictionary = {}
		var raw_research = my_player_data.get("research", {})
		if typeof(raw_research) == TYPE_DICTIONARY:
			research = raw_research
		var research_name := ""
		var research_progress := 0
		var research_total := 0
		var researching_id := -1

		if typeof(research) == TYPE_DICTIONARY and not research.is_empty():
			researching_id = _extract_type_id(research.get("tech", 0))
			research_progress = int(research.get("progress", 0))
			research_total = int(research.get("required", 100))
			research_name = research_panel.tech_name(researching_id) if researching_id >= 0 else ""

		hud.set_player_resources(gold, research_name, research_progress, research_total)

		# Update research panel
		var known_techs: Array = my_player_data.get("known_techs", [])
		research_panel.update_state(known_techs, researching_id, research_progress, research_total)

	# Re-select current unit if still valid
	if selected_unit_id >= 0:
		var unit := _find_unit_by_id(selected_unit_id)
		if unit.is_empty():
			selected_unit_id = -1
			hud.hide_unit_panel()
		else:
			_update_unit_selection(unit)

	# Refresh city panel UI if open.
	if not _is_game_over and not hud.selected_city.is_empty():
		var city_id = _extract_entity_id(hud.selected_city.get("id", -1))
		if city_id >= 0:
			network_client.query_city_ui(city_id)
			network_client.query_production_options(city_id)

	# Chronicle timeline (always visible; scrub unlocked post-game).
	var chronicle = snapshot.get("chronicle", [])
	if typeof(chronicle) == TYPE_ARRAY and hud.has_method("set_chronicle_entries"):
		hud.set_chronicle_entries(chronicle, _city_name_lookup(), _player_name_lookup(), _is_game_over)

	# Check for new chronicle events (battles, etc.)
	if not _is_game_over:
		_process_chronicle_events(snapshot)

	# Check for game over
	var winner = snapshot.get("winner", null)
	if winner != null:
		var winner_id := _extract_player_id(winner)
		hud.add_message("Game Over! Player %d wins!" % winner_id)
		game_over.emit(winner_id)


func _on_unit_selected(unit_id: int) -> void:
	selected_unit_id = unit_id
	var unit := _find_unit_by_id(unit_id)
	if not unit.is_empty():
		_update_unit_selection(unit)
		AudioManager.play("unit_select")


func _update_unit_selection(unit: Dictionary) -> void:
	hud.show_unit_panel(unit)

	# Calculate and show movement range
	var owner_id = _extract_player_id(unit.get("owner", 0))
	if owner_id == my_player_id:
		var pos = _extract_hex_pos(unit.get("pos", {}))
		var moves = int(unit.get("moves_left", 0))
		if moves > 0:
			var reachable := _calculate_movement_range(pos, moves)
			map_view.set_movement_range(reachable)
		else:
			map_view.set_movement_range([])
	else:
		map_view.set_movement_range([])


func _on_tile_clicked(hex_pos: Vector2i) -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return
	# If we have a selected unit and it's our turn, try to move
	if selected_unit_id >= 0:
		var unit := _find_unit_by_id(selected_unit_id)
		if unit.is_empty():
			return

		var owner_id = _extract_player_id(unit.get("owner", 0))
		if owner_id != my_player_id:
			hud.add_message("Not your unit")
			return

		var current_player = _extract_player_id(current_snapshot.get("current_player", 0))
		if current_player != my_player_id:
			hud.add_message("Not your turn")
			return

		# Request move
		network_client.send_move(selected_unit_id, hex_pos.x, hex_pos.y)


func _on_unit_action_requested(unit_id: int, action: String, target: Variant) -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return
	var hex_target := Vector2i(-999, -999)
	if typeof(target) == TYPE_VECTOR2I:
		hex_target = target
	elif typeof(target) == TYPE_DICTIONARY:
		hex_target = Vector2i(int(target.get("q", 0)), int(target.get("r", 0)))

	match action:
		"move":
			network_client.send_move(unit_id, hex_target.x, hex_target.y)
		"attack":
			# Find unit at target position
			var target_unit := _find_unit_at(hex_target)
			if not target_unit.is_empty():
				var target_id = _extract_entity_id(target_unit.get("id", 0))
				network_client.send_attack(unit_id, target_id)
		"path_preview":
			# Only preview for our own units (server enforces too).
			var unit := _find_unit_by_id(unit_id)
			if unit.is_empty():
				return
			if _extract_player_id(unit.get("owner", 0)) != my_player_id:
				return
			network_client.query_path_preview(unit_id, hex_target)
		"goto":
			var unit := _find_unit_by_id(unit_id)
			if unit.is_empty():
				return
			if _extract_player_id(unit.get("owner", 0)) != my_player_id:
				hud.add_message("Not your unit")
				return
			var current_player = _extract_player_id(current_snapshot.get("current_player", 0))
			if current_player != my_player_id:
				hud.add_message("Not your turn")
				return

			# If we already have a matching preview cached, use it immediately.
			if unit_id == _last_path_preview_unit_id and hex_target == _last_path_preview_dest:
				var cached_path = _last_path_preview.get("full_path", [])
				if typeof(cached_path) == TYPE_ARRAY and not cached_path.is_empty():
					network_client.send_goto_orders(unit_id, cached_path)
					return

			_pending_goto_unit_id = unit_id
			_pending_goto_dest = hex_target
			network_client.query_path_preview(unit_id, hex_target)
		"cancel_orders":
			var unit := _find_unit_by_id(unit_id)
			if unit.is_empty():
				return
			if _extract_player_id(unit.get("owner", 0)) != my_player_id:
				return
			network_client.cancel_orders(unit_id)


func _on_city_action_requested(city_id: int, action: String) -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return
	match action:
		"select":
			selected_unit_id = -1
			network_client.query_city_ui(city_id)
			network_client.query_production_options(city_id)

func _on_city_ui_received(city_ui: Dictionary) -> void:
	var city_id = _extract_entity_id(city_ui.get("id", -1))
	if city_id < 0:
		return
	_city_ui_by_id[city_id] = city_ui
	_maybe_show_city_panel(city_id)
	_maybe_open_production_picker(city_id)


func _on_production_options_received(city_id: int, options: Array) -> void:
	var converted: Array = []
	for opt in options:
		if typeof(opt) != TYPE_DICTIONARY:
			continue
		var o: Dictionary = opt
		var item = o.get("item", null)
		if typeof(item) != TYPE_DICTIONARY:
			continue
		var item_dict: Dictionary = item
		var keys: Array = item_dict.keys()
		if keys.is_empty():
			continue
		var kind := String(keys[0])
		var item_id = _extract_type_id(item_dict.get(kind, -1))
		if item_id < 0:
			continue

		var item_type := kind.to_lower()
		var name = "Unknown"
		var cost = 0

		# Drive display from rules (server may still gate availability).
		if item_type == "unit":
			var rules = _unit_rules_by_id.get(item_id, {})
			if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
				name = String(rules.get("name", "Unit %d" % item_id))
				cost = int(rules.get("cost", 0))
			else:
				name = "Unit %d" % item_id
		elif item_type == "building":
			var rules = _building_rules_by_id.get(item_id, {})
			if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
				name = String(rules.get("name", "Building %d" % item_id))
				cost = int(rules.get("cost", 0))
			else:
				name = "Building %d" % item_id

		converted.append({
			"name": name,
			"cost": cost,
			"type": item_type,
			"id": item_id,
		})
	_prod_options_by_city_id[city_id] = converted
	_maybe_show_city_panel(city_id)
	_maybe_open_production_picker(city_id)


func _on_path_preview_received(unit_id: int, destination: Vector2i, preview: Dictionary) -> void:
	_last_path_preview_unit_id = unit_id
	_last_path_preview_dest = destination
	_last_path_preview = preview

	# Update the map overlay (only if it still matches selection).
	if unit_id != selected_unit_id:
		return

	var full_path = preview.get("full_path", [])
	var this_turn_path = preview.get("this_turn_path", [])
	var stop_at_data = preview.get("stop_at", {})
	var stop_at := Vector2i(-999, -999)
	if typeof(stop_at_data) == TYPE_DICTIONARY:
		stop_at = Vector2i(int(stop_at_data.get("q", 0)), int(stop_at_data.get("r", 0)))

	map_view.set_path_preview(full_path, this_turn_path, stop_at)

	# If this response is for a pending goto, issue orders.
	if _pending_goto_unit_id == unit_id and _pending_goto_dest == destination:
		_pending_goto_unit_id = -1
		_pending_goto_dest = Vector2i(-999, -999)
		if typeof(full_path) == TYPE_ARRAY and not full_path.is_empty():
			network_client.send_goto_orders(unit_id, full_path)
		else:
			hud.add_message("No valid path")


func _on_replay_received(replay_json: String) -> void:
	if replay_json.is_empty():
		hud.add_message("Replay export failed")
		return
	_replay_json_cache = replay_json
	DisplayServer.clipboard_set(replay_json)
	hud.add_message("Replay copied to clipboard (%d chars)" % replay_json.length())
	if _pending_replay_jump_turn >= 0 and _is_game_over:
		var turn := _pending_replay_jump_turn
		_pending_replay_jump_turn = -1
		_jump_to_replay_turn(turn)

func _on_replay_denied(message: String) -> void:
	if message.is_empty():
		hud.add_message("Replay denied")
	else:
		hud.add_message(message)
	_pending_replay_jump_turn = -1


func _on_timeline_turn_selected(turn: int) -> void:
	if not _is_game_over:
		hud.add_message("Timeline scrub locked until game over")
		return

	if _replay_json_cache == "":
		_pending_replay_jump_turn = turn
		hud.add_message("Loading replay…")
		network_client.request_replay()
		return

	_jump_to_replay_turn(turn)


func _jump_to_replay_turn(turn: int) -> void:
	if _replay_json_cache == "":
		return

	if _replay_client == null:
		_replay_client = GameClient.new()
		add_child(_replay_client)

	if not _replay_loaded:
		_replay_client.import_replay_json(_replay_json_cache)
		_replay_loaded = true

	_replay_client.replay_to_turn(turn)
	current_snapshot = _replay_client.snapshot
	_refresh_from_current_snapshot(true)
	hud.add_message("Replay: Turn %d" % turn)


func _maybe_show_city_panel(city_id: int) -> void:
	if not _city_ui_by_id.has(city_id):
		return
	if not _prod_options_by_city_id.has(city_id):
		return

	# Only auto-open for currently selected city.
	if map_view.get_selected_city_id() != city_id:
		return

	var city_ui: Dictionary = _city_ui_by_id[city_id]
	var options: Array = _prod_options_by_city_id[city_id]
	hud.show_city_panel(city_ui, options)


func _open_city_production_picker(city_id: int) -> void:
	_pending_production_picker_city_id = city_id

	if not _city_ui_by_id.has(city_id):
		network_client.query_city_ui(city_id)
	if not _prod_options_by_city_id.has(city_id):
		network_client.query_production_options(city_id)

	_maybe_open_production_picker(city_id)


func _maybe_open_production_picker(city_id: int) -> void:
	if _pending_production_picker_city_id != city_id:
		return
	if not _city_ui_by_id.has(city_id):
		return
	if not _prod_options_by_city_id.has(city_id):
		return

	var city_ui: Dictionary = _city_ui_by_id[city_id]
	var options: Array = _prod_options_by_city_id[city_id]
	city_production_panel.open_for_city(city_ui, options)
	_pending_production_picker_city_id = -1


func _on_end_turn_pressed() -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return
	if _gate_end_turn_if_action_required():
		return
	network_client.send_end_turn()
	hud.add_message("Ending turn...")
	AudioManager.play("turn_end")


func _on_menu_pressed() -> void:
	# TODO: Show pause menu
	return_to_lobby.emit()


func _on_city_panel_closed() -> void:
	pass


func _gate_end_turn_if_action_required() -> bool:
	# Gate end turn if the player must pick research or production.
	var current_player = _extract_player_id(current_snapshot.get("current_player", 0))
	if current_player != my_player_id:
		return false

	var my_player_data := _my_player_snapshot()
	if not my_player_data.is_empty():
		if my_player_data.get("researching", null) == null:
			var has_unresearched := true
			var known = my_player_data.get("known_techs", [])
			var techs = rules_catalog.get("techs", [])
			if typeof(known) == TYPE_ARRAY and typeof(techs) == TYPE_ARRAY:
				has_unresearched = known.size() < techs.size()

			if has_unresearched:
				hud.add_message("Pick a technology before ending turn")
				_on_research_button_pressed()
				return true

	var cities = current_snapshot.get("cities", [])
	if typeof(cities) == TYPE_ARRAY:
		for c in cities:
			if typeof(c) != TYPE_DICTIONARY:
				continue
			var cd: Dictionary = c
			if _extract_player_id(cd.get("owner", -1)) != my_player_id:
				continue
			if cd.get("producing", null) == null:
				var city_id = _extract_entity_id(cd.get("id", -1))
				hud.add_message("Pick production for %s" % String(cd.get("name", "City")))
				if city_id >= 0:
					_open_city_production_picker(city_id)
				return true

	return false


func _on_found_city_requested() -> void:
	if selected_unit_id < 0:
		return

	var unit := _find_unit_by_id(selected_unit_id)
	if unit.is_empty():
		return

	# If we know the settler id from rules, validate it locally; otherwise let the server validate.
	if _settler_type_id >= 0:
		var type_id = _extract_type_id(unit.get("type_id", -1))
		if type_id != _settler_type_id:
			hud.add_message("Only settlers can found cities")
			return

	# Store unit ID and show dialog
	pending_found_city_unit_id = selected_unit_id
	city_dialog.open()


func _on_city_name_confirmed(city_name: String) -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return
	if pending_found_city_unit_id < 0:
		return

	var unit := _find_unit_by_id(pending_found_city_unit_id)
	if unit.is_empty():
		hud.add_message("Unit no longer exists")
		pending_found_city_unit_id = -1
		return

	var pos = _extract_hex_pos(unit.get("pos", {}))
	network_client.send_found_city(pending_found_city_unit_id, city_name, pos.x, pos.y)
	hud.add_message("Founding city: " + city_name)
	pending_found_city_unit_id = -1


func _on_city_dialog_cancelled() -> void:
	pending_found_city_unit_id = -1


func _on_production_selected(item_type: String, item_id: int) -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return
	# Get currently displayed city
	var city := hud.selected_city
	if city.is_empty():
		return

	var city_id = _extract_entity_id(city.get("id", 0))
	network_client.send_build(city_id, item_type, item_id)
	hud.add_message("Started production")


func _on_research_button_pressed() -> void:
	if not rules_catalog.is_empty():
		research_panel.set_catalog(rules_catalog)
	research_panel.open()


func _on_research_selected(tech_id: int) -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return
	network_client.send_research(tech_id)
	hud.add_message("Started researching: " + research_panel.tech_name(tech_id))
	research_panel.visible = false


func _on_research_panel_closed() -> void:
	pass  # Could restore focus to map view if needed


func _on_diplomacy_button_pressed() -> void:
	diplomacy_panel.update_from_snapshot(current_snapshot, my_player_id)
	diplomacy_panel.open()


func _on_declare_war(target_player: int) -> void:
	# Send war declaration to server
	# For now, just add a message (server integration would go here)
	hud.add_message("Declared war on Player %d!" % (target_player + 1))
	AudioManager.play("ui_click")
	# network_client.send_declare_war(target_player)


func _on_propose_peace(target_player: int) -> void:
	# Send peace proposal to server
	hud.add_message("Proposed peace to Player %d" % (target_player + 1))
	AudioManager.play("ui_click")
	# network_client.send_propose_peace(target_player)


func _on_diplomacy_panel_closed() -> void:
	pass


func _on_production_queued(item_type: String, item_id: int) -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return
	# Queue production item at the currently selected city
	var city_id := city_production_panel.city_id
	if city_id >= 0:
		# For now, just use the existing send_build which sets production
		# Server would need queue support to handle multiple items
		network_client.send_build(city_id, item_type, item_id)
		hud.add_message("Started production")
		city_production_panel.visible = false


func _on_production_removed(_queue_index: int) -> void:
	# Remove item from production queue
	var city_id := city_production_panel.city_id
	if city_id >= 0:
		hud.add_message("Removed item from queue")
		# Server integration would go here:
		# network_client.send_remove_production(city_id, queue_index)


func _on_production_moved(_from_index: int, _to_index: int) -> void:
	# Move item in production queue
	var city_id := city_production_panel.city_id
	if city_id >= 0:
		hud.add_message("Moved item in queue")
		# Server integration would go here:
		# network_client.send_move_production(city_id, from_index, to_index)


func _on_city_production_panel_closed() -> void:
	pass


func _on_minimap_clicked(hex: Vector2i) -> void:
	map_view.center_on_hex(hex)

func _on_context_attack_pressed(attacker_id: int, defender_id: int) -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return
	if attacker_id < 0 or defender_id < 0:
		return
	network_client.send_attack(attacker_id, defender_id)


func _on_context_why_pressed(kind: String, attacker_id: int, defender_id: int) -> void:
	match kind:
		"Combat":
			if attacker_id >= 0 and defender_id >= 0:
				network_client.query_combat_why(attacker_id, defender_id)
		"CityMaintenance":
			if attacker_id >= 0:
				network_client.query_city_maintenance_why(attacker_id)
		_:
			pass


func _on_worker_automation_toggled(unit_id: int, enabled: bool) -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return
	var current_player = _extract_player_id(current_snapshot.get("current_player", 0))
	if current_player != my_player_id:
		hud.add_message("Not your turn")
		return
	network_client.set_worker_automation(unit_id, enabled)

func _on_fortify_requested(unit_id: int) -> void:
	if _is_game_over:
		hud.add_message("Game over: replay only")
		return

	var current_player = _extract_player_id(current_snapshot.get("current_player", 0))
	if current_player != my_player_id:
		hud.add_message("Not your turn")
		return

	var unit := _find_unit_by_id(unit_id)
	if unit.is_empty():
		return
	if _extract_player_id(unit.get("owner", -1)) != my_player_id:
		hud.add_message("Not your unit")
		return

	network_client.send_fortify(unit_id)
	hud.add_message("Fortify queued")


func _on_combat_preview_received(attacker_id: int, defender_id: int, preview) -> void:
	if _context_kind != "Combat":
		return
	if attacker_id != _context_attacker_id or defender_id != _context_defender_id:
		return

	if typeof(preview) != TYPE_DICTIONARY:
		hud.set_combat_context(attacker_id, defender_id, "Combat preview unavailable")
		return

	hud.set_combat_context(attacker_id, defender_id, _format_combat_context(attacker_id, defender_id, preview))


func _on_why_panel_received(kind: String, panel) -> void:
	if typeof(panel) != TYPE_DICTIONARY:
		return
	var d: Dictionary = panel
	match kind:
		"Combat", "CityMaintenance", "Maintenance":
			hud.show_why_panel(d)
		_:
			pass


func _maybe_refresh_context_panel() -> void:
	if current_snapshot.is_empty():
		hud.clear_context()
		return

	var hover := map_view.get_hovered_hex()
	if hover == _context_last_hover and selected_unit_id == _context_last_selected_unit_id:
		return

	_context_last_hover = hover
	_context_last_selected_unit_id = selected_unit_id

	if _tile_index(hover) < 0:
		_context_kind = ""
		_context_attacker_id = -1
		_context_defender_id = -1
		hud.clear_context()
		return

	# Combat context: hover an adjacent enemy while you have a unit selected (your turn).
	var current_player = _extract_player_id(current_snapshot.get("current_player", 0))
	if current_player == my_player_id and selected_unit_id >= 0:
		var attacker := _find_unit_by_id(selected_unit_id)
		if not attacker.is_empty() and _extract_player_id(attacker.get("owner", -1)) == my_player_id:
			var defender := _find_unit_at(hover)
			if not defender.is_empty() and _extract_player_id(defender.get("owner", -1)) != my_player_id:
				var attacker_pos = _extract_hex_pos(attacker.get("pos", {}))
				if _is_neighbor(attacker_pos, hover):
					var defender_id = _extract_entity_id(defender.get("id", -1))
					if defender_id >= 0:
						_context_kind = "Combat"
						_context_attacker_id = selected_unit_id
						_context_defender_id = defender_id
						hud.set_combat_context(selected_unit_id, defender_id, "Combat preview…")
						network_client.query_combat_preview(selected_unit_id, defender_id)
						return

	# City context: hover a friendly city.
	var city := _find_city_at(hover)
	if not city.is_empty() and _extract_player_id(city.get("owner", -1)) == my_player_id:
		var city_id = _extract_entity_id(city.get("id", -1))
		if city_id >= 0:
			_context_kind = "CityMaintenance"
			_context_attacker_id = city_id
			_context_defender_id = -1
			hud.set_city_context(city_id, "City upkeep: %s\nClick Why for a breakdown." % String(city.get("name", "City")))
			return

	_context_kind = ""
	_context_attacker_id = -1
	_context_defender_id = -1
	hud.clear_context()


func _format_combat_context(attacker_id: int, defender_id: int, preview: Dictionary) -> String:
	var attacker: Dictionary = _find_unit_by_id(attacker_id)
	var defender: Dictionary = _find_unit_by_id(defender_id)

	var a_type = _extract_type_id(attacker.get("type_id", -1))
	var d_type = _extract_type_id(defender.get("type_id", -1))

	var a_name := _unit_type_name(a_type)
	var d_name := _unit_type_name(d_type)

	var win = int(preview.get("attacker_win_pct", 0))
	var a_exp = int(preview.get("attacker_hp_expected", 0))
	var d_exp = int(preview.get("defender_hp_expected", 0))
	var a_hp = int(attacker.get("hp", 0))
	var d_hp = int(defender.get("hp", 0))

	return "A: %s (HP %d) vs D: %s (HP %d)\nWin: %d%%  Expected HP: A%d / D%d" % [a_name, a_hp, d_name, d_hp, win, a_exp, d_exp]


func _unit_type_name(type_id: int) -> String:
	var names = rules_names.get("unit_types", [])
	if typeof(names) == TYPE_ARRAY and type_id >= 0 and type_id < names.size():
		return String(names[type_id])
	return "Unit %d" % type_id

func _on_rules_names_received(names: Dictionary) -> void:
	rules_names = names
	if hud.has_method("set_rules_names"):
		hud.set_rules_names(names)
	if map_view.has_method("set_unit_type_names"):
		var unit_types = names.get("unit_types", [])
		map_view.set_unit_type_names(unit_types if typeof(unit_types) == TYPE_ARRAY else [])
	if map_view.has_method("set_improvement_names"):
		var impr_names = names.get("improvements", [])
		map_view.set_improvement_names(impr_names if typeof(impr_names) == TYPE_ARRAY else [])


func _on_rules_catalog_received(catalog: Dictionary) -> void:
	rules_catalog = catalog
	_rebuild_rules_indexes()
	if hud.has_method("set_rules_catalog"):
		hud.set_rules_catalog(catalog)
	if research_panel.has_method("set_catalog"):
		research_panel.set_catalog(catalog)

func _on_promise_strip_received(promises: Array) -> void:
	# Enrich with city names for HUD rendering.
	var city_names := _city_name_lookup()
	var enriched: Array = []
	for p in promises:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var d: Dictionary = (p as Dictionary).duplicate(true)
		var t = String(d.get("type", ""))
		match t:
			"CityGrowth", "CityProduction", "CityProductionPickRequired", "BorderExpansion":
				var city_id = _extract_entity_id(d.get("city", -1))
				if city_names.has(city_id):
					d["city_name"] = String(city_names[city_id])
			_:
				pass
		enriched.append(d)
	hud.set_promises(enriched)

func _on_promise_selected(promise: Dictionary) -> void:
	var t = String(promise.get("type", ""))
	match t:
		"TechPickRequired", "ResearchComplete":
			_on_research_button_pressed()
		"CityProductionPickRequired", "CityProduction":
			var city_id = _extract_entity_id(promise.get("city", -1))
			if city_id >= 0:
				_open_city_production_picker(city_id)
		"IdleWorker":
			_apply_idle_worker_recommendation(promise)
		_:
			pass

func _apply_idle_worker_recommendation(promise: Dictionary) -> void:
	var current_player = _extract_player_id(current_snapshot.get("current_player", 0))
	if current_player != my_player_id:
		hud.add_message("Not your turn")
		return

	var unit_id = int(promise.get("unit", -1))
	if unit_id < 0:
		return

	var rec = promise.get("recommendation", null)
	if rec == null:
		hud.add_message("No recommendation available")
		return
	if typeof(rec) != TYPE_DICTIONARY:
		hud.add_message("Invalid recommendation")
		return

	var rd: Dictionary = rec
	var kind = String(rd.get("type", ""))
	match kind:
		"Build":
			var impr_id = int(rd.get("improvement", -1))
			if impr_id < 0:
				hud.add_message("Invalid improvement")
				return
			network_client.set_build_improvement_orders(unit_id, impr_id)
			hud.add_message("Worker: build improvement queued")
		"Repair":
			network_client.set_repair_improvement_orders(unit_id)
			hud.add_message("Worker: repair queued")
		_:
			hud.add_message("Unknown recommendation: " + kind)


func _rebuild_rules_indexes() -> void:
	_unit_rules_by_id.clear()
	_building_rules_by_id.clear()
	_tech_rules_by_id.clear()
	_improvement_rules_by_id.clear()
	_settler_type_id = -1

	var unit_types = rules_catalog.get("unit_types", [])
	if typeof(unit_types) == TYPE_ARRAY:
		for u in unit_types:
			if typeof(u) != TYPE_DICTIONARY:
				continue
			var ud: Dictionary = u
			var id = int(ud.get("id", -1))
			if id < 0:
				continue
			_unit_rules_by_id[id] = ud
			if _settler_type_id < 0 and bool(ud.get("can_found_city", false)):
				_settler_type_id = id

	var buildings = rules_catalog.get("buildings", [])
	if typeof(buildings) == TYPE_ARRAY:
		for b in buildings:
			if typeof(b) != TYPE_DICTIONARY:
				continue
			var bd: Dictionary = b
			var id = int(bd.get("id", -1))
			if id >= 0:
				_building_rules_by_id[id] = bd

	var techs = rules_catalog.get("techs", [])
	if typeof(techs) == TYPE_ARRAY:
		for t in techs:
			if typeof(t) != TYPE_DICTIONARY:
				continue
			var td: Dictionary = t
			var id = int(td.get("id", -1))
			if id >= 0:
				_tech_rules_by_id[id] = td

	var improvements = rules_catalog.get("improvements", [])
	if typeof(improvements) == TYPE_ARRAY:
		for i in improvements:
			if typeof(i) != TYPE_DICTIONARY:
				continue
			var id: int = int(i.get("id", -1))
			if id >= 0:
				_improvement_rules_by_id[id] = i


func _city_name_lookup() -> Dictionary:
	var out: Dictionary = {}
	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return out
	for c in cities:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cd: Dictionary = c
		var city_id = _extract_entity_id(cd.get("id", -1))
		if city_id >= 0:
			out[city_id] = String(cd.get("name", "City"))
	return out


func _player_name_lookup() -> Dictionary:
	var out: Dictionary = {}
	var players = current_snapshot.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return out
	for p in players:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var pd: Dictionary = p
		var pid := _extract_player_id(pd.get("id", -1))
		if pid >= 0:
			out[pid] = String(pd.get("name", "P%d" % pid))
	return out


func _my_player_snapshot() -> Dictionary:
	var players = current_snapshot.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return {}
	for p in players:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var pd: Dictionary = p
		if _extract_player_id(pd.get("id", -1)) == my_player_id:
			return pd
	return {}


func _apply_state_deltas_to_snapshot(deltas: Array) -> Dictionary:
	var out := {"ok": true, "changed": false}
	if current_snapshot.is_empty():
		out["ok"] = false
		return out

	var changed := false
	for raw in deltas:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var e: Dictionary = raw
		var t = String(e.get("type", ""))

		match t:
			"TileRevealed":
				if not _apply_tile_revealed(e):
					out["ok"] = false
					break
				changed = true
			"TileHidden":
				# Snapshot doesn't encode fog-of-war; MapView tracks visibility separately.
				continue
			"TileSpotted":
				if not _apply_tile_spotted(e):
					out["ok"] = false
					break
				changed = true

			# Game flow
			"TurnStarted":
				current_snapshot["turn"] = int(e.get("turn", current_snapshot.get("turn", 1)))
				current_snapshot["current_player"] = int(e.get("player", current_snapshot.get("current_player", 0)))
				changed = true
			"TurnEnded", "GameEnded":
				continue

			# Chronicle (used for HUD/event feedback)
			"ChronicleEntryAdded":
				var chronicle = current_snapshot.get("chronicle", [])
				if typeof(chronicle) != TYPE_ARRAY:
					chronicle = []
				chronicle.append(e.get("entry", {}))
				current_snapshot["chronicle"] = chronicle
				changed = true

			# Units
			"UnitMoved":
				if not _apply_unit_moved(e):
					out["ok"] = false
					break
				changed = true
			"UnitUpdated":
				if not _apply_unit_updated(e):
					out["ok"] = false
					break
				changed = true
			"UnitDamaged":
				if not _apply_unit_damaged(e):
					out["ok"] = false
					break
				changed = true
			"UnitPromoted":
				if not _apply_unit_promoted(e):
					out["ok"] = false
					break
				changed = true
			"UnitDied":
				if not _apply_unit_died(e):
					out["ok"] = false
					break
				changed = true
			"UnitCreated":
				if not _apply_unit_created(e):
					out["ok"] = false
					break
				changed = true
			"UnitSpotted":
				if not _apply_unit_spotted(e):
					out["ok"] = false
					break
				changed = true
			"UnitHidden":
				if not _apply_unit_hidden(e):
					out["ok"] = false
					break
				changed = true
			"MovementStopped":
				if not _apply_movement_stopped(e):
					out["ok"] = false
					break
				changed = true
			"OrdersCompleted", "OrdersInterrupted":
				if not _apply_orders_cleared(e):
					out["ok"] = false
					break
				changed = true

			# Cities
			"CityFounded":
				if not _apply_city_founded(e):
					out["ok"] = false
					break
				changed = true
			"CitySpotted":
				if not _apply_city_spotted(e):
					out["ok"] = false
					break
				changed = true
			"CityHidden":
				if not _apply_city_hidden(e):
					out["ok"] = false
					break
				changed = true
			"BordersExpanded":
				if not _apply_borders_expanded(e):
					out["ok"] = false
					break
				changed = true
			"CityGrew":
				if not _apply_city_grew(e):
					out["ok"] = false
					break
				changed = true
			"CityConquered":
				if not _apply_city_conquered(e):
					out["ok"] = false
					break
				changed = true
			"CityProduced":
				if not _apply_city_produced(e):
					out["ok"] = false
					break
				changed = true
			"CityProductionSet":
				if not _apply_city_production_set(e):
					out["ok"] = false
					break
				changed = true

			# Improvements
			"ImprovementBuilt", "ImprovementMatured", "ImprovementPillaged", "ImprovementRepaired":
				if not _apply_improvement_event(e):
					out["ok"] = false
					break
				changed = true

			# Trade routes
			"TradeRouteEstablished":
				if not _apply_trade_route_established(e):
					out["ok"] = false
					break
				changed = true
			"TradeRoutePillaged":
				if not _apply_trade_route_pillaged(e):
					out["ok"] = false
					break
				changed = true

			# Economy
			"SupplyUpdated":
				if not _apply_supply_updated(e):
					out["ok"] = false
					break
				changed = true

			# Combat events are informational; snapshot changes come from UnitDamaged/UnitDied.
			"CombatStarted", "CombatRound", "CombatEnded":
				continue

			# Research/Civics
			"ResearchProgress":
				if not _apply_research_progress(e):
					out["ok"] = false
					break
				changed = true
			"TechResearched":
				if not _apply_tech_researched(e):
					out["ok"] = false
					break
				changed = true
			"PolicyAdopted":
				if not _apply_policy_adopted(e):
					out["ok"] = false
					break
				changed = true
			"GovernmentReformed":
				if not _apply_government_reformed(e):
					out["ok"] = false
					break
				changed = true

			# Diplomacy events aren't part of Snapshot yet.
			"WarDeclared", "PeaceDeclared", "RelationChanged":
				continue

			_:
				out["ok"] = false
				break

	out["changed"] = changed
	return out


func _apply_unit_moved(e: Dictionary) -> bool:
	var unit_id = int(e.get("unit", -1))
	if unit_id < 0:
		return false

	var path = e.get("path", [])
	if typeof(path) != TYPE_ARRAY or path.is_empty():
		return false

	var last = path[path.size() - 1]
	if typeof(last) != TYPE_DICTIONARY:
		return false

	var new_pos := _extract_hex_pos(last)
	var moves_left = int(e.get("moves_left", 0))

	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return false

	for i in range(units.size()):
		var u = units[i]
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = u
		if _extract_entity_id(ud.get("id", -1)) != unit_id:
			continue
		ud["pos"] = {"q": new_pos.x, "r": new_pos.y}
		ud["moves_left"] = moves_left
		ud["orders"] = null
		units[i] = ud
		current_snapshot["units"] = units
		return true

	return false


func _apply_movement_stopped(e: Dictionary) -> bool:
	var unit_id = int(e.get("unit", -1))
	if unit_id < 0:
		return false
	var at_data = e.get("at", {})
	if typeof(at_data) != TYPE_DICTIONARY:
		return false
	var at := _extract_hex_pos(at_data)

	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return false
	for i in range(units.size()):
		var u = units[i]
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = u
		if _extract_entity_id(ud.get("id", -1)) != unit_id:
			continue
		ud["pos"] = {"q": at.x, "r": at.y}
		units[i] = ud
		current_snapshot["units"] = units
		return true
	return false


func _apply_orders_cleared(e: Dictionary) -> bool:
	var unit_id = int(e.get("unit", -1))
	if unit_id < 0:
		return false
	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return false
	for i in range(units.size()):
		var u = units[i]
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = u
		if _extract_entity_id(ud.get("id", -1)) != unit_id:
			continue
		ud["orders"] = null
		units[i] = ud
		current_snapshot["units"] = units
		return true
	return false


func _apply_unit_damaged(e: Dictionary) -> bool:
	var unit_id = int(e.get("unit", -1))
	if unit_id < 0:
		return false
	var new_hp = int(e.get("new_hp", -1))
	if new_hp < 0:
		return false

	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return false
	for i in range(units.size()):
		var u = units[i]
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = u
		if _extract_entity_id(ud.get("id", -1)) != unit_id:
			continue
		ud["hp"] = new_hp
		units[i] = ud
		current_snapshot["units"] = units
		return true
	return false


func _apply_unit_promoted(e: Dictionary) -> bool:
	var unit_id = int(e.get("unit", -1))
	if unit_id < 0:
		return false
	var level = int(e.get("new_level", 0))

	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return false
	for i in range(units.size()):
		var u = units[i]
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = u
		if _extract_entity_id(ud.get("id", -1)) != unit_id:
			continue
		ud["veteran_level"] = level
		units[i] = ud
		current_snapshot["units"] = units
		return true
	return false


func _apply_unit_died(e: Dictionary) -> bool:
	var unit_id = int(e.get("unit", -1))
	if unit_id < 0:
		return false

	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return false
	for i in range(units.size()):
		var u = units[i]
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = u
		if _extract_entity_id(ud.get("id", -1)) != unit_id:
			continue
		units.remove_at(i)
		current_snapshot["units"] = units
		return true
	return false


func _apply_unit_created(e: Dictionary) -> bool:
	var unit_id = int(e.get("unit", -1))
	if unit_id < 0:
		return false

	var type_id = int(e.get("type_id", -1))
	var owner = int(e.get("owner", -1))
	var pos_data = e.get("pos", {})
	if typeof(pos_data) != TYPE_DICTIONARY:
		return false
	var pos := _extract_hex_pos(pos_data)

	var max_hp := 100
	if _unit_rules_by_id.has(type_id):
		var ud: Dictionary = _unit_rules_by_id[type_id]
		max_hp = int(ud.get("hp", max_hp))

	# Units created mid-turn (production) start with 0 moves.
	var moves_left := 0

	var unit_snapshot := {
		"id": unit_id,
		"type_id": type_id,
		"owner": owner,
		"pos": {"q": pos.x, "r": pos.y},
		"hp": max_hp,
		"moves_left": moves_left,
		"veteran_level": 0,
		"orders": null,
		"automated": false,
	}

	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		units = []
	units.append(unit_snapshot)
	current_snapshot["units"] = units
	return true


func _apply_unit_updated(e: Dictionary) -> bool:
	# UnitUpdated carries a full UnitSnapshot; apply like UnitSpotted.
	return _apply_unit_spotted(e)


func _apply_unit_spotted(e: Dictionary) -> bool:
	var unit_data = e.get("unit", {})
	if typeof(unit_data) != TYPE_DICTIONARY:
		return false
	var ud: Dictionary = unit_data

	var unit_id = _extract_entity_id(ud.get("id", -1))
	if unit_id < 0:
		return false

	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		units = []

	for i in range(units.size()):
		var u = units[i]
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var existing: Dictionary = u
		if _extract_entity_id(existing.get("id", -1)) != unit_id:
			continue
		units[i] = ud
		current_snapshot["units"] = units
		return true

	units.append(ud)
	current_snapshot["units"] = units
	return true


func _apply_unit_hidden(e: Dictionary) -> bool:
	var unit_id = int(e.get("unit", -1))
	if unit_id < 0:
		return false

	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return true

	for i in range(units.size()):
		var u = units[i]
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = u
		if _extract_entity_id(ud.get("id", -1)) != unit_id:
			continue
		units.remove_at(i)
		current_snapshot["units"] = units
		return true

	return true


func _apply_city_founded(e: Dictionary) -> bool:
	var city_id = int(e.get("city", -1))
	if city_id < 0:
		return false
	var name = String(e.get("name", "City"))
	var owner = int(e.get("owner", -1))
	var pos_data = e.get("pos", {})
	if typeof(pos_data) != TYPE_DICTIONARY:
		return false
	var pos := _extract_hex_pos(pos_data)

	var claimed_tiles: Array = []
	var center_idx := _tile_index(pos)
	if center_idx >= 0:
		claimed_tiles.append(center_idx)

	var city_snapshot := {
		"id": city_id,
		"name": name,
		"owner": owner,
		"pos": {"q": pos.x, "r": pos.y},
		"population": 1,
		"food_stockpile": 0,
		"production_stockpile": 0,
		"buildings": [],
		"producing": null,
		"claimed_tiles": claimed_tiles,
		"border_progress": 0,
	}

	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		cities = []
	cities.append(city_snapshot)
	current_snapshot["cities"] = cities

	# Mark the city center tile.
	_set_tile_city_and_owner(pos, city_id, owner)
	return true


func _apply_city_spotted(e: Dictionary) -> bool:
	var city_data = e.get("city", {})
	if typeof(city_data) != TYPE_DICTIONARY:
		return false
	var cd: Dictionary = city_data

	var city_id = _extract_entity_id(cd.get("id", -1))
	if city_id < 0:
		return false

	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		cities = []

	for i in range(cities.size()):
		var c = cities[i]
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var existing: Dictionary = c
		if _extract_entity_id(existing.get("id", -1)) != city_id:
			continue
		cities[i] = cd
		current_snapshot["cities"] = cities
		return true

	cities.append(cd)
	current_snapshot["cities"] = cities
	return true


func _apply_city_hidden(e: Dictionary) -> bool:
	var city_id = int(e.get("city", -1))
	if city_id < 0:
		return false

	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return true

	for i in range(cities.size()):
		var c = cities[i]
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cd: Dictionary = c
		if _extract_entity_id(cd.get("id", -1)) != city_id:
			continue
		cities.remove_at(i)
		current_snapshot["cities"] = cities
		return true

	return true


func _apply_city_grew(e: Dictionary) -> bool:
	var city_id = int(e.get("city", -1))
	if city_id < 0:
		return false
	var new_pop = int(e.get("new_pop", 1))

	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return false
	for i in range(cities.size()):
		var c = cities[i]
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cd: Dictionary = c
		if _extract_entity_id(cd.get("id", -1)) != city_id:
			continue
		cd["population"] = new_pop
		cities[i] = cd
		current_snapshot["cities"] = cities
		return true
	return false


func _apply_city_conquered(e: Dictionary) -> bool:
	var city_id = int(e.get("city", -1))
	if city_id < 0:
		return false
	var new_owner = int(e.get("new_owner", -1))
	if new_owner < 0:
		return false

	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return false
	for i in range(cities.size()):
		var c = cities[i]
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cd: Dictionary = c
		if _extract_entity_id(cd.get("id", -1)) != city_id:
			continue
		cd["owner"] = new_owner
		cities[i] = cd
		current_snapshot["cities"] = cities
		# Also update the city center tile owner.
		var pos = _extract_hex_pos(cd.get("pos", {}))
		_set_tile_owner(pos, new_owner)
		return true
	return false


func _apply_borders_expanded(e: Dictionary) -> bool:
	var city_id = int(e.get("city", -1))
	if city_id < 0:
		return false
	var tiles = e.get("new_tiles", [])
	if typeof(tiles) != TYPE_ARRAY:
		return false

	var city := _find_city_by_id(city_id)
	if city.is_empty():
		return false
	var owner = _extract_player_id(city.get("owner", -1))
	if owner < 0:
		return false

	var claimed: Array = city.get("claimed_tiles", [])
	if typeof(claimed) != TYPE_ARRAY:
		claimed = []

	for h in tiles:
		if typeof(h) != TYPE_DICTIONARY:
			continue
		var hex := _extract_hex_pos(h)
		_set_tile_owner(hex, owner)
		var idx := _tile_index(hex)
		if idx >= 0 and idx not in claimed:
			claimed.append(idx)

	# Write claimed tiles back.
	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return true
	for i in range(cities.size()):
		var c = cities[i]
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cd: Dictionary = c
		if _extract_entity_id(cd.get("id", -1)) != city_id:
			continue
		cd["claimed_tiles"] = claimed
		cities[i] = cd
		current_snapshot["cities"] = cities
		break

	return true


func _apply_tile_revealed(e: Dictionary) -> bool:
	var hex_data = e.get("hex", {})
	if typeof(hex_data) != TYPE_DICTIONARY:
		return false
	var hex := _extract_hex_pos(hex_data)

	var idx := _tile_index(hex)
	if idx < 0:
		return true

	var map_data = current_snapshot.get("map", {})
	if typeof(map_data) != TYPE_DICTIONARY:
		return false
	var tiles = map_data.get("tiles", [])
	if typeof(tiles) != TYPE_ARRAY or idx >= tiles.size():
		return false

	var td: Dictionary = {}
	if typeof(tiles[idx]) == TYPE_DICTIONARY:
		td = tiles[idx]
	td["terrain"] = e.get("terrain", td.get("terrain", 0))
	tiles[idx] = td
	map_data["tiles"] = tiles
	current_snapshot["map"] = map_data
	return true


func _apply_tile_spotted(e: Dictionary) -> bool:
	var hex_data = e.get("hex", {})
	if typeof(hex_data) != TYPE_DICTIONARY:
		return false
	var hex := _extract_hex_pos(hex_data)

	var tile_data = e.get("tile", {})
	if typeof(tile_data) != TYPE_DICTIONARY:
		return false

	var idx := _tile_index(hex)
	if idx < 0:
		return true

	var map_data = current_snapshot.get("map", {})
	if typeof(map_data) != TYPE_DICTIONARY:
		return false
	var tiles = map_data.get("tiles", [])
	if typeof(tiles) != TYPE_ARRAY or idx >= tiles.size():
		return false

	tiles[idx] = tile_data
	map_data["tiles"] = tiles
	current_snapshot["map"] = map_data
	return true


func _apply_city_produced(e: Dictionary) -> bool:
	var city_id = int(e.get("city", -1))
	if city_id < 0:
		return false

	var item = e.get("item", null)
	if typeof(item) != TYPE_DICTIONARY:
		return false
	var item_dict: Dictionary = item

	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return false
	for i in range(cities.size()):
		var c = cities[i]
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cd: Dictionary = c
		if _extract_entity_id(cd.get("id", -1)) != city_id:
			continue
		cd["producing"] = null

		# If this was a building, add it to the built list.
		if item_dict.has("Building"):
			var building_id = int(item_dict.get("Building", -1))
			if building_id >= 0:
				var buildings: Array = cd.get("buildings", [])
				if typeof(buildings) != TYPE_ARRAY:
					buildings = []
				if building_id not in buildings:
					buildings.append(building_id)
					buildings.sort()
				cd["buildings"] = buildings

		cities[i] = cd
		current_snapshot["cities"] = cities
		return true
	return false


func _apply_city_production_set(e: Dictionary) -> bool:
	var city_id = int(e.get("city", -1))
	if city_id < 0:
		return false

	var item = e.get("item", null)
	if typeof(item) != TYPE_DICTIONARY:
		return false
	var item_dict: Dictionary = item

	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return false
	for i in range(cities.size()):
		var c = cities[i]
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cd: Dictionary = c
		if _extract_entity_id(cd.get("id", -1)) != city_id:
			continue
		cd["producing"] = item_dict
		cities[i] = cd
		current_snapshot["cities"] = cities

		# Refresh the server-derived CityUi cache if it's currently in use.
		if _city_ui_by_id.has(city_id):
			network_client.query_city_ui(city_id)
			network_client.query_production_options(city_id)

		return true
	return false


func _apply_improvement_event(e: Dictionary) -> bool:
	var hex_data = e.get("hex", {})
	if typeof(hex_data) != TYPE_DICTIONARY:
		return false
	var hex := _extract_hex_pos(hex_data)

	var idx := _tile_index(hex)
	if idx < 0:
		return false

	var map_data = current_snapshot.get("map", {})
	if typeof(map_data) != TYPE_DICTIONARY:
		return false
	var tiles = map_data.get("tiles", [])
	if typeof(tiles) != TYPE_ARRAY:
		return false
	if idx >= tiles.size():
		return false

	var tile = tiles[idx]
	if typeof(tile) != TYPE_DICTIONARY:
		return false
	var td: Dictionary = tile

	var kind = String(e.get("type", ""))
	match kind:
		"ImprovementBuilt":
			td["improvement"] = {
				"id": int(e.get("improvement", -1)),
				"tier": int(e.get("tier", 1)),
				"worked_turns": 0,
				"pillaged": false,
			}
		"ImprovementMatured":
			var improvement_id = int(e.get("improvement", -1))
			var imp = td.get("improvement", {})
			if typeof(imp) != TYPE_DICTIONARY:
				imp = {"id": improvement_id, "tier": 1, "worked_turns": 0, "pillaged": false}
			imp["id"] = improvement_id
			imp["tier"] = int(e.get("new_tier", 1))
			td["improvement"] = imp
		"ImprovementPillaged":
			var improvement_id = int(e.get("improvement", -1))
			var imp = td.get("improvement", {})
			if typeof(imp) != TYPE_DICTIONARY:
				imp = {"id": improvement_id, "tier": 1, "worked_turns": 0, "pillaged": false}
			imp["id"] = improvement_id
			imp["tier"] = int(e.get("new_tier", 1))
			imp["pillaged"] = true
			td["improvement"] = imp
		"ImprovementRepaired":
			var improvement_id = int(e.get("improvement", -1))
			var imp = td.get("improvement", {})
			if typeof(imp) != TYPE_DICTIONARY:
				imp = {"id": improvement_id, "tier": 1, "worked_turns": 0, "pillaged": false}
			imp["id"] = improvement_id
			imp["tier"] = int(e.get("tier", 1))
			imp["pillaged"] = false
			td["improvement"] = imp
		_:
			return false

	tiles[idx] = td
	map_data["tiles"] = tiles
	current_snapshot["map"] = map_data
	return true


func _apply_trade_route_established(e: Dictionary) -> bool:
	var route_id = int(e.get("route", -1))
	if route_id < 0:
		return false

	var trade_routes = current_snapshot.get("trade_routes", [])
	if typeof(trade_routes) != TYPE_ARRAY:
		trade_routes = []

	var route_snapshot := {
		"id": route_id,
		"owner": int(e.get("owner", 0)),
		"from": int(e.get("from", 0)),
		"to": int(e.get("to", 0)),
		"path": e.get("path", []),
		"is_external": bool(e.get("is_external", false)),
	}
	trade_routes.append(route_snapshot)
	current_snapshot["trade_routes"] = trade_routes
	return true


func _apply_trade_route_pillaged(e: Dictionary) -> bool:
	var route_id = int(e.get("route", -1))
	if route_id < 0:
		return false
	var trade_routes = current_snapshot.get("trade_routes", [])
	if typeof(trade_routes) != TYPE_ARRAY:
		return false
	for i in range(trade_routes.size()):
		var r = trade_routes[i]
		if typeof(r) != TYPE_DICTIONARY:
			continue
		var rd: Dictionary = r
		if _extract_entity_id(rd.get("id", -1)) != route_id:
			continue
		trade_routes.remove_at(i)
		current_snapshot["trade_routes"] = trade_routes
		return true
	return false


func _apply_supply_updated(e: Dictionary) -> bool:
	var player_id = int(e.get("player", -1))
	if player_id < 0:
		return false
	var used = int(e.get("used", 0))
	var cap = int(e.get("cap", 0))

	var players = current_snapshot.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return false
	for i in range(players.size()):
		var p = players[i]
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var pd: Dictionary = p
		if _extract_player_id(pd.get("id", -1)) != player_id:
			continue
		pd["supply_used"] = used
		pd["supply_cap"] = cap
		players[i] = pd
		current_snapshot["players"] = players
		return true
	return false


func _apply_research_progress(e: Dictionary) -> bool:
	var player_id = int(e.get("player", -1))
	if player_id < 0:
		return false
	var tech_id = int(e.get("tech", -1))
	if tech_id < 0:
		return false

	var players = current_snapshot.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return false
	for i in range(players.size()):
		var p = players[i]
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var pd: Dictionary = p
		if _extract_player_id(pd.get("id", -1)) != player_id:
			continue
		pd["researching"] = tech_id
		pd["research"] = {
			"tech": tech_id,
			"progress": int(e.get("progress", 0)),
			"required": int(e.get("required", 0)),
		}
		players[i] = pd
		current_snapshot["players"] = players
		return true
	return false


func _apply_tech_researched(e: Dictionary) -> bool:
	var player_id = int(e.get("player", -1))
	if player_id < 0:
		return false
	var tech_id = int(e.get("tech", -1))
	if tech_id < 0:
		return false

	var players = current_snapshot.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return false
	for i in range(players.size()):
		var p = players[i]
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var pd: Dictionary = p
		if _extract_player_id(pd.get("id", -1)) != player_id:
			continue
		var known: Array = pd.get("known_techs", [])
		if typeof(known) != TYPE_ARRAY:
			known = []
		if tech_id not in known:
			known.append(tech_id)
			known.sort()
		pd["known_techs"] = known
		players[i] = pd
		current_snapshot["players"] = players
		return true
	return false


func _apply_policy_adopted(e: Dictionary) -> bool:
	var player_id = int(e.get("player", -1))
	if player_id < 0:
		return false
	var policy_id = int(e.get("policy", -1))
	if policy_id < 0:
		return false

	var players = current_snapshot.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return false
	for i in range(players.size()):
		var p = players[i]
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var pd: Dictionary = p
		if _extract_player_id(pd.get("id", -1)) != player_id:
			continue
		var policies: Array = pd.get("policies", [])
		if typeof(policies) != TYPE_ARRAY:
			policies = []
		if policy_id not in policies:
			policies.append(policy_id)
			policies.sort()
		pd["policies"] = policies
		players[i] = pd
		current_snapshot["players"] = players
		return true
	return false


func _apply_government_reformed(e: Dictionary) -> bool:
	var player_id = int(e.get("player", -1))
	if player_id < 0:
		return false
	var new_gov = int(e.get("new", -1))
	if new_gov < 0:
		return false

	var players = current_snapshot.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return false
	for i in range(players.size()):
		var p = players[i]
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var pd: Dictionary = p
		if _extract_player_id(pd.get("id", -1)) != player_id:
			continue
		pd["government"] = new_gov
		players[i] = pd
		current_snapshot["players"] = players
		return true
	return false


func _tile_index(hex: Vector2i) -> int:
	var map_data = current_snapshot.get("map", {})
	if typeof(map_data) != TYPE_DICTIONARY:
		return -1
	var width = int(map_data.get("width", 0))
	var height = int(map_data.get("height", 0))
	var wrap_horizontal = bool(map_data.get("wrap_horizontal", true))
	if width <= 0 or height <= 0:
		return -1

	var q := hex.x
	var r := hex.y
	if r < 0 or r >= height:
		return -1
	if wrap_horizontal:
		q = posmod(q, width)
	else:
		if q < 0 or q >= width:
			return -1
	return r * width + q


func _set_tile_owner(hex: Vector2i, owner: int) -> void:
	var idx := _tile_index(hex)
	if idx < 0:
		return
	var map_data = current_snapshot.get("map", {})
	if typeof(map_data) != TYPE_DICTIONARY:
		return
	var tiles = map_data.get("tiles", [])
	if typeof(tiles) != TYPE_ARRAY or idx >= tiles.size():
		return
	if typeof(tiles[idx]) != TYPE_DICTIONARY:
		return
	var td: Dictionary = tiles[idx]
	td["owner"] = owner
	tiles[idx] = td
	map_data["tiles"] = tiles
	current_snapshot["map"] = map_data


func _set_tile_city_and_owner(hex: Vector2i, city_id: int, owner: int) -> void:
	var idx := _tile_index(hex)
	if idx < 0:
		return
	var map_data = current_snapshot.get("map", {})
	if typeof(map_data) != TYPE_DICTIONARY:
		return
	var tiles = map_data.get("tiles", [])
	if typeof(tiles) != TYPE_ARRAY or idx >= tiles.size():
		return
	if typeof(tiles[idx]) != TYPE_DICTIONARY:
		return
	var td: Dictionary = tiles[idx]
	td["owner"] = owner
	td["city"] = city_id
	tiles[idx] = td
	map_data["tiles"] = tiles
	current_snapshot["map"] = map_data


# Helper functions

func _extract_player_id(data) -> int:
	if typeof(data) == TYPE_DICTIONARY:
		return int(data.get("raw", 0))
	return int(data)


func _extract_entity_id(data) -> int:
	if typeof(data) == TYPE_DICTIONARY:
		return int(data.get("raw", 0))
	return int(data)


func _extract_type_id(data) -> int:
	if typeof(data) == TYPE_DICTIONARY:
		return int(data.get("raw", 0))
	return int(data)


func _extract_hex_pos(data) -> Vector2i:
	if typeof(data) == TYPE_DICTIONARY:
		return Vector2i(int(data.get("q", 0)), int(data.get("r", 0)))
	return Vector2i.ZERO


func _find_unit_by_id(unit_id: int) -> Dictionary:
	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return {}
	for unit in units:
		if typeof(unit) != TYPE_DICTIONARY:
			continue
		var id = _extract_entity_id(unit.get("id", 0))
		if id == unit_id:
			return unit
	return {}


func _find_unit_at(pos: Vector2i) -> Dictionary:
	var units = current_snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return {}
	for unit in units:
		if typeof(unit) != TYPE_DICTIONARY:
			continue
		var unit_pos = _extract_hex_pos(unit.get("pos", {}))
		if unit_pos == pos:
			return unit
	return {}


func _find_city_by_id(city_id: int) -> Dictionary:
	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return {}
	for city in cities:
		if typeof(city) != TYPE_DICTIONARY:
			continue
		var id = _extract_entity_id(city.get("id", 0))
		if id == city_id:
			return city
	return {}

func _find_city_at(pos: Vector2i) -> Dictionary:
	var cities = current_snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return {}
	var target := _normalize_hex(pos)
	if target == Vector2i(-999, -999):
		return {}
	for city in cities:
		if typeof(city) != TYPE_DICTIONARY:
			continue
		var city_pos = _extract_hex_pos(city.get("pos", {}))
		if _normalize_hex(city_pos) == target:
			return city
	return {}

func _normalize_hex(hex: Vector2i) -> Vector2i:
	var map_data = current_snapshot.get("map", {})
	if typeof(map_data) != TYPE_DICTIONARY:
		return Vector2i(-999, -999)
	var width = int(map_data.get("width", 0))
	var height = int(map_data.get("height", 0))
	var wrap_horizontal = bool(map_data.get("wrap_horizontal", true))
	if width <= 0 or height <= 0:
		return Vector2i(-999, -999)

	var q := hex.x
	var r := hex.y
	if r < 0 or r >= height:
		return Vector2i(-999, -999)
	if wrap_horizontal:
		q = posmod(q, width)
	else:
		if q < 0 or q >= width:
			return Vector2i(-999, -999)

	return Vector2i(q, r)

func _is_neighbor(a: Vector2i, b: Vector2i) -> bool:
	var target := _normalize_hex(b)
	if target == Vector2i(-999, -999):
		return false
	var dirs := [
		Vector2i(1, 0),
		Vector2i(1, -1),
		Vector2i(0, -1),
		Vector2i(-1, 0),
		Vector2i(-1, 1),
		Vector2i(0, 1),
	]
	var from := _normalize_hex(a)
	if from == Vector2i(-999, -999):
		return false
	for d in dirs:
		if _normalize_hex(from + d) == target:
			return true
	return false


func _get_available_production(city: Dictionary) -> Array:
	if rules_catalog.is_empty():
		return []

	var owner_id = _extract_player_id(city.get("owner", -1))
	var known_techs := _player_known_techs(owner_id)

	var out: Array = []

	for unit_id in _unit_rules_by_id.keys():
		var u: Dictionary = _unit_rules_by_id[unit_id]
		if not _tech_requirement_met(u.get("tech_required", null), known_techs):
			continue
		out.append({
			"type": "unit",
			"id": int(unit_id),
			"name": String(u.get("name", "Unit %d" % int(unit_id))),
			"cost": int(u.get("cost", 0)),
		})

	for building_id in _building_rules_by_id.keys():
		var b: Dictionary = _building_rules_by_id[building_id]
		if not _tech_requirement_met(b.get("tech_required", null), known_techs):
			continue
		out.append({
			"type": "building",
			"id": int(building_id),
			"name": String(b.get("name", "Building %d" % int(building_id))),
			"cost": int(b.get("cost", 0)),
		})

	out.sort_custom(func(a, b):
		var da: Dictionary = a
		var db: Dictionary = b
		var type_a = String(da.get("type", ""))
		var type_b = String(db.get("type", ""))
		if type_a != type_b:
			return type_a < type_b
		var cost_a = int(da.get("cost", 0))
		var cost_b = int(db.get("cost", 0))
		if cost_a != cost_b:
			return cost_a < cost_b
		return String(da.get("name", "")) < String(db.get("name", ""))
	)

	return out


func _player_known_techs(player_id: int) -> Array:
	var players = current_snapshot.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return []
	for p in players:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var pd: Dictionary = p
		if _extract_player_id(pd.get("id", -1)) != player_id:
			continue
		var known = pd.get("known_techs", [])
		return known if typeof(known) == TYPE_ARRAY else []
	return []


func _tech_requirement_met(tech_required: Variant, known_techs: Array) -> bool:
	if tech_required == null:
		return true
	var tech_id := _extract_type_id(tech_required)
	if tech_id < 0:
		return false
	return known_techs.has(tech_id)


func _calculate_movement_range(start: Vector2i, moves: int) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	if moves <= 0:
		return result

	var map_data: Dictionary = current_snapshot.get("map", {})
	var width = int(map_data.get("width", 0))
	var height = int(map_data.get("height", 0))
	var wrap_horizontal = bool(map_data.get("wrap_horizontal", true))
	var tiles: Array = map_data.get("tiles", [])
	if width <= 0 or height <= 0 or tiles.is_empty():
		return result

	var normalize := func(hex: Vector2i) -> Vector2i:
		var q := hex.x
		var r := hex.y
		if r < 0 or r >= height:
			return Vector2i(-999, -999)
		if wrap_horizontal:
			q = posmod(q, width)
		else:
			if q < 0 or q >= width:
				return Vector2i(-999, -999)
		return Vector2i(q, r)

	var is_passable := func(hex: Vector2i) -> bool:
		var h = normalize.call(hex)
		if h.x < 0:
			return false
		var idx: int = int(h.y) * width + int(h.x)
		if idx < 0 or idx >= tiles.size():
			return false
		var tile_data = tiles[idx]
		if typeof(tile_data) != TYPE_DICTIONARY:
			return false
		var terrain_id = _extract_type_id(tile_data.get("terrain", 0))
		return not TerrainColors.is_impassable(terrain_id)

	var visited: Dictionary = {}
	var queue: Array = []

	var start_hex = normalize.call(start)
	if start_hex.x < 0:
		return result

	visited[start_hex] = 0
	queue.append(start_hex)

	while not queue.is_empty():
		var pos: Vector2i = queue.pop_front()
		var dist: int = int(visited.get(pos, 0))

		if dist > 0:
			result.append(pos)
		if dist >= moves:
			continue

		for neighbor in _get_hex_neighbors(pos):
			var n = normalize.call(neighbor)
			if n.x < 0:
				continue
			if visited.has(n):
				continue
			if not is_passable.call(n):
				continue
			visited[n] = dist + 1
			queue.append(n)

	return result


func _get_hex_neighbors(pos: Vector2i) -> Array[Vector2i]:
	var directions: Array[Vector2i] = [
		Vector2i(1, 0), Vector2i(1, -1), Vector2i(0, -1),
		Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1)
	]
	var neighbors: Array[Vector2i] = []
	for dir in directions:
		neighbors.append(pos + dir)
	return neighbors


# -------------------------------------------------------------------------
# Chronicle Event Processing (Combat, etc.)
# -------------------------------------------------------------------------

func _process_chronicle_events(snapshot: Dictionary) -> void:
	var chronicle = snapshot.get("chronicle", [])
	if typeof(chronicle) != TYPE_ARRAY:
		return

	var chronicle_list: Array = chronicle
	var current_size: int = chronicle_list.size()

	# Process new events since last snapshot
	for i in range(last_chronicle_size, current_size):
		if i < 0 or i >= current_size:
			continue

		var entry = chronicle_list[i]
		if typeof(entry) != TYPE_DICTIONARY:
			continue

		var event = entry.get("event", {})
		if typeof(event) != TYPE_DICTIONARY:
			continue

		_handle_chronicle_event(event)

	last_chronicle_size = current_size


func _handle_chronicle_event(event: Dictionary) -> void:
	var event_type = String(event.get("type", ""))

	match event_type:
		"BattleEnded":
			_handle_battle_event(event)
		"CityFounded":
			_handle_city_founded_event(event)
		"CityConquered":
			_handle_city_conquered_event(event)
		"UnitKilled":
			_handle_unit_killed_event(event)


func _handle_battle_event(event: Dictionary) -> void:
	var at_data = event.get("at", {})
	var battle_pos := _extract_hex_pos(at_data)

	var attacker_id = _extract_player_id(event.get("attacker", 0))
	var defender_id = _extract_player_id(event.get("defender", 0))
	var winner_id = _extract_player_id(event.get("winner", 0))

	# Get screen position for the battle
	var screen_pos := _hex_to_screen_pos(battle_pos)

	# Determine colors
	var attacker_color := _player_color(attacker_id)
	var defender_color := _player_color(defender_id)

	# Get damage values (if available)
	var attacker_damage = int(event.get("attacker_damage", 0))
	var defender_damage = int(event.get("defender_damage", 0))
	var attacker_died: bool = (winner_id == defender_id) and attacker_damage > 0
	var defender_died: bool = (winner_id == attacker_id)

	# For now, just show a simplified battle effect at the battle location
	# Play combat sound with pitch variation
	AudioManager.play("attack_melee", 0.1)

	# Show damage number
	if defender_damage > 0:
		combat_effects.show_damage_number(screen_pos, defender_damage)

	# Show death effect if someone died
	if defender_died:
		combat_effects.show_death_effect(screen_pos, defender_color)
		AudioManager.play("unit_death", 0.15)
	elif attacker_died:
		combat_effects.show_death_effect(screen_pos, attacker_color)
		AudioManager.play("unit_death", 0.15)

	# Add message to HUD
	var winner_str := "You" if winner_id == my_player_id else ("Player %d" % winner_id)
	hud.add_message("Battle at (%d,%d): %s wins!" % [battle_pos.x, battle_pos.y, winner_str])


func _handle_city_founded_event(event: Dictionary) -> void:
	var city_name = String(event.get("name", "City"))
	var owner_id = _extract_player_id(event.get("owner", 0))
	var founder_str := "You" if owner_id == my_player_id else ("Player %d" % owner_id)
	hud.add_message("%s founded %s!" % [founder_str, city_name])
	AudioManager.play("city_founded")


func _handle_city_conquered_event(event: Dictionary) -> void:
	var city_name = String(event.get("name", "City"))
	var new_owner_id = _extract_player_id(event.get("new_owner", 0))
	var old_owner_id = _extract_player_id(event.get("old_owner", 0))

	var at_data = event.get("at", {})
	var city_pos := _extract_hex_pos(at_data)
	var screen_pos := _hex_to_screen_pos(city_pos)

	# Show conquest effect
	combat_effects.show_death_effect(screen_pos, _player_color(old_owner_id))

	var conqueror_str := "You" if new_owner_id == my_player_id else ("Player %d" % new_owner_id)
	hud.add_message("%s conquered %s!" % [conqueror_str, city_name])
	AudioManager.play("city_captured")


func _handle_unit_killed_event(event: Dictionary) -> void:
	var at_data = event.get("at", {})
	var unit_pos := _extract_hex_pos(at_data)
	var owner_id = _extract_player_id(event.get("owner", 0))

	var screen_pos := _hex_to_screen_pos(unit_pos)
	combat_effects.show_death_effect(screen_pos, _player_color(owner_id))


func _hex_to_screen_pos(hex: Vector2i) -> Vector2:
	# Convert hex coordinate to screen position
	# This should match MapViewMultiplayer's coordinate system
	var hex_size := 36.0 * map_view.zoom_level
	var origin := map_view.origin + map_view.camera_offset
	return HexMath.axial_to_pixel(hex, origin, hex_size)


func _player_color(player_id: int) -> Color:
	var colors := [
		Color(0.2, 0.6, 1.0),   # Blue
		Color(1.0, 0.3, 0.2),   # Red
		Color(0.3, 0.8, 0.3),   # Green
		Color(1.0, 0.8, 0.2),   # Yellow
		Color(0.7, 0.3, 0.8),   # Purple
		Color(0.2, 0.8, 0.8),   # Cyan
		Color(1.0, 0.5, 0.2),   # Orange
		Color(0.9, 0.4, 0.6),   # Pink
	]
	return colors[player_id % colors.size()]


# -------------------------------------------------------------------------
# Game End Handling
# -------------------------------------------------------------------------

func _on_game_ended(is_victory: bool, victory_type: String, reason: String, stats: Dictionary) -> void:
	_is_game_over = true

	# Disable game input
	map_view.set_process_unhandled_input(false)

	# Unlock timeline scrubbing post-game.
	if not current_snapshot.is_empty() and hud.has_method("set_chronicle_entries"):
		var chronicle = current_snapshot.get("chronicle", [])
		if typeof(chronicle) == TYPE_ARRAY:
			hud.set_chronicle_entries(chronicle, _city_name_lookup(), _player_name_lookup(), true)

	# Populate stats from current snapshot if not provided
	if stats.is_empty():
		stats = _gather_local_stats()

	# Show appropriate screen
	if is_victory:
		game_end_screen.show_victory(victory_type, stats)
	else:
		game_end_screen.show_defeat(reason, stats)


func _gather_local_stats() -> Dictionary:
	var stats: Dictionary = {}
	stats["turns"] = current_snapshot.get("turn", 0)

	# Count my cities
	var city_count := 0
	for city in current_snapshot.get("cities", []):
		if typeof(city) == TYPE_DICTIONARY:
			var owner = _extract_player_id(city.get("owner", -1))
			if owner == my_player_id:
				city_count += 1
	stats["cities"] = city_count

	# Count my units
	var unit_count := 0
	for unit in current_snapshot.get("units", []):
		if typeof(unit) == TYPE_DICTIONARY:
			var owner = _extract_player_id(unit.get("owner", -1))
			if owner == my_player_id:
				unit_count += 1
	stats["units"] = unit_count

	# Count techs
	var players_data = current_snapshot.get("players", [])
	for p in players_data:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		if _extract_player_id(p.get("id", -1)) == my_player_id:
			var known_techs: Array = p.get("known_techs", [])
			stats["techs"] = known_techs.size()
			break

	# Calculate a basic score
	stats["score"] = city_count * 100 + unit_count * 10 + stats.get("techs", 0) * 50

	return stats


func _on_end_screen_return_to_menu() -> void:
	network_client.disconnect_from_server()
	return_to_lobby.emit()


func _on_end_screen_play_again() -> void:
	# For now, just return to menu - could reconnect to same server
	network_client.disconnect_from_server()
	return_to_lobby.emit()
