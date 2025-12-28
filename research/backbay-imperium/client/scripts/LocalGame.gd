extends Node
class_name LocalGame

@onready var client: GameClient = $GameClient
@onready var map_view: MapView = $MapView
@onready var hud: GameHUD = $GameHUD
@onready var research_panel: ResearchPanel = $ResearchPanel
@onready var city_dialog: CityNameDialog = $CityNameDialog

var _pending_found_city_unit_id := -1
var _unit_rules_by_id: Dictionary = {}     # unit_type_id -> RulesCatalogUnitType dict
var _building_rules_by_id: Dictionary = {} # building_id -> RulesCatalogBuilding dict
var _latest_promises: Array = []


func _ready() -> void:
	client.snapshot_loaded.connect(_on_snapshot_loaded)
	client.events_received.connect(_on_events_received)
	client.info_message.connect(_on_info_message)

	map_view.unit_selected.connect(_on_unit_selected)
	map_view.city_selected.connect(_on_city_selected)
	map_view.end_turn_requested.connect(_on_end_turn_pressed)

	hud.end_turn_pressed.connect(_on_end_turn_pressed)
	hud.menu_pressed.connect(_on_menu_pressed)
	hud.found_city_requested.connect(_on_found_city_requested)
	hud.production_selected.connect(_on_production_selected)
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


func _on_snapshot_loaded() -> void:
	hud.set_rules_names(client.rules_names)
	if hud.has_method("set_rules_catalog"):
		hud.set_rules_catalog(client.rules_catalog)
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
	_unit_rules_by_id.clear()
	_building_rules_by_id.clear()

	var catalog: Dictionary = client.rules_catalog
	if catalog.is_empty():
		return

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
	_refresh_top_bar()
	_refresh_promises()
	hud.update_minimap(client.snapshot, client.current_player)

	if map_view.selected_city_id >= 0:
		_refresh_city_panel(map_view.selected_city_id)
	elif map_view.selected_unit_id >= 0:
		_refresh_unit_panel(map_view.selected_unit_id)
	else:
		hud.hide_city_panel()
		hud.hide_unit_panel()


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


func _refresh_unit_panel(unit_id: int) -> void:
	if not client.units.has(unit_id):
		hud.hide_unit_panel()
		return
	var unit: Dictionary = client.units[unit_id]
	hud.show_unit_panel(unit)


func _on_city_selected(city_id: int) -> void:
	_refresh_city_panel(city_id)


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
