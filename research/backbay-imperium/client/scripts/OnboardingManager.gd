# gdlint:ignore = class-definitions-order
extends Node
class_name OnboardingManager

## Client-only onboarding manager for the first 20 turns.
## Tracks early beats and surfaces prompts/quests without touching the sim.

const DATA_PATH := "res://data/onboarding.json"
const SNOOZE_TURNS := 10

var enabled := true
var snoozed_until_turn := -1

var _beats: Dictionary = {} # id -> beat data
var _beat_order: Array = []
var _beat_state: Dictionary = {} # id -> {completed, announced, last_prompt_turn}

var _rules_catalog: Dictionary = {}
var _unit_rules_by_id: Dictionary = {}
var _resource_rules_by_id: Dictionary = {}
var _resources_by_tech: Dictionary = {} # tech_id -> Array[resource_id]

var _snapshot: Dictionary = {}
var _promises: Array = []
var _current_turn := 0
var _my_player_id := -1

var _map_view: Node = null
var _hud: Node = null

var _current_prompts: Array = []
var _current_quest: Dictionary = {}
var _initial_explored_tiles := -1
var _saw_resource_reveal := false
var _saw_combat := false
var _yield_lens_active := false


func _ready() -> void:
	_load_data()


func setup(hud: Node, map_view: Node) -> void:
	_hud = hud
	_map_view = map_view


func set_rules_catalog(catalog: Dictionary) -> void:
	_rules_catalog = catalog
	_unit_rules_by_id.clear()
	_resource_rules_by_id.clear()
	_resources_by_tech.clear()

	var units = _rules_catalog.get("unit_types", [])
	if typeof(units) == TYPE_ARRAY:
		for u in units:
			if typeof(u) != TYPE_DICTIONARY:
				continue
			var ud: Dictionary = u
			var uid := int(ud.get("id", -1))
			if uid >= 0:
				_unit_rules_by_id[uid] = ud

	var resources = _rules_catalog.get("resources", [])
	if typeof(resources) == TYPE_ARRAY:
		for r in resources:
			if typeof(r) != TYPE_DICTIONARY:
				continue
			var rd: Dictionary = r
			var rid := int(rd.get("id", -1))
			if rid >= 0:
				_resource_rules_by_id[rid] = rd
			var reveal = rd.get("revealed_by_tech", null)
			if reveal == null:
				continue
			var tech_id := int(reveal)
			if tech_id < 0:
				continue
			if not _resources_by_tech.has(tech_id):
				_resources_by_tech[tech_id] = []
			var list: Array = _resources_by_tech[tech_id]
			if rid not in list:
				list.append(rid)


func set_promises(promises: Array) -> void:
	_promises = promises


func refresh(snapshot: Dictionary, my_player_id: int, current_turn: int) -> void:
	_snapshot = snapshot
	_my_player_id = my_player_id
	_current_turn = current_turn

	if not enabled or current_turn < 1 or (snoozed_until_turn >= 0 and current_turn <= snoozed_until_turn):
		_current_prompts = []
		_current_quest = {"enabled": false}
		_push_ui_state()
		return

	var active_beats: Array = []
	for beat_id in _beat_order:
		if _is_beat_completed(beat_id):
			continue
		if not _beat_in_window(beat_id):
			continue
		if not _beat_prereqs_met(beat_id):
			continue
		if _beat_triggered(beat_id):
			active_beats.append(beat_id)

	var current_id := "" if active_beats.is_empty() else String(active_beats[0])
	_current_prompts = []
	_current_quest = {"enabled": false}

	if current_id != "":
		var beat: Dictionary = _beats.get(current_id, {})
		var prompt: Dictionary = beat.get("prompt", {})
		var text := String(prompt.get("text", beat.get("title", "Next step")))
		var action := String(prompt.get("action", ""))

		_current_prompts.append({
			"type": "Onboarding",
			"id": current_id,
			"text": text,
			"action": action,
		})

		var steps: Array = []
		var raw_steps = beat.get("steps", [])
		if typeof(raw_steps) == TYPE_ARRAY:
			for s in raw_steps:
				steps.append({
					"text": String(s),
					"done": _is_beat_completed(current_id),
				})

		_current_quest = {
			"enabled": true,
			"title": beat.get("title", "Guided Opening"),
			"steps": steps,
		}

		if not _beat_state.get(current_id, {}).get("announced", false):
			_mark_beat_announced(current_id)
			_toast(text)
			_maybe_ping_for_beat(current_id)

	_push_ui_state()

	if _yield_lens_active and _is_beat_completed("first_improvement"):
		_yield_lens_active = false
		if _map_view and _map_view.has_method("set_show_yields"):
			_map_view.set_show_yields(false)


