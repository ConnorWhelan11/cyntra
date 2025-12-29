extends Node
class_name LocalGame

@onready var client: GameClient = $GameClient
@onready var map_view: MapViewMultiplayer = $MapView
@onready var hud: GameHUD = $GameHUD
@onready var research_panel: ResearchPanel = $ResearchPanel
@onready var city_dialog: CityNameDialog = $CityNameDialog

var _pending_found_city_unit_id := -1
var _terrain_rules_by_id: Dictionary = {}  # terrain_id -> RulesCatalogTerrain dict
var _unit_rules_by_id: Dictionary = {}     # unit_type_id -> RulesCatalogUnitType dict
var _building_rules_by_id: Dictionary = {} # building_id -> RulesCatalogBuilding dict
var _latest_promises: Array = []
var _last_tile_tooltip_hex: Vector2i = Vector2i(-999, -999)
var _tile_tooltip_text: String = ""
var _last_path_preview_unit_id := -1
var _last_path_preview_dest := Vector2i(-999, -999)
var _last_path_preview: Dictionary = {}


func _ready() -> void:
	client.snapshot_loaded.connect(_on_snapshot_loaded)
	client.events_received.connect(_on_events_received)
	client.info_message.connect(_on_info_message)

	map_view.unit_selected.connect(_on_unit_selected)
	map_view.tile_clicked.connect(_on_tile_clicked)
	map_view.unit_action_requested.connect(_on_unit_action_requested)
	map_view.city_action_requested.connect(_on_city_action_requested)
	map_view.set_use_authoritative_visibility(true)

	hud.end_turn_pressed.connect(_on_end_turn_pressed)
	hud.menu_pressed.connect(_on_menu_pressed)
	hud.found_city_requested.connect(_on_found_city_requested)
	hud.production_selected.connect(_on_production_selected)
	hud.cancel_production_requested.connect(_on_cancel_production_requested)
	hud.research_button_pressed.connect(_on_research_button_pressed)
	hud.city_panel_close_requested.connect(_on_city_panel_closed)
	hud.promise_selected.connect(_on_promise_selected)
	hud.share_replay_pressed.connect(_on_share_replay_pressed)
	hud.fortify_requested.connect(_on_fortify_requested)

	research_panel.research_selected.connect(_on_research_selected)
	research_panel.panel_closed.connect(_on_research_panel_closed)

	city_dialog.city_name_confirmed.connect(_on_city_name_confirmed)
	city_dialog.cancelled.connect(_on_city_dialog_cancelled)

	client.new_game(10, 2)


func _process(_delta: float) -> void:
	_update_tile_tooltip()


func _on_snapshot_loaded() -> void:
	hud.set_rules_names(client.rules_names)
	if hud.has_method("set_rules_catalog"):
		hud.set_rules_catalog(client.rules_catalog)
	if map_view.has_method("set_rules_catalog"):
		map_view.set_rules_catalog(client.rules_catalog)
	if map_view.has_method("set_unit_type_names"):
		var unit_types = client.rules_names.get("unit_types", [])
		map_view.set_unit_type_names(unit_types if typeof(unit_types) == TYPE_ARRAY else [])
	if map_view.has_method("set_improvement_names"):
		var impr_names = client.rules_names.get("improvements", [])
		map_view.set_improvement_names(impr_names if typeof(impr_names) == TYPE_ARRAY else [])
	map_view.set_my_player_id(client.current_player)
	map_view.load_snapshot(client.snapshot, true)
	map_view.set_authoritative_visible_tiles(client.get_visible_tiles(client.current_player))
	_auto_select_first_unit()
	_rebuild_rules_indexes()
	_refresh_top_bar()
	_refresh_promises()
	hud.update_minimap(client.snapshot, client.current_player)
	# MapView may auto-select a unit before our rules/catalog are applied; refresh panels now that
	# the HUD has the right rules context.
	if map_view.selected_city_id >= 0:
		_refresh_city_panel(map_view.selected_city_id)
	elif map_view.selected_unit_id >= 0:
		_refresh_unit_panel(map_view.selected_unit_id)


