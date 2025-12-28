extends Node
class_name GameClient

var bridge: Node

var snapshot: Dictionary = {}
var units: Dictionary = {}
var cities: Dictionary = {}
var rules_names: Dictionary = {}
var rules_catalog: Dictionary = {}
var current_turn: int = 0
var current_player: int = 0

signal events_received(events: Array)
signal snapshot_loaded()
signal info_message(message: String)

func _ready() -> void:
	load("res://addons/backbay_godot/backbay_godot.gdextension")
	if not ClassDB.class_exists("GameBridge"):
		push_error("GameBridge class not found. Build/link the GDExtension and enable res://addons/backbay_godot/backbay_godot.gdextension")
		return

	var instance = ClassDB.instantiate("GameBridge")
	if instance == null:
		push_error("Failed to instantiate GameBridge")
		return

	bridge = instance as Node
	if bridge == null:
		push_error("GameBridge instantiated but is not a Node")
		return
	add_child(bridge)


func new_game(map_size: int, num_players: int) -> void:
	if bridge == null:
		push_error("GameBridge is not initialized")
		return

	var terrain = FileAccess.get_file_as_bytes("res://data/base/terrain.yaml")
	var units_data = FileAccess.get_file_as_bytes("res://data/base/units.yaml")
	var buildings = FileAccess.get_file_as_bytes("res://data/base/buildings.yaml")
	var techs = FileAccess.get_file_as_bytes("res://data/base/techs.yaml")
	var improvements = FileAccess.get_file_as_bytes("res://data/base/improvements.yaml")
	var policies = FileAccess.get_file_as_bytes("res://data/base/policies.yaml")
	var governments = FileAccess.get_file_as_bytes("res://data/base/governments.yaml")

	var snapshot_bytes = bridge.new_game(map_size, num_players, terrain, units_data, buildings, techs, improvements, policies, governments)
	var snapshot_json := String(bridge.decode_snapshot_json(snapshot_bytes))
	var parsed = JSON.parse_string(snapshot_json)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Failed to parse snapshot JSON")
		return

	_apply_snapshot(parsed)
	_load_rules_names()
	_load_rules_catalog()
	snapshot_loaded.emit()


func send_command(command: Dictionary) -> Array:
	if bridge == null:
		push_error("GameBridge is not initialized")
		return []

	var cmd_json := JSON.stringify(command)
	var cmd_bytes = bridge.encode_command_json(cmd_json)
	var event_bytes = bridge.apply_command(cmd_bytes)

	var events_json := String(bridge.decode_events_json(event_bytes))
	var parsed = JSON.parse_string(events_json)
	if typeof(parsed) != TYPE_ARRAY:
		push_error("Failed to parse events JSON")
		return []

	var events: Array = parsed
	_apply_events(events)
	refresh_snapshot()
	events_received.emit(events)
	return events


func move_unit(unit_id: int, path: Array[Vector2i]) -> Array:
	var hexes: Array = []
	for h in path:
		hexes.append({"q": h.x, "r": h.y})

	return send_command({"type": "MoveUnit", "unit": unit_id, "path": hexes})

func attack_unit(attacker_id: int, target_id: int) -> Array:
	return send_command({"type": "AttackUnit", "attacker": attacker_id, "target": target_id})

func fortify_unit(unit_id: int) -> Array:
	return send_command({"type": "Fortify", "unit": unit_id})


func end_turn() -> Array:
	return send_command({"type": "EndTurn"})

func found_city(settler_id: int, name: String) -> Array:
	return send_command({"type": "FoundCity", "settler": settler_id, "name": name})

func set_production(city_id: int, kind: String, item_id: int) -> Array:
	var item: Dictionary = {}
	item[kind] = item_id
	return send_command({"type": "SetProduction", "city": city_id, "item": item})

func set_research(tech_id: int) -> Array:
	return send_command({"type": "SetResearch", "tech": tech_id})