func apply_events(events: Array) -> void:
	if not enabled or _snapshot.is_empty():
		return
	if typeof(events) != TYPE_ARRAY:
		return

	for raw in events:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var e: Dictionary = raw
		var t := String(e.get("type", ""))

		match t:
			"TechResearched":
				var player_id := _parse_player_id(e.get("player", -1))
				if player_id == _my_player_id:
					var tech_id := _parse_runtime_id(e.get("tech", -1))
					_handle_tech_researched(tech_id)
			"CombatStarted", "CombatRound", "CombatEnded", "UnitDamaged":
				_saw_combat = true
			_:
				pass


func get_prompt_promises() -> Array:
	return _current_prompts.duplicate(true)


func snooze(turns: int = SNOOZE_TURNS) -> void:
	snoozed_until_turn = _current_turn + max(turns, 1)
	_current_prompts = []
	_current_quest = {"enabled": false}
	if _yield_lens_active:
		_yield_lens_active = false
		if _map_view and _map_view.has_method("set_show_yields"):
			_map_view.set_show_yields(false)
	_push_ui_state()


func disable() -> void:
	enabled = false
	_current_prompts = []
	_current_quest = {"enabled": false}
	if _yield_lens_active:
		_yield_lens_active = false
		if _map_view and _map_view.has_method("set_show_yields"):
			_map_view.set_show_yields(false)
	_push_ui_state()


func _load_data() -> void:
	_beats.clear()
	_beat_order.clear()
	_beat_state.clear()

	if not FileAccess.file_exists(DATA_PATH):
		return
	var file := FileAccess.open(DATA_PATH, FileAccess.READ)
	if file == null:
		return
	var text := file.get_as_text()
	file.close()

	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var data: Dictionary = parsed
	var beats = data.get("beats", [])
	if typeof(beats) != TYPE_ARRAY:
		return

	for raw in beats:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var b: Dictionary = raw
		var id := String(b.get("id", ""))
		if id.is_empty():
			continue
		_beats[id] = b
		_beat_order.append(id)
		_beat_state[id] = {
			"completed": false,
			"announced": false,
			"last_prompt_turn": -1,
		}


func _is_beat_completed(beat_id: String) -> bool:
	var state: Dictionary = _beat_state.get(beat_id, {})
	if bool(state.get("completed", false)):
		return true

	var completed := false
	match beat_id:
		"found_city":
			completed = _player_city_count() > 0
		"pick_research":
			completed = _research_selected()
		"pick_production":
			completed = _player_has_production()
		"explore":
			completed = _explored_increase_reached()
		"first_improvement":
			completed = _player_has_improvement()
		"first_tech_reveal":
			completed = _saw_resource_reveal and bool(state.get("announced", false))
		"first_combat":
			completed = _saw_combat
		"second_city":
			completed = _player_city_count() >= 2
		"meet_rival":
			completed = _player_has_seen_rival() and bool(state.get("announced", false))
		_:
			completed = false

	if completed:
		state["completed"] = true
		_beat_state[beat_id] = state
	return completed


func _beat_in_window(beat_id: String) -> bool:
	var beat: Dictionary = _beats.get(beat_id, {})
	var min_turn := int(beat.get("turn_min", 1))
	var max_turn := int(beat.get("turn_max", 20))
	return _current_turn >= min_turn and _current_turn <= max_turn


func _beat_prereqs_met(beat_id: String) -> bool:
	var beat: Dictionary = _beats.get(beat_id, {})
	var prereqs = beat.get("prereqs", [])
	if typeof(prereqs) != TYPE_ARRAY:
		return true
	for p in prereqs:
		var pid := String(p)
		if pid.is_empty():
			continue
		if not _is_beat_completed(pid):
			return false
	return true