func _rebuild_rules_indexes() -> void:
	_terrain_rules_by_id.clear()
	_unit_rules_by_id.clear()
	_building_rules_by_id.clear()

	var catalog: Dictionary = client.rules_catalog
	if catalog.is_empty():
		return

	var terrains = catalog.get("terrains", [])
	if typeof(terrains) == TYPE_ARRAY:
		for t in terrains:
			if typeof(t) != TYPE_DICTIONARY:
				continue
			var td: Dictionary = t
			var id = _parse_runtime_id(td.get("id", -1))
			if id >= 0:
				_terrain_rules_by_id[id] = td

	var unit_types = catalog.get("unit_types", [])
	if typeof(unit_types) == TYPE_ARRAY:
		for u in unit_types:
			if typeof(u) != TYPE_DICTIONARY:
				continue
			var ud: Dictionary = u
			var id = int(ud.get("id", -1))
			if id >= 0:
				_unit_rules_by_id[id] = ud

	var buildings = catalog.get("buildings", [])
	if typeof(buildings) == TYPE_ARRAY:
		for b in buildings:
			if typeof(b) != TYPE_DICTIONARY:
				continue
			var bd: Dictionary = b
			var id = int(bd.get("id", -1))
			if id >= 0:
				_building_rules_by_id[id] = bd


func _on_events_received(_events: Array) -> void:
	map_view.set_my_player_id(client.current_player)
	map_view.load_snapshot(client.snapshot, false)
	map_view.apply_state_deltas(_events)
	if _events_contains_turn_started(_events):
		map_view.set_authoritative_visible_tiles(client.get_visible_tiles(client.current_player))

	_refresh_top_bar()
	_refresh_promises()
	hud.update_minimap(client.snapshot, client.current_player)

	_handle_completion_and_attention(_events)

	if map_view.selected_city_id >= 0:
		_refresh_city_panel(map_view.selected_city_id)
	elif map_view.selected_unit_id >= 0:
		_refresh_unit_panel(map_view.selected_unit_id)
		_sync_unit_overlays(map_view.selected_unit_id)
	else:
		hud.hide_city_panel()
		hud.hide_unit_panel()


func _handle_completion_and_attention(events: Array) -> void:
	if typeof(events) != TYPE_ARRAY or events.is_empty():
		return

	var focus_tech := false
	var focus_city_id := -1

	for raw in events:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var e: Dictionary = raw
		var t := String(e.get("type", ""))

		match t:
			"TechResearched":
				var player_id := _parse_player_id(e.get("player", -1))
				if player_id != client.current_player:
					continue
				var tech_id := _parse_runtime_id(e.get("tech", -1))
				hud.add_message("Tech researched: %s" % client.tech_name(tech_id))
				focus_tech = true
			"CityProduced":
				var city_id := _extract_entity_id(e.get("city", -1))
				if city_id < 0 or not client.cities.has(city_id):
					continue
				var c: Dictionary = client.cities[city_id]
				if int(c.get("owner", -1)) != client.current_player:
					continue
				var item_name := _format_production_item(e.get("item", null))
				var city_name := String(c.get("name", "City"))
				hud.add_message("%s produced: %s" % [city_name, item_name])
				if focus_city_id < 0:
					focus_city_id = city_id
			"CityGrew":
				var city_id := _extract_entity_id(e.get("city", -1))
				if city_id < 0 or not client.cities.has(city_id):
					continue
				var c: Dictionary = client.cities[city_id]
				if int(c.get("owner", -1)) != client.current_player:
					continue
				var city_name := String(c.get("name", "City"))
				var new_pop := int(e.get("new_pop", 0))
				hud.add_message("%s grew to %d" % [city_name, new_pop])
				if focus_city_id < 0:
					focus_city_id = city_id
			_:
				pass

	# Auto-focus the most relevant promise target so the player stays in the loop.
	if focus_tech:
		_on_research_button_pressed()
	elif focus_city_id >= 0:
		map_view.select_city(focus_city_id)