func replay_to_turn(turn: int) -> void:
	if bridge == null:
		push_error("GameBridge is not initialized")
		return

	var snapshot_bytes = bridge.replay_to_turn(turn)
	var snapshot_json := String(bridge.decode_snapshot_json(snapshot_bytes))
	var parsed = JSON.parse_string(snapshot_json)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Failed to parse replay snapshot JSON")
		return
	_apply_snapshot(parsed)
	snapshot_loaded.emit()

func export_replay_json() -> String:
	if bridge == null:
		push_error("GameBridge is not initialized")
		return ""

	var replay_bytes = bridge.export_replay()
	return String(bridge.decode_replay_json(replay_bytes))

func import_replay_json(replay_json: String) -> void:
	if bridge == null:
		push_error("GameBridge is not initialized")
		return

	var replay_bytes = bridge.encode_replay_json(replay_json)
	var snapshot_bytes = bridge.import_replay(replay_bytes)
	var snapshot_json := String(bridge.decode_snapshot_json(snapshot_bytes))
	var parsed = JSON.parse_string(snapshot_json)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Failed to parse imported snapshot JSON")
		return
	_apply_snapshot(parsed)
	_load_rules_names()
	_load_rules_catalog()
	snapshot_loaded.emit()

func _load_rules_names() -> void:
	rules_names = {}
	if bridge == null:
		return
	if not bridge.has_method("query_rules_names"):
		return

	var names_bytes = bridge.query_rules_names()
	var names_json := String(bridge.decode_rules_names_json(names_bytes))
	var parsed = JSON.parse_string(names_json)
	if typeof(parsed) == TYPE_DICTIONARY:
		rules_names = parsed

func _load_rules_catalog() -> void:
	rules_catalog = {}
	if bridge == null:
		return
	if not bridge.has_method("query_rules_catalog"):
		return

	var catalog_bytes = bridge.query_rules_catalog()
	var catalog_json := String(bridge.decode_rules_catalog_json(catalog_bytes))
	var parsed = JSON.parse_string(catalog_json)
	if typeof(parsed) == TYPE_DICTIONARY:
		rules_catalog = parsed

func _name_from_table(table_key: String, id_value: Variant, fallback: String) -> String:
	var names = rules_names.get(table_key, [])
	if typeof(names) != TYPE_ARRAY:
		return fallback
	var idx := int(id_value)
	if idx < 0 or idx >= names.size():
		return fallback
	return String(names[idx])

func tech_name(tech_id: int) -> String:
	return _name_from_table("techs", tech_id, "Tech %d" % tech_id)

func policy_name(policy_id: int) -> String:
	return _name_from_table("policies", policy_id, "Policy %d" % policy_id)

func government_name(government_id: int) -> String:
	return _name_from_table("governments", government_id, "Gov %d" % government_id)

func improvement_name(improvement_id: int) -> String:
	return _name_from_table("improvements", improvement_id, "Improvement %d" % improvement_id)

func unit_type_name(type_id: int) -> String:
	return _name_from_table("unit_types", type_id, "Unit %d" % type_id)

func building_name(building_id: int) -> String:
	return _name_from_table("buildings", building_id, "Building %d" % building_id)

func set_worker_automation(unit_id: int, enabled: bool) -> Array:
	return send_command({"type": "SetWorkerAutomation", "unit": unit_id, "enabled": enabled})

func set_build_improvement_orders(unit_id: int, improvement_id: int) -> Array:
	return send_command({
		"type": "SetOrders",
		"unit": unit_id,
		"orders": {"type": "BuildImprovement", "improvement": improvement_id},
	})

func set_repair_improvement_orders(unit_id: int) -> Array:
	return send_command({
		"type": "SetOrders",
		"unit": unit_id,
		"orders": {"type": "RepairImprovement"},
	})

func set_goto_orders(unit_id: int, path: Array[Vector2i]) -> Array:
	var hexes: Array = []
	for h in path:
		hexes.append({"q": h.x, "r": h.y})

	return send_command({
		"type": "SetOrders",
		"unit": unit_id,
		"orders": {"type": "Goto", "path": hexes},
	})

func cancel_orders(unit_id: int) -> Array:
	return send_command({"type": "CancelOrders", "unit": unit_id})