func _beat_triggered(beat_id: String) -> bool:
	match beat_id:
		"found_city":
			return _player_city_count() == 0 and _player_has_settler()
		"pick_research":
			return _player_city_count() > 0 and not _research_selected()
		"pick_production":
			return _player_city_count() > 0 and not _player_has_production()
		"explore":
			return _player_has_movable_unit() and not _explored_increase_reached()
		"first_improvement":
			return _player_has_worker() and not _player_has_improvement()
		"first_tech_reveal":
			return _saw_resource_reveal
		"first_combat":
			return _player_has_adjacent_enemy() and not _saw_combat
		"second_city":
			return _player_city_count() == 1 and _player_has_settler_available()
		"meet_rival":
			return _player_has_seen_rival()
		_:
			return false


func _mark_beat_announced(beat_id: String) -> void:
	var state: Dictionary = _beat_state.get(beat_id, {})
	state["announced"] = true
	state["last_prompt_turn"] = _current_turn
	_beat_state[beat_id] = state


func _push_ui_state() -> void:
	if _hud and _hud.has_method("set_onboarding_state"):
		_hud.set_onboarding_state(_current_quest)


func _toast(text: String) -> void:
	if _hud and _hud.has_method("add_message"):
		_hud.add_message(text)


func _maybe_ping_for_beat(beat_id: String) -> void:
	if _map_view == null:
		return
	match beat_id:
		"explore":
			var target := _find_exploration_ping()
			if target.x >= 0:
				if _map_view.has_method("ping_hex"):
					_map_view.ping_hex(target)
		"first_improvement":
			if _map_view.has_method("set_show_yields"):
				_map_view.set_show_yields(true)
				_yield_lens_active = true
		_:
			pass


func _handle_tech_researched(tech_id: int) -> void:
	if tech_id < 0:
		return
	if not _resources_by_tech.has(tech_id):
		return
	var res_list: Array = _resources_by_tech.get(tech_id, [])
	if res_list.is_empty():
		return

	_saw_resource_reveal = true
	var names: Array[String] = []
	for rid in res_list:
		var rd: Dictionary = _resource_rules_by_id.get(rid, {})
		var name := String(rd.get("name", "Resource"))
		if not name.is_empty():
			names.append(name)

	if not names.is_empty():
		_toast("%s revealed: %s" % [_tech_name(tech_id), ", ".join(names)])
		if _map_view and _map_view.has_method("ping_revealed_resources"):
			_map_view.ping_revealed_resources(tech_id)


func _player_city_count() -> int:
	var cities = _snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return 0
	var count := 0
	for c in cities:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cd: Dictionary = c
		if _extract_player_id(cd.get("owner", -1)) == _my_player_id:
			count += 1
	return count


func _player_has_production() -> bool:
	var cities = _snapshot.get("cities", [])
	if typeof(cities) != TYPE_ARRAY:
		return false
	for c in cities:
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cd: Dictionary = c
		if _extract_player_id(cd.get("owner", -1)) != _my_player_id:
			continue
		var producing = cd.get("producing", null)
		if producing != null:
			return true
	return false


func _player_has_settler() -> bool:
	for u in _player_units():
		var type_id := _extract_type_id(u.get("type_id", -1))
		if _unit_can_found_city(type_id):
			return true
	return false


func _player_has_settler_available() -> bool:
	for u in _player_units():
		var type_id := _extract_type_id(u.get("type_id", -1))
		if not _unit_can_found_city(type_id):
			continue
		var moves_left := int(u.get("moves_left", 0))
		if moves_left > 0:
			return true
	return false


func _player_has_worker() -> bool:
	for u in _player_units():
		var type_id := _extract_type_id(u.get("type_id", -1))
		if _unit_is_worker(type_id):
			return true
	return false


func _player_has_improvement() -> bool:
	var map_data = _snapshot.get("map", {})
	if typeof(map_data) != TYPE_DICTIONARY:
		return false
	var tiles = map_data.get("tiles", [])
	if typeof(tiles) != TYPE_ARRAY:
		return false
	for t in tiles:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		var td: Dictionary = t
		var owner = td.get("owner", null)
		if owner == null:
			continue
		if _extract_player_id(owner) != _my_player_id:
			continue
		if td.get("improvement", null) != null:
			return true
	return false


func _player_has_movable_unit() -> bool:
	for u in _player_units():
		if int(u.get("moves_left", 0)) > 0:
			return true
	return false