func _on_info_message(message: String) -> void:
	hud.add_message(message)


func _refresh_top_bar() -> void:
	hud.set_turn_info(client.current_turn, client.current_player, client.current_player, 0)

	var player_data := _player_snapshot(client.current_player)
	var gold = int(player_data.get("gold", 0))

	var research_name := ""
	var research_progress := 0
	var research_total := 0
	var research = player_data.get("research", null)
	if typeof(research) == TYPE_DICTIONARY:
		var r: Dictionary = research
		var tech_id = int(r.get("tech", -1))
		research_name = client.tech_name(tech_id) if tech_id >= 0 else ""
		research_progress = int(r.get("progress", 0))
		research_total = int(r.get("required", 0))

	hud.set_player_resources(gold, research_name, research_progress, research_total)


func _update_tile_tooltip() -> void:
	# City lens tooltips: only show while a city is selected (so yields are explainable, not noisy).
	if map_view.selected_city_id < 0:
		_last_tile_tooltip_hex = Vector2i(-999, -999)
		_tile_tooltip_text = ""
		hud.hide_tooltip()
		return

	var hex: Vector2i = map_view.hovered_hex
	if hex == Vector2i(-999, -999):
		hud.hide_tooltip()
		return

	if not map_view.is_tile_visible(hex):
		hud.hide_tooltip()
		return

	if hex != _last_tile_tooltip_hex:
		_last_tile_tooltip_hex = hex
		var ui: Dictionary = client.get_tile_ui(hex)
		_tile_tooltip_text = _format_tile_ui_tooltip(ui)

	if _tile_tooltip_text.is_empty():
		hud.hide_tooltip()
		return

	hud.show_tooltip(_tile_tooltip_text, get_viewport().get_mouse_position())


func _format_tile_ui_tooltip(tile_ui: Dictionary) -> String:
	if tile_ui.is_empty():
		return ""

	var lines: Array[String] = []
	lines.append(String(tile_ui.get("terrain_name", "Tile")))

	var terrain_id := _parse_runtime_id(tile_ui.get("terrain_id", -1))
	var trules = _terrain_rules_by_id.get(terrain_id, {})
	if typeof(trules) == TYPE_DICTIONARY and not trules.is_empty():
		var move_cost: int = max(1, int(trules.get("move_cost", 1)))
		var defense: int = int(trules.get("defense_bonus", 0))
		lines.append("Move %d  Defense %s%d%%" % [move_cost, "+" if defense > 0 else "", defense])

	var total_yields = tile_ui.get("total_yields", {})
	if typeof(total_yields) == TYPE_DICTIONARY:
		var yd: Dictionary = total_yields
		var parts: Array[String] = []
		parts.append("F%d" % int(yd.get("food", 0)))
		parts.append("P%d" % int(yd.get("production", 0)))
		parts.append("G%d" % int(yd.get("gold", 0)))
		var sci = int(yd.get("science", 0))
		var cul = int(yd.get("culture", 0))
		if sci != 0:
			parts.append("S%d" % sci)
		if cul != 0:
			parts.append("C%d" % cul)
		lines.append("Yields: %s" % " ".join(parts))

	var improvement = tile_ui.get("improvement", null)
	if typeof(improvement) == TYPE_DICTIONARY:
		var impr: Dictionary = improvement
		var label: String = String(impr.get("tier_name", impr.get("name", "Improvement")))
		if bool(impr.get("pillaged", false)):
			label += " (pillaged)"
		lines.append(label)

		var maturation = impr.get("maturation", null)
		if typeof(maturation) == TYPE_DICTIONARY:
			var m: Dictionary = maturation
			lines.append("Matures: %d%% (%d/%d)" % [int(m.get("progress_pct", 0)), int(m.get("worked_turns", 0)), int(m.get("turns_needed", 0))])

	var breakdown = tile_ui.get("yield_breakdown", [])
	if typeof(breakdown) == TYPE_ARRAY and not breakdown.is_empty():
		lines.append("")
		lines.append("Breakdown:")
		for raw in breakdown:
			if typeof(raw) != TYPE_DICTIONARY:
				continue
			var bd: Dictionary = raw
			lines.append("- %s: F%d P%d G%d" % [
				String(bd.get("source", "")),
				int(bd.get("food", 0)),
				int(bd.get("production", 0)),
				int(bd.get("gold", 0)),
			])

	return "\n".join(lines)