func get_movement_range(unit_id: int) -> Array[Vector2i]:
	if bridge == null:
		return []

	var bytes = bridge.query_movement_range(unit_id)
	var json := String(bridge.decode_hexes_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_ARRAY:
		return []

	var out: Array[Vector2i] = []
	for h in parsed:
		if typeof(h) == TYPE_DICTIONARY and h.has("q") and h.has("r"):
			out.append(Vector2i(int(h.q), int(h.r)))
	return out


func get_unit_path(unit_id: int, destination: Vector2i) -> Array[Vector2i]:
	if bridge == null:
		return []

	var bytes = bridge.query_path(unit_id, destination.x, destination.y)
	var json := String(bridge.decode_hexes_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_ARRAY:
		return []

	var out: Array[Vector2i] = []
	for h in parsed:
		if typeof(h) == TYPE_DICTIONARY and h.has("q") and h.has("r"):
			out.append(Vector2i(int(h.q), int(h.r)))
	return out

func get_path_preview(unit_id: int, destination: Vector2i) -> Dictionary:
	if bridge == null:
		return {}

	var bytes = bridge.query_path_preview(unit_id, destination.x, destination.y)
	var json := String(bridge.decode_path_preview_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}

	var out: Dictionary = {}
	out["full_path"] = _parse_hexes(parsed.get("full_path", []))
	out["this_turn_path"] = _parse_hexes(parsed.get("this_turn_path", []))
	out["stop_at"] = _parse_hex(parsed.get("stop_at", {}))
	out["stop_reason"] = parsed.get("stop_reason", null)
	return out

func get_enemy_zoc(player_id: int) -> Array[Vector2i]:
	if bridge == null:
		return []

	var bytes = bridge.query_enemy_zoc(player_id)
	var json := String(bridge.decode_hexes_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_ARRAY:
		return []

	var out: Array[Vector2i] = []
	for h in parsed:
		if typeof(h) == TYPE_DICTIONARY and h.has("q") and h.has("r"):
			out.append(Vector2i(int(h.q), int(h.r)))
	return out

func get_visible_tiles(player_id: int) -> Array[Vector2i]:
	if bridge == null or not bridge.has_method("query_visible_tiles"):
		return []

	var bytes = bridge.query_visible_tiles(player_id)
	var json := String(bridge.decode_hexes_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_ARRAY:
		return []

	var out: Array[Vector2i] = []
	for h in parsed:
		if typeof(h) == TYPE_DICTIONARY and h.has("q") and h.has("r"):
			out.append(Vector2i(int(h.q), int(h.r)))
	return out

func get_promise_strip(player_id: int) -> Array:
	if bridge == null:
		return []

	var bytes = bridge.query_promise_strip(player_id)
	var json := String(bridge.decode_promises_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_ARRAY:
		return []
	return parsed

func get_city_ui(city_id: int) -> Dictionary:
	if bridge == null or not bridge.has_method("query_city_ui"):
		return {}
	var bytes = bridge.query_city_ui(city_id)
	var json := String(bridge.decode_city_ui_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed

func get_production_options(city_id: int) -> Array:
	if bridge == null or not bridge.has_method("query_production_options"):
		return []
	var bytes = bridge.query_production_options(city_id)
	var json := String(bridge.decode_production_options_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_ARRAY:
		return []
	return parsed

func get_tech_options(player_id: int) -> Array:
	if bridge == null or not bridge.has_method("query_tech_options"):
		return []
	var bytes = bridge.query_tech_options(player_id)
	var json := String(bridge.decode_tech_options_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_ARRAY:
		return []
	return parsed

func get_combat_why(attacker_id: int, defender_id: int) -> Dictionary:
	return _decode_why_panel(bridge.query_combat_why(attacker_id, defender_id))

func get_combat_preview(attacker_id: int, defender_id: int) -> Dictionary:
	if bridge == null:
		return {}

	var bytes = bridge.query_combat_preview(attacker_id, defender_id)
	var json := String(bridge.decode_combat_preview_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed

func get_maintenance_why(player_id: int) -> Dictionary:
	return _decode_why_panel(bridge.query_maintenance_why(player_id))

func get_city_maintenance_why(city_id: int) -> Dictionary:
	return _decode_why_panel(bridge.query_city_maintenance_why(city_id))

func get_unrest_why(city_id: int) -> Dictionary:
	return _decode_why_panel(bridge.query_unrest_why(city_id))

func get_conversion_why(city_id: int) -> Dictionary:
	return _decode_why_panel(bridge.query_conversion_why(city_id))

func get_treaty_why(a: int, b: int) -> Dictionary:
	return _decode_why_panel(bridge.query_treaty_why(a, b))

func _decode_why_panel(bytes: PackedByteArray) -> Dictionary:
	if bridge == null:
		return {}

	var json := String(bridge.decode_why_panel_json(bytes))
	var parsed = JSON.parse_string(json)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed


func first_unit_id_for_player(player_id: int) -> int:
	for unit_data in snapshot.get("units", []):
		if typeof(unit_data) == TYPE_DICTIONARY and int(unit_data.get("owner", -1)) == player_id:
			return int(unit_data.get("id", -1))
	return -1


func _apply_snapshot(snapshot_data: Dictionary) -> void:
	snapshot = snapshot_data
	units.clear()
	cities.clear()

	current_turn = int(snapshot.get("turn", 0))
	current_player = int(snapshot.get("current_player", 0))

	for unit_data in snapshot.get("units", []):
		if typeof(unit_data) == TYPE_DICTIONARY and unit_data.has("id"):
			units[int(unit_data.id)] = unit_data

	for city_data in snapshot.get("cities", []):
		if typeof(city_data) == TYPE_DICTIONARY and city_data.has("id"):
			cities[int(city_data.id)] = city_data


func refresh_snapshot() -> void:
	if bridge == null:
		push_error("GameBridge is not initialized")
		return

	var snapshot_bytes = bridge.get_snapshot()
	var snapshot_json := String(bridge.decode_snapshot_json(snapshot_bytes))
	var parsed = JSON.parse_string(snapshot_json)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Failed to parse snapshot JSON")
		return
	_apply_snapshot(parsed)


func _apply_events(events: Array) -> void:
	for event in events:
		if typeof(event) != TYPE_DICTIONARY:
			continue
		var t = String(event.get("type", ""))
		match t:
			"TurnStarted":
				current_turn = int(event.get("turn", current_turn))
				current_player = int(event.get("player", current_player))
				info_message.emit("Turn %d: Player %d" % [current_turn, current_player])
			"MovementStopped":
				_emit_movement_message(event, "Movement stopped")
			"OrdersInterrupted":
				_emit_movement_message(event, "Orders interrupted")
			"OrdersCompleted":
				info_message.emit("Orders completed")
			_:
				pass


func _emit_movement_message(event: Dictionary, prefix: String) -> void:
	var reason = event.get("reason", {})
	if typeof(reason) != TYPE_DICTIONARY:
		info_message.emit(prefix)
		return

	var rt = String(reason.get("type", ""))
	match rt:
		"EnteredEnemyZoc":
			info_message.emit("%s: entered enemy ZOC" % prefix)
		"Blocked":
			var attempted = reason.get("attempted", {})
			if typeof(attempted) == TYPE_DICTIONARY:
				info_message.emit("%s: blocked at (%d,%d)" % [prefix, int(attempted.get("q", 0)), int(attempted.get("r", 0))])
			else:
				info_message.emit("%s: blocked" % prefix)
		"MovesExhausted":
			info_message.emit("%s: out of moves" % prefix)
		_:
			info_message.emit("%s" % prefix)


func _parse_hexes(raw: Variant) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	if typeof(raw) != TYPE_ARRAY:
		return out
	for h in raw:
		if typeof(h) == TYPE_DICTIONARY and h.has("q") and h.has("r"):
			out.append(Vector2i(int(h.q), int(h.r)))
	return out


func _parse_hex(raw: Variant) -> Vector2i:
	if typeof(raw) == TYPE_DICTIONARY:
		var h: Dictionary = raw
		return Vector2i(int(h.get("q", -999)), int(h.get("r", -999)))
	return Vector2i(-999, -999)