func _player_has_adjacent_enemy() -> bool:
	var units = _snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return false
	var by_pos: Dictionary = {}
	for raw in units:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = raw
		var pos := _extract_hex_pos(ud.get("pos", {}))
		if pos.x < -900:
			continue
		by_pos[pos] = ud

	for raw in units:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = raw
		if _extract_player_id(ud.get("owner", -1)) != _my_player_id:
			continue
		var pos := _extract_hex_pos(ud.get("pos", {}))
		for neighbor in _neighbor_hexes(pos):
			if not by_pos.has(neighbor):
				continue
			var enemy: Dictionary = by_pos[neighbor]
			if _extract_player_id(enemy.get("owner", -1)) != _my_player_id:
				return true
	return false


func _player_has_seen_rival() -> bool:
	if _map_view == null:
		return false
	if _map_view.has_method("get_visible_enemy_units"):
		var enemies: Array = _map_view.get_visible_enemy_units()
		return not enemies.is_empty()
	return false


func _explored_increase_reached() -> bool:
	if _map_view == null:
		return false
	var explored: Dictionary = _map_view.explored_tiles
	if _initial_explored_tiles < 0:
		_initial_explored_tiles = explored.size()
		return false
	return explored.size() >= _initial_explored_tiles + 6


func _find_exploration_ping() -> Vector2i:
	if _map_view == null:
		return Vector2i(-999, -999)
	var explored: Dictionary = _map_view.explored_tiles
	var units = _player_units()
	if units.is_empty():
		return Vector2i(-999, -999)
	var start_pos := _extract_hex_pos(units[0].get("pos", {}))
	if start_pos.x < -900:
		return Vector2i(-999, -999)
	for r in range(1, 4):
		for q in range(-r, r + 1):
			for s in range(-r, r + 1):
				if abs(q + s) > r:
					continue
				var hex := Vector2i(start_pos.x + q, start_pos.y + s)
				if not explored.has(hex):
					return hex
	return Vector2i(-999, -999)


func _player_units() -> Array:
	var units = _snapshot.get("units", [])
	if typeof(units) != TYPE_ARRAY:
		return []
	var out: Array = []
	for u in units:
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = u
		if _extract_player_id(ud.get("owner", -1)) == _my_player_id:
			out.append(ud)
	return out


func _unit_can_found_city(type_id: int) -> bool:
	var rules = _unit_rules_by_id.get(type_id, {})
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		return bool(rules.get("can_found_city", false))
	return false


func _unit_is_worker(type_id: int) -> bool:
	var rules = _unit_rules_by_id.get(type_id, {})
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		return bool(rules.get("is_worker", false))
	return false


func _extract_player_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("0"):
			return int(d.get("0", -1))
	return int(value)


func _parse_player_id(value: Variant) -> int:
	return _extract_player_id(value)


func _parse_runtime_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
	return int(value)


func _extract_type_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
	return int(value)


func _extract_hex_pos(value: Variant) -> Vector2i:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		return Vector2i(int(d.get("q", -999)), int(d.get("r", -999)))
	return Vector2i(-999, -999)


func _neighbor_hexes(pos: Vector2i) -> Array:
	return [
		Vector2i(pos.x + 1, pos.y),
		Vector2i(pos.x + 1, pos.y - 1),
		Vector2i(pos.x, pos.y - 1),
		Vector2i(pos.x - 1, pos.y),
		Vector2i(pos.x - 1, pos.y + 1),
		Vector2i(pos.x, pos.y + 1),
	]


func _research_selected() -> bool:
	var players = _snapshot.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return false
	for p in players:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var pd: Dictionary = p
		if _extract_player_id(pd.get("id", -1)) != _my_player_id:
			continue
		var research = pd.get("research", null)
		if typeof(research) == TYPE_DICTIONARY:
			var tech_id := _parse_runtime_id(research.get("tech", -1))
			return tech_id >= 0
		return false
	return false


func _tech_name(tech_id: int) -> String:
	var techs = _rules_catalog.get("techs", [])
	if typeof(techs) == TYPE_ARRAY:
		for t in techs:
			if typeof(t) != TYPE_DICTIONARY:
				continue
			var td: Dictionary = t
			if int(td.get("id", -1)) == tech_id:
				return String(td.get("name", "Tech"))
	return "Tech"