func _player_snapshot(player_id: int) -> Dictionary:
	var players = client.snapshot.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return {}

	for p in players:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var d: Dictionary = p
		if int(d.get("id", -1)) == player_id:
			return d
	return {}


func _on_unit_selected(unit_id: int) -> void:
	_refresh_unit_panel(unit_id)
	_sync_unit_overlays(unit_id)


func _refresh_unit_panel(unit_id: int) -> void:
	if not client.units.has(unit_id):
		hud.hide_unit_panel()
		return
	var unit: Dictionary = client.units[unit_id]
	hud.show_unit_panel(unit)


func _on_city_selected(city_id: int) -> void:
	_refresh_city_panel(city_id)

func _on_city_action_requested(city_id: int, action: String) -> void:
	match action:
		"select":
			_on_city_selected(city_id)
		_:
			pass

func _on_tile_clicked(hex_pos: Vector2i, button: int) -> void:
	if button != MOUSE_BUTTON_LEFT:
		return

	var md: Dictionary = client.snapshot.get("map", {})
	var width := int(md.get("width", 0))
	var height := int(md.get("height", 0))
	if width <= 0 or height <= 0:
		return
	if hex_pos.x < 0 or hex_pos.x >= width or hex_pos.y < 0 or hex_pos.y >= height:
		return
	var tiles = md.get("tiles", [])
	if typeof(tiles) != TYPE_ARRAY:
		return
	var idx := hex_pos.y * width + hex_pos.x
	if idx < 0 or idx >= tiles.size():
		return
	var tile = tiles[idx]
	if typeof(tile) != TYPE_DICTIONARY:
		return
	var td: Dictionary = tile
	var imp = td.get("improvement", null)
	if typeof(imp) != TYPE_DICTIONARY:
		var terrain_id := _parse_runtime_id(td.get("terrain", -1))
		if terrain_id >= 0:
			hud.show_terrain_details(terrain_id)
		return
	var impd: Dictionary = imp
	var imp_id := _parse_runtime_id(impd.get("id", -1))
	if imp_id < 0:
		return
	hud.show_improvement_details(imp_id, impd)

func _on_unit_action_requested(unit_id: int, action: String, target: Variant) -> void:
	var hex_target := Vector2i(-999, -999)
	if typeof(target) == TYPE_VECTOR2I:
		hex_target = target
	elif typeof(target) == TYPE_DICTIONARY:
		var d: Dictionary = target
		hex_target = Vector2i(int(d.get("q", 0)), int(d.get("r", 0)))

	match action:
		"end_turn":
			_on_end_turn_pressed()
		"path_preview":
			if hex_target.x < 0:
				return
			var preview := client.get_path_preview(unit_id, hex_target)
			if preview.is_empty():
				return
			_last_path_preview_unit_id = unit_id
			_last_path_preview_dest = hex_target
			_last_path_preview = preview
			map_view.set_path_preview(
				preview.get("full_path", []),
				preview.get("this_turn_path", []),
				preview.get("stop_at", Vector2i(-999, -999))
			)
		"move":
			if hex_target.x < 0:
				return
			var path := _path_for_destination(unit_id, hex_target)
			if path.is_empty():
				return
			client.move_unit(unit_id, path)
		"goto":
			if hex_target.x < 0:
				return
			var path := _path_for_destination(unit_id, hex_target)
			if path.is_empty():
				return
			client.set_goto_orders(unit_id, path)
		"attack":
			if hex_target.x < 0:
				return
			var target_id := _unit_at_hex(hex_target, -1)
			if target_id < 0:
				return
			client.attack_unit(unit_id, target_id)
		"cancel_orders":
			client.cancel_orders(unit_id)
		"fortify":
			_on_fortify_requested(unit_id)
		"found_city":
			_on_found_city_requested()
		_:
			pass

func _path_for_destination(unit_id: int, dest: Vector2i) -> Array[Vector2i]:
	var preview: Dictionary = {}
	if unit_id == _last_path_preview_unit_id and dest == _last_path_preview_dest:
		preview = _last_path_preview
	else:
		preview = client.get_path_preview(unit_id, dest)

	if preview.is_empty():
		return []

	var raw_full = preview.get("full_path", [])
	if typeof(raw_full) != TYPE_ARRAY:
		return []

	var out: Array[Vector2i] = []
	for h in raw_full:
		if typeof(h) == TYPE_VECTOR2I:
			out.append(h)
		elif typeof(h) == TYPE_DICTIONARY:
			out.append(Vector2i(int(h.get("q", 0)), int(h.get("r", 0))))
	return out

func _unit_at_hex(hex: Vector2i, owner_filter: int = -1) -> int:
	for uid in client.units.keys():
		var u: Dictionary = client.units[uid]
		if owner_filter >= 0 and int(u.get("owner", -1)) != owner_filter:
			continue
		var pos_data = u.get("pos", {})
		if typeof(pos_data) != TYPE_DICTIONARY:
			continue
		var pos := Vector2i(int(pos_data.get("q", -999)), int(pos_data.get("r", -999)))
		if pos == hex:
			return int(uid)
	return -1

func _sync_unit_overlays(unit_id: int) -> void:
	if not client.units.has(unit_id):
		map_view.set_movement_range([])
		map_view.set_enemy_zoc([])
		return

	map_view.set_movement_range(client.get_movement_range(unit_id))
	map_view.set_enemy_zoc(client.get_enemy_zoc(client.current_player))

func _events_contains_turn_started(events: Array) -> bool:
	for raw in events:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var e: Dictionary = raw
		if String(e.get("type", "")) == "TurnStarted":
			return true
	return false

func _auto_select_first_unit() -> void:
	if map_view.get_selected_unit_id() >= 0 or map_view.get_selected_city_id() >= 0:
		return
	for uid in client.units.keys():
		var u: Dictionary = client.units[uid]
		if int(u.get("owner", -1)) != client.current_player:
			continue
		map_view.select_unit(int(uid))
		_center_map_on_unit(int(uid))
		return

func _center_map_on_unit(unit_id: int) -> void:
	var u = client.units.get(unit_id, null)
	if typeof(u) != TYPE_DICTIONARY:
		return
	var ud: Dictionary = u
	var pos_data = ud.get("pos", {})
	if typeof(pos_data) != TYPE_DICTIONARY:
		return
	var hex := Vector2i(int(pos_data.get("q", -999)), int(pos_data.get("r", -999)))
	if hex.x < 0:
		return
	map_view.center_on_hex(hex)


func _refresh_city_panel(city_id: int) -> void:
	var city_ui := client.get_city_ui(city_id)
	if city_ui.is_empty():
		hud.hide_city_panel()
		return

	var raw_options := client.get_production_options(city_id)
	var options: Array = []
	for opt in raw_options:
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
		var item_id = int(item_dict.get(kind, -1))
		if item_id < 0:
			continue

		var name := "Unknown"
		var cost := 0
		if kind == "Unit":
			name = client.unit_type_name(item_id)
			var rules = _unit_rules_by_id.get(item_id, {})
			if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
				cost = int(rules.get("cost", 0))
		elif kind == "Building":
			name = client.building_name(item_id)
			var rules = _building_rules_by_id.get(item_id, {})
			if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
				cost = int(rules.get("cost", 0))
		else:
			continue

		options.append({
			"type": kind.to_lower(),
			"id": item_id,
			"name": name,
			"cost": cost,
		})

	hud.show_city_panel(city_ui, options)


func _on_end_turn_pressed() -> void:
	if _gate_end_turn_if_action_required():
		return
	client.end_turn()

func _on_share_replay_pressed() -> void:
	var json := client.export_replay_json()
	if json == "":
		hud.add_message("Replay export failed")
		return
	DisplayServer.clipboard_set(json)
	hud.add_message("Replay copied to clipboard (%d chars)" % json.length())


func _on_menu_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/Main.tscn")


func _on_found_city_requested() -> void:
	var unit_id := map_view.selected_unit_id
	if unit_id < 0:
		return
	if not client.units.has(unit_id):
		return

	# Safety check: only allow if this unit can found cities per the rules catalog.
	var u: Dictionary = client.units[unit_id]
	var type_data = u.get("type_id", -1)
	var type_id := -1
	if typeof(type_data) == TYPE_DICTIONARY:
		type_id = int(type_data.get("raw", -1))
	else:
		type_id = int(type_data)
	var rules = _unit_rules_by_id.get(type_id, {})
	if typeof(rules) != TYPE_DICTIONARY or not bool(rules.get("can_found_city", false)):
		hud.add_message("Selected unit can't found a city")
		return

	_pending_found_city_unit_id = unit_id
	city_dialog.open()


func _on_city_name_confirmed(name: String) -> void:
	if _pending_found_city_unit_id < 0:
		return
	var events := client.found_city(_pending_found_city_unit_id, name)
	_pending_found_city_unit_id = -1

	var founded_city_id := -1
	for e in events:
		if typeof(e) != TYPE_DICTIONARY:
			continue
		var ev: Dictionary = e
		if String(ev.get("type", "")) == "CityFounded":
			founded_city_id = int(ev.get("city", -1))
			break

	if founded_city_id >= 0:
		hud.add_message("City founded")
		if map_view.has_method("select_city"):
			map_view.select_city(founded_city_id)
	else:
		hud.add_message("Failed to found city")


func _on_city_dialog_cancelled() -> void:
	_pending_found_city_unit_id = -1


func _on_production_selected(item_type: String, item_id: int) -> void:
	var city_id := map_view.selected_city_id
	if city_id < 0:
		return
	client.set_production(city_id, item_type, item_id)
	_refresh_city_panel(city_id)


func _on_cancel_production_requested() -> void:
	var city_id := map_view.selected_city_id
	if city_id < 0:
		return
	client.cancel_production(city_id)
	_refresh_city_panel(city_id)

func _on_fortify_requested(unit_id: int) -> void:
	var unit_data = client.units.get(unit_id, null)
	if typeof(unit_data) != TYPE_DICTIONARY:
		# Fall back to snapshot scan.
		for u in client.snapshot.get("units", []):
			if typeof(u) != TYPE_DICTIONARY:
				continue
			var ud: Dictionary = u
			if _extract_entity_id(ud.get("id", -1)) == unit_id:
				unit_data = ud
				break

	if typeof(unit_data) != TYPE_DICTIONARY:
		return

	var unit: Dictionary = unit_data
	if int(unit.get("owner", -1)) != client.current_player:
		hud.add_message("Not your unit")
		return

	client.fortify_unit(unit_id)


func _on_city_panel_closed() -> void:
	map_view.selected_city_id = -1


func _on_research_button_pressed() -> void:
	if research_panel.has_method("set_catalog"):
		if not client.rules_catalog.is_empty():
			research_panel.set_catalog(client.rules_catalog)
		else:
			research_panel.set_catalog(client.get_tech_options(client.current_player))

	var player_data := _player_snapshot(client.current_player)
	var known: Array = []
	var raw_known = player_data.get("known_techs", [])
	if typeof(raw_known) == TYPE_ARRAY:
		known = raw_known

	var researching_id := -1
	var progress := 0
	var required := 0
	var research = player_data.get("research", null)
	if typeof(research) == TYPE_DICTIONARY:
		var r: Dictionary = research
		researching_id = int(r.get("tech", -1))
		progress = int(r.get("progress", 0))
		required = int(r.get("required", 0))

	research_panel.update_state(known, researching_id, progress, required)
	research_panel.open()


func _on_research_selected(tech_id: int) -> void:
	client.set_research(tech_id)
	_refresh_top_bar()


func _on_research_panel_closed() -> void:
	pass

func _refresh_promises() -> void:
	if not hud.has_method("set_promises"):
		return
	var raw_promises := client.get_promise_strip(client.current_player)
	_latest_promises = raw_promises
	var city_names := _city_name_lookup()

	var enriched: Array = []
	for p in raw_promises:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		var d: Dictionary = p.duplicate(true)
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
	_apply_end_turn_gate_from_promises(raw_promises)

func _apply_end_turn_gate_from_promises(promises: Array) -> void:
	if not hud.has_method("set_end_turn_blocked"):
		return

	var blocked := false
	var reason := ""
	for raw in promises:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var p: Dictionary = raw
		var t := String(p.get("type", ""))
		if t == "TechPickRequired":
			blocked = true
			reason = "Choose Tech"
			break
		if t == "CityProductionPickRequired":
			blocked = true
			reason = "Choose Prod"
			break

	hud.set_end_turn_blocked(blocked, reason)

func _city_name_lookup() -> Dictionary:
	var out: Dictionary = {}
	for c in client.snapshot.get("cities", []):
		if typeof(c) != TYPE_DICTIONARY:
			continue
		var cd: Dictionary = c
		var city_id = _extract_entity_id(cd.get("id", -1))
		if city_id >= 0:
			out[city_id] = String(cd.get("name", "City"))
	return out

func _extract_entity_id(data: Variant) -> int:
	if typeof(data) == TYPE_DICTIONARY:
		var d: Dictionary = data
		if d.has("raw"):
			return int(d.get("raw", 0))
	return int(data)

func _parse_runtime_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
	return int(value)

func _parse_player_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("0"):
			return int(d.get("0", -1))
	return int(value)

func _format_production_item(item: Variant) -> String:
	if typeof(item) != TYPE_DICTIONARY:
		return "Production"

	var d: Dictionary = item
	var keys: Array = d.keys()
	if keys.is_empty():
		return "Production"

	var kind := String(keys[0])
	var item_id := _parse_runtime_id(d.get(kind, -1))
	match kind:
		"Unit":
			return client.unit_type_name(item_id)
		"Building":
			return client.building_name(item_id)
		_:
			return kind

func _on_promise_selected(promise: Dictionary) -> void:
	var t = String(promise.get("type", ""))
	match t:
		"TechPickRequired", "ResearchComplete":
			_on_research_button_pressed()
		"CityProductionPickRequired", "CityProduction":
			var city_id = _extract_entity_id(promise.get("city", -1))
			if city_id >= 0:
				map_view.select_city(city_id)
		_:
			pass

func _gate_end_turn_if_action_required() -> bool:
	# Gate end turn if the sim says the player has required choices.
	var promises: Array = _latest_promises
	if promises.is_empty():
		promises = client.get_promise_strip(client.current_player)

	for raw in promises:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var p: Dictionary = raw
		var t := String(p.get("type", ""))
		match t:
			"TechPickRequired":
				hud.add_message("Pick a technology before ending turn")
				_on_research_button_pressed()
				return true
			"CityProductionPickRequired":
				var city_id = _extract_entity_id(p.get("city", -1))
				hud.add_message("Pick production before ending turn")
				if city_id >= 0:
					map_view.select_city(city_id)
				return true
			_:
				pass

	return false
