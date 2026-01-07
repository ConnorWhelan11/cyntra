extends Node2D
class_name MapViewMultiplayer

## Enhanced MapView for both local and multiplayer games.
## Renders terrain tiles, units, cities, and handles input.

# RulesPalette and TextureLoader are global classes (class_name), no preload needed

signal unit_selected(unit_id: int)
signal tile_clicked(hex: Vector2i, button: int)
signal unit_action_requested(unit_id: int, action: String, target: Variant)
signal city_action_requested(city_id: int, action: String)

const HEX_SIZE := 36.0

# Overlay colors
const COLOR_TILE_OUTLINE := Color(0.2, 0.2, 0.25, 0.6)
const COLOR_HOVER_OUTLINE := Color(1.0, 1.0, 1.0, 0.9)
const COLOR_RANGE_FILL := Color(0.2, 0.55, 1.0, 0.25)
const COLOR_PATH_LINE := Color(1.0, 0.9, 0.3, 0.9)
const COLOR_PATH_LINE_REMAINDER := Color(1.0, 0.9, 0.3, 0.25)
const COLOR_PATH_STOP_MARKER := Color(1.0, 1.0, 1.0, 0.9)
const COLOR_ZOC_OUTLINE := Color(1.0, 0.25, 0.25, 0.9)
const _COLOR_ORDERS_LINE := Color(0.55, 0.8, 1.0, 0.85)
const COLOR_RIVER_LINE := Color(0.25, 0.65, 1.0, 0.75)
const COLOR_REVEAL_PING := Color(1.0, 0.85, 0.3, 0.9)
const DEBUG_3D_LOGS := true

# Unit colors
const COLOR_UNIT_FRIEND := Color(0.25, 0.9, 0.35, 1.0)
const COLOR_UNIT_ENEMY := Color(0.95, 0.35, 0.35, 1.0)
const COLOR_UNIT_NEUTRAL := Color(0.7, 0.7, 0.7, 1.0)
const COLOR_UNIT_SELECTED := Color(1.0, 1.0, 1.0, 0.95)

# City colors
const COLOR_CITY_FRIEND := Color(0.3, 0.7, 1.0, 1.0)
const COLOR_CITY_ENEMY := Color(1.0, 0.4, 0.3, 1.0)
const COLOR_CITY_BORDER := Color(0.0, 0.0, 0.0, 0.8)

const COLOR_IMPROVEMENT_PILLAGED := Color(0.95, 0.35, 0.35, 0.95)

# Map state
var map_width := 0
var map_height := 0
var wrap_horizontal := true
var tiles: Array = []  # Array of tile data
var origin := Vector2.ZERO

# Entity state
var units: Dictionary = {}  # unit_id -> unit data
var cities: Dictionary = {}  # city_id -> city data

# Animation state
var _unit_prev_positions: Dictionary = {}  # unit_id -> Vector2i (previous hex position)
var _unit_anim_offsets: Dictionary = {}    # unit_id -> Vector2 (pixel offset from current pos)
var _unit_tweens: Dictionary = {}          # unit_id -> Tween
const UNIT_MOVE_DURATION := 0.25           # seconds per hop

# Fog of War state
var fog_enabled := true
var use_authoritative_visibility := false
var explored_tiles: Dictionary = {}        # Vector2i -> bool (ever seen)
var visible_tiles: Dictionary = {}         # Vector2i -> bool (currently visible)
var remembered_units: Dictionary = {}      # Vector2i -> unit data (last known)
var remembered_cities: Dictionary = {}     # Vector2i -> city data (last known)
const SIGHT_RANGE := 2                     # Default unit sight range
const CITY_SIGHT_RANGE := 3                # Cities see further
const UNKNOWN_TERRAIN_RAW := 65535         # Matches server-side fog terrain sentinel

# Game state
var current_turn := 0
var current_player := 0
var my_player_id := 0
var _unit_type_names: Array = []
var _improvement_names: Array = []
var _palette: RulesPalette = RulesPalette.new()
var _tex_loader: TextureLoader = TextureLoader.new()
var _terrain_yields_by_id: Dictionary = {} # terrain_id -> UiYields dict
var _improvement_tier_yields_by_id: Dictionary = {} # improvement_id -> Array[UiYields dict]
var _resource_yields_by_id: Dictionary = {} # resource_id -> UiYields dict (optional)
var _resource_requires_improvement_by_id: Dictionary = {} # resource_id -> improvement_id
var _resource_revealed_by_tech_by_id: Dictionary = {} # resource_id -> tech_id
var _my_known_techs: Dictionary = {} # tech_id -> true (set)
var _last_3d_sync_count: int = -1

# Rendering mode: "sprites" uses terrain textures, "colors" uses polygon fills
var render_mode := "sprites"

# Selection state
var selected_unit_id: int = -1
var selected_city_id: int = -1
var hovered_hex: Vector2i = Vector2i(-999, -999)

# Movement overlays
var movement_range: Dictionary = {}
var enemy_zoc_tiles: Dictionary = {}
var path_preview_full: Array = []
var path_preview_this_turn: Array = []
var path_preview_stop_at: Vector2i = Vector2i(-999, -999)
var _last_preview_request_unit_id: int = -1
var _last_preview_request_hex: Vector2i = Vector2i(-999, -999)

# Display options
var show_grid := true
var show_resources := true
var show_yields := false
var show_zoc_overlay := true
var use_3d_units := false  # Default to reliable 2D units; press U to toggle 3D.
var use_3d_terrain := false
var reveal_ping_enabled := true
var _reveal_pings: Dictionary = {} # Vector2i -> seconds remaining
const REVEAL_PING_DURATION := 2.5

# Camera control
var camera_offset := Vector2.ZERO
var zoom_level := 1.0
const MIN_ZOOM := 0.5
const MAX_ZOOM := 2.0

# 3D unit layer reference (set by LocalGame)
var unit_3d_layer: Unit3DLayer = null

# 3D terrain layer reference (set by LocalGame)
var terrain_3d_layer: Terrain3DLayer = null


func _ready() -> void:
	_recenter()

func _update_reveal_pings(delta: float) -> bool:
	if _reveal_pings.is_empty():
		return false
	var to_remove: Array = []
	for hex in _reveal_pings.keys():
		var remaining := float(_reveal_pings.get(hex, 0.0)) - delta
		if remaining <= 0.0:
			to_remove.append(hex)
		else:
			_reveal_pings[hex] = remaining
	for hex in to_remove:
		_reveal_pings.erase(hex)
	return not to_remove.is_empty() or not _reveal_pings.is_empty()


func _process(delta: float) -> void:
	if _ui_wants_keyboard_input():
		return

	# Camera panning with arrow keys
	var pan_speed := 400.0 * delta / zoom_level
	var panned := false
	if Input.is_action_pressed("ui_left"):
		camera_offset.x += pan_speed
		panned = true
	if Input.is_action_pressed("ui_right"):
		camera_offset.x -= pan_speed
		panned = true
	if Input.is_action_pressed("ui_up"):
		camera_offset.y += pan_speed
		panned = true
	if Input.is_action_pressed("ui_down"):
		camera_offset.y -= pan_speed
		panned = true
	var ping_changed := _update_reveal_pings(delta)
	if panned or ping_changed:
		_sync_3d_camera()
		queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if map_width <= 0 or map_height <= 0:
		return

	if (event is InputEventMouseButton \
		or event is InputEventMouseMotion \
		or event is InputEventMagnifyGesture \
		or event is InputEventPanGesture) \
		and _ui_wants_pointer_input():
		return

	if event is InputEventKey and _ui_wants_keyboard_input():
		return

	# Mouse motion - update hover
	if event is InputEventMouseMotion:
		var hex := _mouse_hex()
		if hex != hovered_hex:
			hovered_hex = hex
			_update_path_preview()
			queue_redraw()
		return

	# Mouse wheel - zoom
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			zoom_level = min(zoom_level * 1.1, MAX_ZOOM)
			_sync_3d_camera()
			queue_redraw()
			get_viewport().set_input_as_handled()
			return
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			zoom_level = max(zoom_level / 1.1, MIN_ZOOM)
			_sync_3d_camera()
			queue_redraw()
			get_viewport().set_input_as_handled()
			return

	# Touchpad pinch zoom (macOS/trackpad gesture)
	if event is InputEventMagnifyGesture:
		var magnify: InputEventMagnifyGesture = event
		var new_zoom := zoom_level * magnify.factor
		zoom_level = clamp(new_zoom, MIN_ZOOM, MAX_ZOOM)
		_sync_3d_camera()
		queue_redraw()
		get_viewport().set_input_as_handled()
		return

	# Touchpad pan gesture
	if event is InputEventPanGesture:
		var pan: InputEventPanGesture = event
		camera_offset -= pan.delta * 10.0 / zoom_level
		_sync_3d_camera()
		queue_redraw()
		get_viewport().set_input_as_handled()
		return

	# Mouse click
	if event is InputEventMouseButton and event.pressed:
		var hex := _mouse_hex()
		if not _hex_in_map(hex):
			return

		# Right click - issue move/goto
		if event.button_index == MOUSE_BUTTON_RIGHT:
			_handle_right_click(hex)
			get_viewport().set_input_as_handled()
			return

		# Left click - select or action
		if event.button_index == MOUSE_BUTTON_LEFT:
			_handle_left_click(hex, event.shift_pressed)
			get_viewport().set_input_as_handled()
			return

	# Keyboard shortcuts
	if event is InputEventKey and event.pressed:
		if event.is_action_pressed("bb_cancel_orders"):
			if selected_unit_id >= 0:
				unit_action_requested.emit(selected_unit_id, "cancel_orders", null)
			else:
				_deselect_all()
			get_viewport().set_input_as_handled()
			return
		match event.keycode:
			KEY_TAB:
				_cycle_unit()
				get_viewport().set_input_as_handled()
			KEY_SPACE, KEY_ENTER:
				unit_action_requested.emit(selected_unit_id, "end_turn", null)
				get_viewport().set_input_as_handled()
			KEY_ESCAPE:
				_deselect_all()
				get_viewport().set_input_as_handled()
			KEY_F:
				if selected_unit_id >= 0:
					unit_action_requested.emit(selected_unit_id, "fortify", null)
				get_viewport().set_input_as_handled()
			KEY_B:
				if selected_unit_id >= 0:
					unit_action_requested.emit(selected_unit_id, "found_city", null)
				get_viewport().set_input_as_handled()
			KEY_G:
				show_grid = not show_grid
				queue_redraw()
				get_viewport().set_input_as_handled()
			KEY_R:
				show_resources = not show_resources
				queue_redraw()
				get_viewport().set_input_as_handled()
			KEY_Y:
				show_yields = not show_yields
				queue_redraw()
				get_viewport().set_input_as_handled()
			KEY_Z:
				show_zoc_overlay = not show_zoc_overlay
				queue_redraw()
				get_viewport().set_input_as_handled()
			KEY_V:
				fog_enabled = not fog_enabled
				_sync_units_to_3d()  # Refresh 3D units for fog change
				queue_redraw()
				get_viewport().set_input_as_handled()
			KEY_T:
				# Toggle texture/color rendering
				render_mode = "colors" if render_mode == "sprites" else "sprites"
				queue_redraw()
				get_viewport().set_input_as_handled()
			KEY_U:
				# Toggle 3D unit rendering
				use_3d_units = not use_3d_units
				if unit_3d_layer:
					unit_3d_layer.visible = use_3d_units
				if use_3d_units:
					_sync_units_to_3d()
				elif unit_3d_layer:
					unit_3d_layer.clear_all_units()
				queue_redraw()
				get_viewport().set_input_as_handled()
			KEY_HOME:
				_center_on_selection()
				get_viewport().set_input_as_handled()


func _handle_left_click(hex: Vector2i, shift: bool) -> void:
	# 3D pick: prioritize clicking visible unit models.
	if use_3d_units and unit_3d_layer:
		var picked_unit := unit_3d_layer.pick_unit(get_viewport().get_mouse_position())
		if picked_unit >= 0:
			var picked_hex := _unit_pos(picked_unit)
			if _hex_in_map(picked_hex):
				hex = picked_hex

	# Check for city at hex
	var city_id := _city_at_hex(hex)
	if city_id >= 0:
		var city = cities.get(city_id, {})
		if city.get("owner", -1) == my_player_id:
			_select_city(city_id)
			return

	# Check for unit at hex
	var unit_id := _unit_at_hex(hex, my_player_id)
	if unit_id >= 0:
		_select_unit(unit_id)
		return

	# If we have a unit selected, try to move
	if selected_unit_id >= 0:
		# Click-to-attack: if you have a unit selected and click an adjacent enemy unit.
		if not shift:
			var target_id := _unit_at_hex(hex, -1)
			if target_id >= 0 and units.has(target_id):
				var target: Dictionary = units[target_id]
				var owner := -1
				var owner_data = target.get("owner", {})
				if typeof(owner_data) == TYPE_DICTIONARY:
					owner = int(owner_data.get("0", -1))
				else:
					owner = int(owner_data)

				if owner != my_player_id:
					var attacker_pos := _unit_pos(selected_unit_id)
					if _is_neighbor(attacker_pos, hex):
						unit_action_requested.emit(selected_unit_id, "attack", hex)
						return

		if shift:
			# Shift+click = goto orders
			unit_action_requested.emit(selected_unit_id, "goto", hex)
		else:
			# Regular click = move this turn
			unit_action_requested.emit(selected_unit_id, "move", hex)
		return

	# Just emit tile click
	tile_clicked.emit(hex, MOUSE_BUTTON_LEFT)


func _handle_right_click(hex: Vector2i) -> void:
	if selected_unit_id >= 0:
		# Right click = goto orders
		unit_action_requested.emit(selected_unit_id, "goto", hex)
		return

	tile_clicked.emit(hex, MOUSE_BUTTON_RIGHT)


func _select_unit(unit_id: int) -> void:
	selected_unit_id = unit_id
	selected_city_id = -1
	_update_overlays()
	unit_selected.emit(unit_id)
	queue_redraw()


func _select_city(city_id: int) -> void:
	selected_city_id = city_id
	selected_unit_id = -1
	movement_range.clear()
	enemy_zoc_tiles.clear()
	path_preview_full.clear()
	path_preview_this_turn.clear()
	path_preview_stop_at = Vector2i(-999, -999)
	city_action_requested.emit(city_id, "select")
	queue_redraw()


func _deselect_all() -> void:
	selected_unit_id = -1
	selected_city_id = -1
	movement_range.clear()
	enemy_zoc_tiles.clear()
	path_preview_full.clear()
	path_preview_this_turn.clear()
	path_preview_stop_at = Vector2i(-999, -999)
	queue_redraw()


func _cycle_unit() -> void:
	var my_units: Array[int] = []
	for uid in units.keys():
		var u = units[uid]
		if u.get("owner", -1) == my_player_id:
			my_units.append(int(uid))

	if my_units.is_empty():
		return

	my_units.sort()
	var idx := my_units.find(selected_unit_id)
	var next_idx = (idx + 1) % my_units.size()
	_select_unit(my_units[next_idx])
	_center_on_selection()


func _center_on_selection() -> void:
	var hex: Vector2i
	if selected_unit_id >= 0:
		hex = _unit_pos(selected_unit_id)
	elif selected_city_id >= 0:
		hex = _city_pos(selected_city_id)
	else:
		return

	if not _hex_in_map(hex):
		return

	var vp := get_viewport_rect().size
	var target_center := HexMath.axial_to_pixel(hex, Vector2.ZERO, HEX_SIZE * zoom_level)
	camera_offset = vp * 0.5 - target_center
	_sync_3d_camera()
	queue_redraw()


# -------------------------------------------------------------------------
# State Update Methods
# -------------------------------------------------------------------------

func load_snapshot(snapshot: Dictionary, full_resync: bool = false) -> void:
	var map_data: Dictionary = snapshot.get("map", {})
	var new_width = int(map_data.get("width", 0))
	var new_height = int(map_data.get("height", 0))
	var new_wrap = bool(map_data.get("wrap_horizontal", true))
	var map_changed := (new_width != map_width) or (new_height != map_height) or (new_wrap != wrap_horizontal)

	map_width = new_width
	map_height = new_height
	wrap_horizontal = new_wrap
	tiles = map_data.get("tiles", [])

	current_turn = int(snapshot.get("turn", 0))
	var current_player_data = snapshot.get("current_player", 0)
	if typeof(current_player_data) == TYPE_DICTIONARY:
		current_player = int(current_player_data.get("0", 0))
	else:
		current_player = int(current_player_data)

	# Save previous unit positions before loading new ones
	var old_positions: Dictionary = {}
	for uid in units.keys():
		old_positions[uid] = _unit_pos(int(uid))

	# Load units
	units.clear()
	for unit_data in snapshot.get("units", []):
		if typeof(unit_data) == TYPE_DICTIONARY:
			var uid = unit_data.get("id", {})
			var unit_id: int
			if typeof(uid) == TYPE_DICTIONARY:
				# EntityId format: {generation, index}
				unit_id = int(uid.get("index", 0)) + int(uid.get("generation", 0)) * 10000
			else:
				unit_id = int(uid)
			units[unit_id] = unit_data

	# Animate units that moved
	_animate_unit_movements(old_positions)

	# Load cities
	cities.clear()
	for city_data in snapshot.get("cities", []):
		if typeof(city_data) == TYPE_DICTIONARY:
			var cid = city_data.get("id", {})
			var city_id: int
			if typeof(cid) == TYPE_DICTIONARY:
				city_id = int(cid.get("index", 0)) + int(cid.get("generation", 0)) * 10000
			else:
				city_id = int(cid)
			cities[city_id] = city_data

	# Track my known techs for rules-driven reveal gating (single-player uses full snapshots).
	_my_known_techs.clear()
	var players_data = snapshot.get("players", [])
	if typeof(players_data) == TYPE_ARRAY:
		for p in players_data:
			if typeof(p) != TYPE_DICTIONARY:
				continue
			var pd: Dictionary = p
			if _parse_entity_id(pd.get("id", -1)) != my_player_id:
				continue
			var raw_known = pd.get("known_techs", [])
			if typeof(raw_known) == TYPE_ARRAY:
				for t in raw_known:
					var tid := _parse_runtime_id(t)
					if tid >= 0:
						_my_known_techs[tid] = true
			break

	if map_changed:
		_recenter()
		if unit_3d_layer:
			unit_3d_layer.set_map_dimensions(map_width, map_height)
		_reveal_pings.clear()
	elif full_resync:
		_reveal_pings.clear()

	# Seed explored tiles from the authoritative snapshot (unexplored tiles use a sentinel terrain id).
	if use_authoritative_visibility and (map_changed or full_resync):
		explored_tiles.clear()
		visible_tiles.clear()
		remembered_units.clear()
		remembered_cities.clear()

		var has_fog_sentinel := false
		for raw_tile in tiles:
			if typeof(raw_tile) != TYPE_DICTIONARY:
				continue
			var td: Dictionary = raw_tile
			var terrain_id := 0
			var terrain_data = td.get("terrain", {})
			if typeof(terrain_data) == TYPE_DICTIONARY:
				terrain_id = int(terrain_data.get("raw", 0))
			elif typeof(terrain_data) == TYPE_INT or typeof(terrain_data) == TYPE_FLOAT:
				terrain_id = int(terrain_data)
			if terrain_id == UNKNOWN_TERRAIN_RAW:
				has_fog_sentinel = true
				break

		# Multiplayer snapshots use UNKNOWN_TERRAIN_RAW for unexplored; local snapshots do not.
		# Only seed explored tiles from terrain data when that sentinel is present.
		if has_fog_sentinel:
			for idx in range(tiles.size()):
				var tile_data: Dictionary = {}
				if typeof(tiles[idx]) == TYPE_DICTIONARY:
					tile_data = tiles[idx]

				var terrain_id := 0
				var terrain_data = tile_data.get("terrain", {})
				if typeof(terrain_data) == TYPE_DICTIONARY:
					terrain_id = int(terrain_data.get("raw", 0))
				elif typeof(terrain_data) == TYPE_INT or typeof(terrain_data) == TYPE_FLOAT:
					terrain_id = int(terrain_data)

				if terrain_id == UNKNOWN_TERRAIN_RAW:
					continue

				var q := idx % map_width
				var r := int(idx / map_width)
				explored_tiles[Vector2i(q, r)] = true

	_validate_selection()
	_update_overlays()
	_update_fog_of_war()
	_sync_3d_camera()
	_sync_units_to_3d()
	queue_redraw()


func set_my_player_id(pid: int) -> void:
	my_player_id = pid


func set_unit_type_names(names: Array) -> void:
	_unit_type_names = names

func set_improvement_names(names: Array) -> void:
	_improvement_names = names


func set_camera_offset(offset: Vector2) -> void:
	camera_offset = offset
	_sync_3d_camera()
	queue_redraw()


func get_camera_offset() -> Vector2:
	return camera_offset


func set_zoom_level(value: float) -> void:
	zoom_level = clampf(value, MIN_ZOOM, MAX_ZOOM)
	_sync_3d_camera()
	queue_redraw()


func get_zoom_level() -> float:
	return zoom_level


func set_unit_3d_layer(layer: Unit3DLayer) -> void:
	"""Set reference to 3D unit rendering layer."""
	unit_3d_layer = layer
	if unit_3d_layer:
		unit_3d_layer.visible = use_3d_units
		unit_3d_layer.set_map_dimensions(map_width, map_height)
		_sync_3d_camera()


func set_terrain_3d_layer(layer: Terrain3DLayer) -> void:
	"""Set reference to 3D terrain rendering layer."""
	terrain_3d_layer = layer
	use_3d_terrain = terrain_3d_layer != null
	if terrain_3d_layer:
		terrain_3d_layer.visible = use_3d_terrain
		terrain_3d_layer.set_map_dimensions(map_width, map_height)
		_sync_3d_camera()


func set_rules_catalog(catalog: Dictionary) -> void:
	_palette.apply_rules_catalog(catalog)
	_tex_loader.apply_rules_catalog(catalog)
	# Also pass unit type info to 3D layer
	if unit_3d_layer:
		var unit_types = catalog.get("unit_types", [])
		unit_3d_layer.apply_unit_types(unit_types)

	_terrain_yields_by_id.clear()
	_improvement_tier_yields_by_id.clear()
	_resource_yields_by_id.clear()
	_resource_requires_improvement_by_id.clear()
	_resource_revealed_by_tech_by_id.clear()

	var terrains = catalog.get("terrains", [])
	if typeof(terrains) == TYPE_ARRAY:
		for t in terrains:
			if typeof(t) != TYPE_DICTIONARY:
				continue
			var td: Dictionary = t
			var tid := _parse_runtime_id(td.get("id", -1))
			if tid < 0:
				continue
			var y = td.get("yields", {})
			if typeof(y) == TYPE_DICTIONARY:
				_terrain_yields_by_id[tid] = y

	var improvements = catalog.get("improvements", [])
	if typeof(improvements) == TYPE_ARRAY:
		for i in improvements:
			if typeof(i) != TYPE_DICTIONARY:
				continue
			var idict: Dictionary = i
			var iid := _parse_runtime_id(idict.get("id", -1))
			if iid < 0:
				continue
			var tiers = idict.get("tiers", [])
			if typeof(tiers) != TYPE_ARRAY:
				continue
			var tier_yields: Array = []
			for tier in tiers:
				if typeof(tier) != TYPE_DICTIONARY:
					continue
				var yd = (tier as Dictionary).get("yields", {})
				if typeof(yd) == TYPE_DICTIONARY:
					tier_yields.append(yd)
			_improvement_tier_yields_by_id[iid] = tier_yields

	var resources = catalog.get("resources", [])
	if typeof(resources) == TYPE_ARRAY:
		for r in resources:
			if typeof(r) != TYPE_DICTIONARY:
				continue
			var rd: Dictionary = r
			var rid := _parse_runtime_id(rd.get("id", -1))
			if rid < 0:
				continue
			var y = rd.get("yields", null)
			if typeof(y) == TYPE_DICTIONARY:
				_resource_yields_by_id[rid] = y
			var req = rd.get("requires_improvement", null)
			if req != null:
				var req_id := _parse_runtime_id(req)
				if req_id >= 0:
					_resource_requires_improvement_by_id[rid] = req_id
			var reveal = rd.get("revealed_by_tech", null)
			if reveal != null:
				var reveal_id := _parse_runtime_id(reveal)
				if reveal_id >= 0:
					_resource_revealed_by_tech_by_id[rid] = reveal_id

	queue_redraw()

func ping_revealed_resources(tech_id: int) -> void:
	if not reveal_ping_enabled:
		return
	if map_width <= 0 or map_height <= 0:
		return
	if tiles.is_empty():
		return

	for idx in range(tiles.size()):
		var tile_data: Dictionary = {}
		if typeof(tiles[idx]) == TYPE_DICTIONARY:
			tile_data = tiles[idx]

		var res_data = tile_data.get("resource", null)
		if res_data == null:
			continue
		var res_id := _parse_runtime_id(res_data)
		if res_id < 0:
			continue
		var reveal_id := int(_resource_revealed_by_tech_by_id.get(res_id, -1))
		if reveal_id != tech_id:
			continue

		var q := idx % map_width
		var r := int(idx / map_width)
		var hex := _normalize_hex(Vector2i(q, r))
		if not explored_tiles.has(hex):
			continue
		_reveal_pings[hex] = REVEAL_PING_DURATION

	queue_redraw()

func set_use_authoritative_visibility(enabled: bool) -> void:
	use_authoritative_visibility = enabled


func set_authoritative_visible_tiles(hexes: Array) -> void:
	if not fog_enabled or not use_authoritative_visibility:
		return
	if map_width <= 0 or map_height <= 0:
		return

	visible_tiles.clear()
	for h in hexes:
		var hex := Vector2i(-999, -999)
		if typeof(h) == TYPE_VECTOR2I:
			hex = h
		elif typeof(h) == TYPE_DICTIONARY:
			hex = Vector2i(int(h.get("q", 0)), int(h.get("r", 0)))
		else:
			continue

		hex = _normalize_hex(hex)
		if _hex_in_map(hex):
			visible_tiles[hex] = true
			explored_tiles[hex] = true

	_update_fog_of_war()
	queue_redraw()

func apply_state_deltas(deltas: Array) -> void:
	if not fog_enabled or map_width <= 0 or map_height <= 0:
		return

	var visibility_changed := false
	for e in deltas:
		if typeof(e) != TYPE_DICTIONARY:
			continue

		var t = String(e.get("type", ""))
		if t == "TileRevealed":
			var hex_data = e.get("hex", {})
			var hex = Vector2i(int(hex_data.get("q", 0)), int(hex_data.get("r", 0)))
			hex = _normalize_hex(hex)
			if _hex_in_map(hex):
				visible_tiles[hex] = true
				explored_tiles[hex] = true
				visibility_changed = true
		elif t == "TileHidden":
			var hex_data = e.get("hex", {})
			var hex = Vector2i(int(hex_data.get("q", 0)), int(hex_data.get("r", 0)))
			hex = _normalize_hex(hex)
			if _hex_in_map(hex):
				visible_tiles.erase(hex)
				visibility_changed = true

	if visibility_changed:
		_update_fog_of_war()
		queue_redraw()


func set_movement_range(hexes: Array) -> void:
	movement_range.clear()
	for h in hexes:
		if typeof(h) == TYPE_VECTOR2I:
			movement_range[h] = true
		elif typeof(h) == TYPE_DICTIONARY:
			movement_range[Vector2i(int(h.get("q", 0)), int(h.get("r", 0)))] = true
	queue_redraw()


func set_path_preview(full_path: Array, this_turn: Array, stop_at: Vector2i) -> void:
	path_preview_full = full_path
	path_preview_this_turn = this_turn
	path_preview_stop_at = stop_at
	queue_redraw()


func set_enemy_zoc(hexes: Array) -> void:
	enemy_zoc_tiles.clear()
	for h in hexes:
		if typeof(h) == TYPE_VECTOR2I:
			enemy_zoc_tiles[h] = true
		elif typeof(h) == TYPE_DICTIONARY:
			enemy_zoc_tiles[Vector2i(int(h.get("q", 0)), int(h.get("r", 0)))] = true
	queue_redraw()


# -------------------------------------------------------------------------
# Drawing
# -------------------------------------------------------------------------

func _draw() -> void:
	if map_width <= 0 or map_height <= 0:
		return

	var effective_origin := origin + camera_offset
	var draw_3d_terrain := use_3d_terrain and terrain_3d_layer != null

	# Draw tiles
	for r in range(map_height):
		for q in range(map_width):
			var hex := Vector2i(q, r)
			var center := HexMath.axial_to_pixel(hex, effective_origin, HEX_SIZE * zoom_level)
			var corners := HexMath.hex_corners(center, HEX_SIZE * zoom_level)

			# Get tile data
			var tile_idx := r * map_width + q
			var tile_data: Dictionary = {}
			if tile_idx < tiles.size() and typeof(tiles[tile_idx]) == TYPE_DICTIONARY:
				tile_data = tiles[tile_idx]

			# Terrain color
			var terrain_id := 0
			var terrain_data = tile_data.get("terrain", {})
			if typeof(terrain_data) == TYPE_DICTIONARY:
				terrain_id = int(terrain_data.get("raw", 0))
			elif typeof(terrain_data) == TYPE_INT or typeof(terrain_data) == TYPE_FLOAT:
				terrain_id = int(terrain_data)

			var fill_color := _palette.terrain_color(terrain_id)

			# Apply fog of war
			var is_visible := visible_tiles.has(hex) or not fog_enabled
			var is_explored := explored_tiles.has(hex) or not fog_enabled

			if not is_explored:
				# Unexplored - draw with subtle variation for visual interest
				var base_dark := Color(0.06, 0.07, 0.10, 1.0)
				# Add subtle per-tile variation based on position
				var noise_val := sin(float(hex.x) * 0.7) * cos(float(hex.y) * 0.9) * 0.03
				fill_color = Color(
					base_dark.r + noise_val,
					base_dark.g + noise_val * 0.8,
					base_dark.b + noise_val * 0.5,
					1.0
				)
				draw_colored_polygon(corners, fill_color)
			elif draw_3d_terrain:
				if not is_visible:
					_draw_fog_overlay(corners, 0.45)
			elif render_mode == "sprites":
				# Try to draw terrain sprite
				var terrain_tex := _tex_loader.terrain_texture(terrain_id)
				if terrain_tex:
					_draw_hex_texture(center, terrain_tex, is_visible)
					# Draw fog overlay for explored but not visible
					if not is_visible:
						_draw_fog_overlay(corners, 0.45)
				else:
					# Fallback to colored polygon
					if not is_visible:
						fill_color = fill_color.darkened(0.35)
					draw_colored_polygon(corners, fill_color)
			else:
				# Colors mode - use colored polygon
				if not is_visible:
					fill_color = fill_color.darkened(0.35)
				draw_colored_polygon(corners, fill_color)

			# Rivers (draw on explored tiles; dim if not visible)
			if is_explored:
				var river_mask := int(tile_data.get("river_edges", 0))
				if river_mask != 0:
					var river_color := COLOR_RIVER_LINE
					if not is_visible:
						river_color = river_color.darkened(0.4)
						river_color.a *= 0.6
					var w := 2.0 * zoom_level
					# Draw all edges; masks are not guaranteed to be mirrored.
					for dir in range(6):
						if (river_mask & (1 << dir)) == 0:
							continue
						var a := corners[dir]
						var b := corners[(dir + 1) % 6]
						draw_line(a, b, river_color, w)

			# Only show overlays on visible/explored tiles
			if not is_explored:
				# Grid lines only for unexplored
				if show_grid:
					var outline := _closed_polyline(corners)
					draw_polyline(outline, Color(0.1, 0.1, 0.15, 0.4), 1.0)
				continue

			# Movement range overlay
			if movement_range.has(hex):
				draw_colored_polygon(corners, COLOR_RANGE_FILL)

			# Enemy ZOC overlay
			if show_zoc_overlay and enemy_zoc_tiles.has(hex):
				var outline := _closed_polyline(corners)
				draw_polyline(outline, COLOR_ZOC_OUTLINE, 2.0 * zoom_level)

			# Grid lines
			if show_grid:
				var outline := _closed_polyline(corners)
				draw_polyline(outline, COLOR_TILE_OUTLINE, 1.0)

			# Resource indicator
			if show_resources:
				var resource_data = tile_data.get("resource", null)
				if resource_data != null:
					var res_id := 0
					if typeof(resource_data) == TYPE_DICTIONARY:
						res_id = int(resource_data.get("raw", 0))
					elif typeof(resource_data) == TYPE_INT or typeof(resource_data) == TYPE_FLOAT:
						res_id = int(resource_data)

					if _is_resource_revealed(res_id):
						var res_color := _palette.resource_color(res_id)
						var lens_color := res_color
						lens_color.a = 0.18
						if not is_visible:
							lens_color.a = 0.08
						draw_colored_polygon(corners, lens_color)

						var res_offset := Vector2(HEX_SIZE * 0.35 * zoom_level, -HEX_SIZE * 0.25 * zoom_level)
						var res_tex := _tex_loader.resource_texture(res_id)
						if res_tex and render_mode == "sprites":
							var icon_size := HEX_SIZE * 0.5 * zoom_level
							var icon_pos := center + res_offset - Vector2(icon_size, icon_size) * 0.5
							draw_texture_rect(res_tex, Rect2(icon_pos, Vector2(icon_size, icon_size)), false)
						else:
							var res_size := HEX_SIZE * 0.18 * zoom_level
							draw_circle(center + res_offset, res_size, res_color)
							var glyph := _resource_glyph(res_id)
							if not glyph.is_empty():
								var font := ThemeDB.fallback_font
								var font_size := int(8 * zoom_level)
								var text_size := font.get_string_size(glyph, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
								var text_color := _contrast_text_color(res_color, 0.95)
								draw_string(
									font,
									center + res_offset + Vector2(-text_size.x / 2, font_size / 3),
									glyph,
									HORIZONTAL_ALIGNMENT_CENTER,
									-1,
									font_size,
									text_color
								)

			# Improvement marker (tier + pillaged)
			if is_visible:
				var improvement = tile_data.get("improvement", null)
				if typeof(improvement) == TYPE_DICTIONARY:
					var impr: Dictionary = improvement
					var impr_id_data = impr.get("id", -1)
					var impr_id := -1
					if typeof(impr_id_data) == TYPE_DICTIONARY:
						impr_id = int(impr_id_data.get("raw", -1))
					else:
						impr_id = int(impr_id_data)

					var tier: int = int(impr.get("tier", 1))
					var pillaged: bool = bool(impr.get("pillaged", false))

					if impr_id >= 0:
						var color := _palette.improvement_color(impr_id)
						var tier_scale: float = float(clampi(tier - 1, 0, 4))
						var base_size: float = HEX_SIZE * zoom_level * (0.2 + 0.05 * tier_scale)

						# Try to draw improvement sprite
						var impr_tex := _tex_loader.improvement_texture(impr_id)
						if impr_tex and render_mode == "sprites":
							var sprite_rect := Rect2(center - Vector2(base_size, base_size), Vector2(base_size * 2, base_size * 2))
							var modulate := Color.WHITE
							if pillaged:
								modulate = Color(0.5, 0.5, 0.5, 0.8)
							draw_texture_rect(impr_tex, sprite_rect, false, modulate)
						else:
							# Fallback: colored circle with glyph
							var radius: float = HEX_SIZE * zoom_level * (0.08 + 0.03 * tier_scale)
							draw_circle(center, radius, color)

							var glyph := _improvement_glyph(impr_id)
							if not glyph.is_empty():
								var font := ThemeDB.fallback_font
								var font_size := int(9 * zoom_level)
								var text_size := font.get_string_size(glyph, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
								var text_color := _contrast_text_color(color, 0.95)
								draw_string(font, center + Vector2(-text_size.x / 2, font_size / 3), glyph, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size, text_color)

						if pillaged:
							var s := HEX_SIZE * zoom_level * 0.16
							draw_line(center + Vector2(-s, -s), center + Vector2(s, s), COLOR_IMPROVEMENT_PILLAGED, 3.0)
							draw_line(center + Vector2(-s, s), center + Vector2(s, -s), COLOR_IMPROVEMENT_PILLAGED, 3.0)

						var badge_text := "T%d" % tier
						var badge_text_color := Color(1, 1, 1, 0.95)
						if pillaged:
							badge_text = "P%d" % tier
							badge_text_color = Color(1.0, 0.4, 0.4, 0.95)
						var badge_pos := center + Vector2(HEX_SIZE * 0.3 * zoom_level, -HEX_SIZE * 0.35 * zoom_level)
						var badge_radius := 7.0 * zoom_level
						draw_circle(badge_pos, badge_radius, Color(0, 0, 0, 0.55))
						var font := ThemeDB.fallback_font
						var font_size := int(8 * zoom_level)
						var text_size := font.get_string_size(badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
						draw_string(
							font,
							badge_pos + Vector2(-text_size.x / 2, font_size / 3),
							badge_text,
							HORIZONTAL_ALIGNMENT_CENTER,
							-1,
							font_size,
							badge_text_color
						)

			# Yield overlay (lens).
			if show_yields and is_visible:
				var yields := _compute_tile_yields(tile_data, terrain_id)
				_draw_yield_label(center, yields)

			# Reveal ping (tech-revealed resources on explored tiles).
			if _reveal_pings.has(hex):
				var remaining := float(_reveal_pings.get(hex, 0.0))
				var t := clampf(remaining / REVEAL_PING_DURATION, 0.0, 1.0)
				var radius := HEX_SIZE * zoom_level * (0.35 + 0.25 * (1.0 - t))
				var ping_color := COLOR_REVEAL_PING
				ping_color.a = 0.15 + 0.45 * t
				draw_arc(center, radius, 0.0, PI * 2.0, 32, ping_color, 2.0 * zoom_level)

			# Tile owner border (if owned)
			var owner = tile_data.get("owner", null)
			if owner != null:
				var owner_id := 0
				if typeof(owner) == TYPE_DICTIONARY:
					owner_id = int(owner.get("0", 0))
				elif typeof(owner) == TYPE_INT or typeof(owner) == TYPE_FLOAT:
					owner_id = int(owner)

				if owner_id >= 0:
					var border_color := _player_color(owner_id).lightened(0.3)
					border_color.a = 0.4
					var outline := _closed_polyline(corners)
					draw_polyline(outline, border_color, 2.0 * zoom_level)

	# Fog edge glow pass - draw soft edges at visibility boundaries
	if fog_enabled:
		_draw_fog_edges(effective_origin)

	# Hover highlight
	if _hex_in_map(hovered_hex):
		var hover_center := HexMath.axial_to_pixel(hovered_hex, effective_origin, HEX_SIZE * zoom_level)
		var hover_corners := HexMath.hex_corners(hover_center, HEX_SIZE * zoom_level)
		var hover_outline := _closed_polyline(hover_corners)
		draw_polyline(hover_outline, COLOR_HOVER_OUTLINE, 2.0 * zoom_level)

		# Hover affordance: highlight attackable enemies.
		if selected_unit_id >= 0 and _is_attackable_enemy_hex(hovered_hex):
			draw_polyline(hover_outline, COLOR_ZOC_OUTLINE, 4.0 * zoom_level)

	# Path preview
	_draw_path_preview(effective_origin)

	# Cities
	_draw_cities(effective_origin)

	# Units
	_draw_units(effective_origin)


func _draw_path_preview(effective_origin: Vector2) -> void:
	if selected_unit_id < 0:
		return

	var unit_hex := _unit_pos(selected_unit_id)
	if not _hex_in_map(unit_hex):
		return

	if path_preview_full.is_empty():
		return

	# This turn path
	if not path_preview_this_turn.is_empty():
		var points := PackedVector2Array()
		points.append(HexMath.axial_to_pixel(unit_hex, effective_origin, HEX_SIZE * zoom_level))
		for h in path_preview_this_turn:
			var hex: Vector2i
			if typeof(h) == TYPE_VECTOR2I:
				hex = h
			elif typeof(h) == TYPE_DICTIONARY:
				hex = Vector2i(int(h.get("q", 0)), int(h.get("r", 0)))
			else:
				continue
			points.append(HexMath.axial_to_pixel(hex, effective_origin, HEX_SIZE * zoom_level))
		draw_polyline(points, COLOR_PATH_LINE, 3.0 * zoom_level)

	# Remaining path (next turns)
	var remaining_start: int = path_preview_this_turn.size()
	if remaining_start < path_preview_full.size():
		var points := PackedVector2Array()
		var start_hex := unit_hex
		if not path_preview_this_turn.is_empty():
			var last = path_preview_this_turn[path_preview_this_turn.size() - 1]
			if typeof(last) == TYPE_VECTOR2I:
				start_hex = last
			elif typeof(last) == TYPE_DICTIONARY:
				start_hex = Vector2i(int(last.get("q", 0)), int(last.get("r", 0)))

		points.append(HexMath.axial_to_pixel(start_hex, effective_origin, HEX_SIZE * zoom_level))
		for i in range(remaining_start, path_preview_full.size()):
			var h = path_preview_full[i]
			var hex: Vector2i
			if typeof(h) == TYPE_VECTOR2I:
				hex = h
			elif typeof(h) == TYPE_DICTIONARY:
				hex = Vector2i(int(h.get("q", 0)), int(h.get("r", 0)))
			else:
				continue
			points.append(HexMath.axial_to_pixel(hex, effective_origin, HEX_SIZE * zoom_level))
		draw_polyline(points, COLOR_PATH_LINE_REMAINDER, 3.0 * zoom_level)

	# Stop marker
	if _hex_in_map(path_preview_stop_at):
		var stop_center := HexMath.axial_to_pixel(path_preview_stop_at, effective_origin, HEX_SIZE * zoom_level)
		draw_circle(stop_center, HEX_SIZE * 0.12 * zoom_level, COLOR_PATH_STOP_MARKER)


func _draw_cities(effective_origin: Vector2) -> void:
	# Draw actual cities
	for city_id in cities.keys():
		var city: Dictionary = cities[city_id]
		var pos := _city_pos(int(city_id))
		if not _hex_in_map(pos):
			continue

		var owner := -1
		var owner_data = city.get("owner", {})
		if typeof(owner_data) == TYPE_DICTIONARY:
			owner = int(owner_data.get("0", -1))
		else:
			owner = int(owner_data)

		# Fog of war visibility check for enemy cities
		var is_visible := visible_tiles.has(pos) or not fog_enabled
		var is_explored := explored_tiles.has(pos) or not fog_enabled

		if owner != my_player_id and not is_explored:
			continue

		var center := HexMath.axial_to_pixel(pos, effective_origin, HEX_SIZE * zoom_level)
		var alpha := 1.0 if is_visible else 0.5

		_draw_single_city(center, city, int(city_id), owner, alpha)

	# Draw remembered enemy cities in explored but not visible tiles
	if fog_enabled:
		for pos in remembered_cities.keys():
			if visible_tiles.has(pos):
				continue  # Skip - real city is visible
			if not explored_tiles.has(pos):
				continue  # Skip - unexplored

			# Check if there's still a city at this position
			var found := false
			for cid in cities.keys():
				if _city_pos(int(cid)) == pos:
					found = true
					break

			if found:
				continue  # Real city exists, it will be drawn above

			var city: Dictionary = remembered_cities[pos]
			var owner := -1
			var owner_data = city.get("owner", {})
			if typeof(owner_data) == TYPE_DICTIONARY:
				owner = int(owner_data.get("0", -1))
			else:
				owner = int(owner_data)

			if owner == my_player_id:
				continue  # Don't show remembered friendly cities

			var center := HexMath.axial_to_pixel(pos, effective_origin, HEX_SIZE * zoom_level)
			_draw_single_city(center, city, -1, owner, 0.5)


func _draw_single_city(center: Vector2, city: Dictionary, city_id: int, owner: int, alpha: float) -> void:
	var color := COLOR_CITY_FRIEND if owner == my_player_id else COLOR_CITY_ENEMY
	color.a *= alpha
	var size := HEX_SIZE * 0.45 * zoom_level

	# Selection highlight (drawn first, behind city)
	if city_id == selected_city_id and city_id >= 0:
		var sel_rect := Rect2(center - Vector2(size * 1.2, size * 1.2), Vector2(size * 2.4, size * 2.4))
		draw_rect(sel_rect, Color.WHITE, false, 2.0 * zoom_level)

	# Try to draw city sprite (use monument as city representation)
	var city_tex := _load_city_sprite()
	if city_tex and render_mode == "sprites":
		var sprite_size := HEX_SIZE * 0.7 * zoom_level
		var sprite_rect := Rect2(center - Vector2(sprite_size, sprite_size) * 0.5, Vector2(sprite_size, sprite_size))

		var modulate := Color.WHITE
		modulate.a = alpha
		if owner != my_player_id:
			modulate = Color(1.0, 0.7, 0.7, alpha)  # Slight red tint for enemy cities

		draw_texture_rect(city_tex, sprite_rect, false, modulate)

		# Owner color border
		var border_rect := Rect2(center - Vector2(sprite_size * 0.55, sprite_size * 0.55), Vector2(sprite_size * 1.1, sprite_size * 1.1))
		draw_rect(border_rect, color, false, 2.0 * zoom_level)
	else:
		# Fallback: City background (square)
		var rect := Rect2(center - Vector2(size, size), Vector2(size * 2, size * 2))
		draw_rect(rect, color)
		var border_color := COLOR_CITY_BORDER
		border_color.a *= alpha
		draw_rect(rect, border_color, false, 2.0 * zoom_level)

		# Population number in center
		var population: int = city.get("population", 1)
		var pop_str := str(population)
		var font := ThemeDB.fallback_font
		var font_size := int(12 * zoom_level)
		var pop_size := font.get_string_size(pop_str, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
		var text_color := Color(1.0, 1.0, 1.0, alpha)
		draw_string(font, center + Vector2(-pop_size.x / 2, font_size / 3), pop_str, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size, text_color)

	# City name (always shown below city)
	var city_name: String = city.get("name", "City")
	var font := ThemeDB.fallback_font
	var font_size := int(12 * zoom_level)
	var text_size := font.get_string_size(city_name, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
	var text_color := Color(1.0, 1.0, 1.0, alpha)
	draw_string(font, center + Vector2(-text_size.x / 2, size + font_size + 2), city_name, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size, text_color)

	# Population badge (shown as small circle with number in sprite mode)
	if render_mode == "sprites":
		var population: int = city.get("population", 1)
		var pop_str := str(population)
		var badge_radius := 8.0 * zoom_level
		var badge_pos := center + Vector2(size * 0.6, -size * 0.6)
		draw_circle(badge_pos, badge_radius, Color(0.1, 0.1, 0.15, 0.9))
		draw_circle(badge_pos, badge_radius, color, false, 1.5)
		var small_font_size := int(9 * zoom_level)
		var pop_size := font.get_string_size(pop_str, HORIZONTAL_ALIGNMENT_CENTER, -1, small_font_size)
		draw_string(font, badge_pos + Vector2(-pop_size.x / 2, small_font_size / 3), pop_str, HORIZONTAL_ALIGNMENT_CENTER, -1, small_font_size, text_color)


func _load_city_sprite() -> Texture2D:
	# Try to load a city/monument sprite for city representation
	var paths := [
		"res://assets/buildings/monument.png",
		"res://assets/buildings/castle.png",
		"res://assets/buildings/walls.png"
	]
	for path in paths:
		if ResourceLoader.exists(path):
			return load(path)
	return null


func _draw_units(effective_origin: Vector2) -> void:
	var marker_alpha := 1.0
	var marker_scale := 1.0
	var hide_2d_units := use_3d_units and unit_3d_layer != null

	# Draw actual units
	for unit_id in units.keys():
		var u: Dictionary = units[unit_id]
		var pos := _unit_pos(int(unit_id))
		if not _hex_in_map(pos):
			continue

		var owner := -1
		var owner_data = u.get("owner", {})
		if typeof(owner_data) == TYPE_DICTIONARY:
			owner = int(owner_data.get("0", -1))
		else:
			owner = int(owner_data)

		# Fog of war visibility check for enemy units
		var is_visible := visible_tiles.has(pos) or not fog_enabled
		if owner != my_player_id and not is_visible:
			continue

		var center := HexMath.axial_to_pixel(pos, effective_origin, HEX_SIZE * zoom_level)

		# Apply animation offset if unit is animating
		if _unit_anim_offsets.has(unit_id):
			center += _unit_anim_offsets[unit_id] * zoom_level

		_draw_single_unit(
			center,
			u,
			int(unit_id),
			owner,
			marker_alpha,
			marker_scale,
			not hide_2d_units
		)

	# Draw remembered enemy units in explored but not visible tiles
	if fog_enabled:
		for pos in remembered_units.keys():
			if visible_tiles.has(pos):
				continue  # Skip - real unit is visible
			if not explored_tiles.has(pos):
				continue  # Skip - unexplored

			var u: Dictionary = remembered_units[pos]
			var owner := -1
			var owner_data = u.get("owner", {})
			if typeof(owner_data) == TYPE_DICTIONARY:
				owner = int(owner_data.get("0", -1))
			else:
				owner = int(owner_data)

			if owner == my_player_id:
				continue  # Don't show remembered friendly units

			var center := HexMath.axial_to_pixel(pos, effective_origin, HEX_SIZE * zoom_level)
			_draw_single_unit(
				center,
				u,
				-1,
				owner,
				0.5 * marker_alpha,
				marker_scale,
				true
			)  # Draw dimmed


func _draw_single_unit(
	center: Vector2,
	u: Dictionary,
	unit_id: int,
	owner: int,
	alpha: float,
	size_scale: float = 1.0,
	draw_sprite: bool = true
) -> void:
	var color := COLOR_UNIT_NEUTRAL
	if owner == my_player_id:
		color = COLOR_UNIT_FRIEND
	elif owner >= 0:
		color = COLOR_UNIT_ENEMY

	color.a *= alpha
	var radius := HEX_SIZE * 0.28 * zoom_level * size_scale

	# Get unit type ID for texture lookup
	var type_id := 0
	var type_data = u.get("type_id", {})
	if typeof(type_data) == TYPE_DICTIONARY:
		type_id = int(type_data.get("raw", 0))
	else:
		type_id = int(type_data)

	# Selection highlight
	if unit_id == selected_unit_id and unit_id >= 0:
		draw_circle(center, radius * 1.4, COLOR_UNIT_SELECTED)

	if draw_sprite:
		# Try to draw unit sprite
		var unit_tex := _tex_loader.unit_texture(type_id)
		if unit_tex and render_mode == "sprites":
			# Draw unit sprite
			var sprite_size := HEX_SIZE * 0.6 * zoom_level * size_scale
			var sprite_rect := Rect2(center - Vector2(sprite_size, sprite_size) * 0.5, Vector2(sprite_size, sprite_size))

			# Tint based on owner
			var modulate := Color.WHITE
			modulate.a = alpha
			if owner != my_player_id and owner >= 0:
				modulate = Color(1.0, 0.7, 0.7, alpha)  # Slight red tint for enemies

			draw_texture_rect(unit_tex, sprite_rect, false, modulate)

			# Owner indicator ring
			draw_arc(center, radius * 1.1, 0, TAU, 32, color, 2.0 * zoom_level)
		else:
			# Fallback: Unit circle with symbol
			draw_circle(center, radius, color)

		var symbol := _unit_symbol(type_id)
		var font := ThemeDB.fallback_font
		var font_size := int(10 * zoom_level)
		var text_size := font.get_string_size(symbol, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
		var text_color := Color(1.0, 1.0, 1.0, alpha)
		draw_string(font, center + Vector2(-text_size.x / 2, font_size / 3), symbol, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size, text_color)

	# HP bar (only for visible units, not remembered)
	if alpha >= 1.0:
		var hp = int(u.get("hp", 100))
		if hp < 100:
			var bar_width := radius * 1.6
			var bar_height := 3.0 * zoom_level
			var bar_y := center.y + radius + 4 * zoom_level
			var bar_start := center.x - bar_width / 2

			# Background
			draw_rect(Rect2(bar_start, bar_y, bar_width, bar_height), Color(0.2, 0.2, 0.2, 0.8))
			# Health
			var hp_color := Color.GREEN if hp > 50 else (Color.YELLOW if hp > 25 else Color.RED)
			draw_rect(Rect2(bar_start, bar_y, bar_width * hp / 100.0, bar_height), hp_color)

		# Movement points indicator
		var moves_left = int(u.get("moves_left", 0))
		if owner == my_player_id and moves_left > 0:
			var dot_radius := 3.0 * zoom_level
			var dot_y := center.y - radius - 5 * zoom_level
			for i in range(min(moves_left, 3)):
				var dot_x := center.x + (i - 1) * dot_radius * 2.5
				draw_circle(Vector2(dot_x, dot_y), dot_radius, Color(0.9, 0.9, 0.3, 0.9))


# -------------------------------------------------------------------------
# Helper Methods
# -------------------------------------------------------------------------

func _recenter() -> void:
	var vp := get_viewport_rect().size
	origin = vp * 0.5
	camera_offset = Vector2.ZERO
	_sync_3d_camera()


func _sync_3d_camera() -> void:
	"""Synchronize 3D layers camera with 2D map view."""
	if unit_3d_layer:
		unit_3d_layer.set_camera_offset(camera_offset)
		unit_3d_layer.set_zoom_level(zoom_level)
	if terrain_3d_layer:
		terrain_3d_layer.set_camera_offset(camera_offset)
		terrain_3d_layer.set_zoom_level(zoom_level)


func _sync_units_to_3d() -> void:
	"""Sync all units to 3D layer for rendering."""
	if not unit_3d_layer or not use_3d_units:
		return

	var unit_data: Array = []
	for unit_id in units.keys():
		var u: Dictionary = units[unit_id]
		var pos := _unit_pos(int(unit_id))
		if not _hex_in_map(pos):
			continue

		# Get owner
		var owner := -1
		var owner_data = u.get("owner", {})
		if typeof(owner_data) == TYPE_DICTIONARY:
			owner = int(owner_data.get("0", -1))
		else:
			owner = int(owner_data)

		# Only sync visible units (apply fog of war)
		var is_visible := visible_tiles.has(pos) or not fog_enabled
		if owner != my_player_id and not is_visible:
			continue

		# Get unit type ID
		var type_id := 0
		var type_data = u.get("type_id", {})
		if typeof(type_data) == TYPE_DICTIONARY:
			type_id = int(type_data.get("raw", 0))
		else:
			type_id = int(type_data)

		unit_data.append({
			"id": int(unit_id),
			"type_id": type_id,
			"owner": owner,
			"position": pos
		})

	unit_3d_layer.sync_units(unit_data)
	if DEBUG_3D_LOGS:
		var count := unit_data.size()
		if count != _last_3d_sync_count:
			_last_3d_sync_count = count
			print("[MapView] Syncing %d units to 3D" % count)


func _validate_selection() -> void:
	if selected_unit_id >= 0 and not units.has(selected_unit_id):
		selected_unit_id = -1
	if selected_city_id >= 0 and not cities.has(selected_city_id):
		selected_city_id = -1


func _update_overlays() -> void:
	movement_range.clear()
	enemy_zoc_tiles.clear()
	path_preview_full.clear()
	path_preview_this_turn.clear()
	path_preview_stop_at = Vector2i(-999, -999)
	_last_preview_request_unit_id = -1
	_last_preview_request_hex = Vector2i(-999, -999)
	# Note: In multiplayer, overlays are set via set_movement_range, etc.


func _update_path_preview() -> void:
	# Path preview is computed server-side in multiplayer mode.
	path_preview_full.clear()
	path_preview_this_turn.clear()
	path_preview_stop_at = Vector2i(-999, -999)

	if selected_unit_id < 0:
		_last_preview_request_unit_id = -1
		_last_preview_request_hex = Vector2i(-999, -999)
		return
	if not _hex_in_map(hovered_hex):
		return
	if not units.has(selected_unit_id):
		return

	var u: Dictionary = units.get(selected_unit_id, {})
	var owner := -1
	var owner_data = u.get("owner", {})
	if typeof(owner_data) == TYPE_DICTIONARY:
		owner = int(owner_data.get("0", -1))
	else:
		owner = int(owner_data)

	if owner != my_player_id:
		return

	if selected_unit_id == _last_preview_request_unit_id and hovered_hex == _last_preview_request_hex:
		return

	_last_preview_request_unit_id = selected_unit_id
	_last_preview_request_hex = hovered_hex
	unit_action_requested.emit(selected_unit_id, "path_preview", hovered_hex)


func _animate_unit_movements(old_positions: Dictionary) -> void:
	# Clean up tweens for units that no longer exist
	var to_remove: Array = []
	for uid in _unit_tweens.keys():
		if not units.has(uid):
			if _unit_tweens[uid] != null and _unit_tweens[uid].is_valid():
				_unit_tweens[uid].kill()
			to_remove.append(uid)
	for uid in to_remove:
		_unit_tweens.erase(uid)
		_unit_anim_offsets.erase(uid)
		_unit_prev_positions.erase(uid)

	# Check each unit for position changes
	for uid in units.keys():
		var new_pos := _unit_pos(int(uid))
		var old_pos: Vector2i = old_positions.get(uid, Vector2i(-999, -999))

		# Skip if no previous position or positions are the same
		if old_pos.x < 0 or new_pos == old_pos:
			_unit_prev_positions[uid] = new_pos
			continue

		# Calculate pixel offset from old to new position
		var old_pixel := HexMath.axial_to_pixel(old_pos, Vector2.ZERO, HEX_SIZE)
		var new_pixel := HexMath.axial_to_pixel(new_pos, Vector2.ZERO, HEX_SIZE)
		var offset := old_pixel - new_pixel

		# Cancel any existing tween for this unit
		if _unit_tweens.has(uid) and _unit_tweens[uid] != null and _unit_tweens[uid].is_valid():
			_unit_tweens[uid].kill()

		# Set initial offset and start tween
		_unit_anim_offsets[uid] = offset

		var tween := create_tween()
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_QUAD)

		# Animate offset from current to zero
		tween.tween_method(
			func(val: Vector2) -> void:
				_unit_anim_offsets[uid] = val
				queue_redraw(),
			offset,
			Vector2.ZERO,
			UNIT_MOVE_DURATION
		)

		tween.tween_callback(func() -> void:
			_unit_anim_offsets.erase(uid)
			_unit_tweens.erase(uid)
		)

		_unit_tweens[uid] = tween
		_unit_prev_positions[uid] = new_pos

		# Play movement sound
		var audio = get_node_or_null("/root/AudioManager")
		if audio and audio.has_method("play"):
			audio.play("unit_move", 0.1)


func _update_fog_of_war() -> void:
	if not fog_enabled:
		return

	if use_authoritative_visibility:
		for hex in visible_tiles.keys():
			explored_tiles[hex] = true
		_update_remembered_from_visibility()
		return

	# Calculate currently visible tiles
	visible_tiles.clear()

	# Visibility from our units
	for uid in units.keys():
		var u: Dictionary = units[uid]
		var owner := -1
		var owner_data = u.get("owner", {})
		if typeof(owner_data) == TYPE_DICTIONARY:
			owner = int(owner_data.get("0", -1))
		else:
			owner = int(owner_data)

		if owner != my_player_id:
			continue

		var pos := _unit_pos(int(uid))
		if not _hex_in_map(pos):
			continue

		_add_sight_range(pos, SIGHT_RANGE)

	# Visibility from our cities
	for cid in cities.keys():
		var c: Dictionary = cities[cid]
		var owner := -1
		var owner_data = c.get("owner", {})
		if typeof(owner_data) == TYPE_DICTIONARY:
			owner = int(owner_data.get("0", -1))
		else:
			owner = int(owner_data)

		if owner != my_player_id:
			continue

		var pos := _city_pos(int(cid))
		if not _hex_in_map(pos):
			continue

		_add_sight_range(pos, CITY_SIGHT_RANGE)

	# Mark visible tiles as explored and update remembered state
	for hex in visible_tiles.keys():
		explored_tiles[hex] = true

	_update_remembered_from_visibility()


func _update_remembered_from_visibility() -> void:
	# Clear remembered data on any tiles we can currently see.
	for pos in visible_tiles.keys():
		remembered_units.erase(pos)
		remembered_cities.erase(pos)

	# Refresh remembered units/cities from the currently visible tiles.
	for uid in units.keys():
		var pos := _unit_pos(int(uid))
		if visible_tiles.has(pos):
			remembered_units[pos] = units[uid].duplicate()

	for cid in cities.keys():
		var pos := _city_pos(int(cid))
		if visible_tiles.has(pos):
			remembered_cities[pos] = cities[cid].duplicate()


func _add_sight_range(center: Vector2i, radius: int) -> void:
	# Add hexes in sight range using axial coordinates
	for dq in range(-radius, radius + 1):
		for dr in range(-radius, radius + 1):
			var ds := -dq - dr
			if abs(dq) + abs(dr) + abs(ds) <= radius * 2:
				var hex := Vector2i(center.x + dq, center.y + dr)
				hex = _normalize_hex(hex)
				if _hex_in_map(hex):
					visible_tiles[hex] = true


func _mouse_hex() -> Vector2i:
	var pos := get_local_mouse_position()
	var effective_origin := origin + camera_offset
	var hex := HexMath.pixel_to_axial(pos, effective_origin, HEX_SIZE * zoom_level)
	return _normalize_hex(hex)

func _ui_wants_pointer_input() -> bool:
	var viewport := get_viewport()
	if viewport == null:
		return false
	var hovered := viewport.gui_get_hovered_control()
	if hovered == null:
		return false
	var control := hovered as Control
	if control == null:
		return false
	if not control.is_visible_in_tree():
		return false
	return control.mouse_filter != Control.MOUSE_FILTER_IGNORE

func _ui_wants_keyboard_input() -> bool:
	var viewport := get_viewport()
	if viewport == null:
		return false
	var focus := viewport.gui_get_focus_owner()
	if focus == null:
		return false
	var control := focus as Control
	if control == null:
		return false
	if not control.is_visible_in_tree():
		return false
	return control is LineEdit or control is TextEdit


func _normalize_hex(hex: Vector2i) -> Vector2i:
	if hex.y < 0 or hex.y >= map_height:
		return Vector2i(-999, -999)
	var q := hex.x
	if wrap_horizontal:
		q = posmod(q, map_width)
	else:
		if q < 0 or q >= map_width:
			return Vector2i(-999, -999)
	return Vector2i(q, hex.y)


func _hex_in_map(hex: Vector2i) -> bool:
	return hex.x >= 0 and hex.x < map_width and hex.y >= 0 and hex.y < map_height


func _unit_at_hex(hex: Vector2i, owner_filter: int = -1) -> int:
	for uid in units.keys():
		var u: Dictionary = units[uid]
		if owner_filter >= 0:
			var owner := -1
			var owner_data = u.get("owner", {})
			if typeof(owner_data) == TYPE_DICTIONARY:
				owner = int(owner_data.get("0", -1))
			else:
				owner = int(owner_data)
			if owner != owner_filter:
				continue
		var pos := _unit_pos(int(uid))
		if pos == hex:
			return int(uid)
	return -1


func _city_at_hex(hex: Vector2i) -> int:
	for cid in cities.keys():
		var pos := _city_pos(int(cid))
		if pos == hex:
			return int(cid)
	return -1


func _unit_pos(unit_id: int) -> Vector2i:
	if not units.has(unit_id):
		return Vector2i(-999, -999)
	var u: Dictionary = units[unit_id]
	var pos_data = u.get("pos", {})
	if typeof(pos_data) == TYPE_DICTIONARY:
		return Vector2i(int(pos_data.get("q", -999)), int(pos_data.get("r", -999)))
	return Vector2i(-999, -999)


func _city_pos(city_id: int) -> Vector2i:
	if not cities.has(city_id):
		return Vector2i(-999, -999)
	var c: Dictionary = cities[city_id]
	var pos_data = c.get("pos", {})
	if typeof(pos_data) == TYPE_DICTIONARY:
		return Vector2i(int(pos_data.get("q", -999)), int(pos_data.get("r", -999)))
	return Vector2i(-999, -999)

func _compute_tile_yields(tile_data: Dictionary, terrain_id: int) -> Dictionary:
	var base_y: Dictionary = _terrain_yields_by_id.get(terrain_id, {})
	var food := int(base_y.get("food", 0))
	var prod := int(base_y.get("production", 0))
	var gold := int(base_y.get("gold", 0))
	var science := int(base_y.get("science", 0))
	var culture := int(base_y.get("culture", 0))

	var pillaged := false
	var tier := 1
	var impr_id := -1
	var improvement_data = tile_data.get("improvement", null)
	if typeof(improvement_data) == TYPE_DICTIONARY:
		var impr: Dictionary = improvement_data
		tier = int(impr.get("tier", 1))
		pillaged = bool(impr.get("pillaged", false))
		impr_id = _parse_runtime_id(impr.get("id", -1))

	if not pillaged and impr_id >= 0 and _improvement_tier_yields_by_id.has(impr_id):
		var tiers: Array = _improvement_tier_yields_by_id.get(impr_id, [])
		var idx := clampi(tier - 1, 0, tiers.size() - 1)
		if idx >= 0 and idx < tiers.size() and typeof(tiers[idx]) == TYPE_DICTIONARY:
			var improvement_yields: Dictionary = tiers[idx]
			food += int(improvement_yields.get("food", 0))
			prod += int(improvement_yields.get("production", 0))
			gold += int(improvement_yields.get("gold", 0))
			science += int(improvement_yields.get("science", 0))
			culture += int(improvement_yields.get("culture", 0))

	var res_yield_data = tile_data.get("resource", null)
	if res_yield_data != null:
		var res_id := _parse_runtime_id(res_yield_data)
		if _is_resource_revealed(res_id) and _resource_yields_by_id.has(res_id):
			var req_impr := int(_resource_requires_improvement_by_id.get(res_id, -1))
			var resource_active := req_impr < 0 or (impr_id == req_impr and not pillaged)
			if resource_active:
				var ry: Dictionary = _resource_yields_by_id.get(res_id, {})
				food += int(ry.get("food", 0))
				prod += int(ry.get("production", 0))
				gold += int(ry.get("gold", 0))
				science += int(ry.get("science", 0))
				culture += int(ry.get("culture", 0))

	return {
		"food": food,
		"production": prod,
		"gold": gold,
		"science": science,
		"culture": culture,
	}

func _draw_yield_label(center: Vector2, yields: Dictionary) -> void:
	if typeof(yields) != TYPE_DICTIONARY:
		return
	var parts: Array[String] = []
	var food := int(yields.get("food", 0))
	var prod := int(yields.get("production", 0))
	var gold := int(yields.get("gold", 0))
	var science := int(yields.get("science", 0))
	var culture := int(yields.get("culture", 0))
	if food != 0:
		parts.append("%dF" % food)
	if prod != 0:
		parts.append("%dP" % prod)
	if gold != 0:
		parts.append("%dG" % gold)
	if science != 0:
		parts.append("%dS" % science)
	if culture != 0:
		parts.append("%dC" % culture)

	if parts.is_empty():
		return

	var text := " ".join(parts)
	var font := ThemeDB.fallback_font
	var font_size := int(10 * zoom_level)
	var text_size := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var pos := center + Vector2(-text_size.x / 2, HEX_SIZE * 0.55 * zoom_level)
	var pad := Vector2(3, 2) * zoom_level
	draw_rect(Rect2(pos - pad, text_size + pad * 2), Color(0, 0, 0, 0.35), true)
	draw_string(
		font,
		pos + Vector2(0, font_size),
		text,
		HORIZONTAL_ALIGNMENT_LEFT,
		-1,
		font_size,
		Color(1, 1, 1, 0.9)
	)


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


func _unit_symbol(type_id: int) -> String:
	if typeof(_unit_type_names) == TYPE_ARRAY and type_id >= 0 and type_id < _unit_type_names.size():
		var name := String(_unit_type_names[type_id])
		if not name.is_empty():
			return name.substr(0, 1).to_upper()
	return "?"

func _improvement_name(impr_id: int) -> String:
	if typeof(_improvement_names) == TYPE_ARRAY and impr_id >= 0 and impr_id < _improvement_names.size():
		return String(_improvement_names[impr_id])
	return "Improvement %d" % impr_id

func _improvement_glyph(impr_id: int) -> String:
	var icon := _palette.improvement_icon(impr_id)
	if icon.is_empty():
		icon = _improvement_name(impr_id)
	return _abbrev_from_icon(icon, 2)

func _resource_glyph(resource_id: int) -> String:
	var icon := _palette.resource_icon(resource_id)
	if icon.is_empty():
		return ""
	return _abbrev_from_icon(icon, 2)

func _abbrev_from_icon(icon: String, max_len: int = 2) -> String:
	var cleaned := icon.strip_edges()
	if cleaned.is_empty():
		return ""

	cleaned = cleaned.replace("-", "_")
	cleaned = cleaned.replace(" ", "_")
	var parts := cleaned.split("_", false)

	if parts.size() == 1:
		var only := String(parts[0]).strip_edges()
		if not only.is_empty():
			return only.substr(0, min(max_len, only.length())).to_upper()

	var out := ""
	for p in parts:
		var part := String(p).strip_edges()
		if part.is_empty():
			continue
		out += part.substr(0, 1).to_upper()
		if out.length() >= max_len:
			break

	if out.is_empty():
		return cleaned.substr(0, min(max_len, cleaned.length())).to_upper()
	return out

func _contrast_text_color(bg: Color, alpha: float = 1.0) -> Color:
	if bg.get_luminance() > 0.6:
		return Color(0.0, 0.0, 0.0, alpha)
	return Color(1.0, 1.0, 1.0, alpha)

func _parse_runtime_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
	return int(value)

func _parse_entity_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
		if d.has("index") and d.has("generation"):
			return int(d.get("index", 0)) + int(d.get("generation", 0)) * 10000
		if d.has("0"):
			return int(d.get("0", -1))
	return int(value)

func _is_resource_revealed(resource_id: int) -> bool:
	if not _resource_revealed_by_tech_by_id.has(resource_id):
		return true
	var tech_id := int(_resource_revealed_by_tech_by_id.get(resource_id, -1))
	if tech_id < 0:
		return true
	return _my_known_techs.has(tech_id)

func _is_neighbor(a: Vector2i, b: Vector2i) -> bool:
	var dirs := [
		Vector2i(1, 0),
		Vector2i(1, -1),
		Vector2i(0, -1),
		Vector2i(-1, 0),
		Vector2i(-1, 1),
		Vector2i(0, 1),
	]
	var target := _normalize_hex(b)
	for d in dirs:
		if _normalize_hex(a + d) == target:
			return true
	return false

func _is_attackable_enemy_hex(hex: Vector2i) -> bool:
	if selected_unit_id < 0:
		return false
	var target_id := _unit_at_hex(hex, -1)
	if target_id < 0 or not units.has(target_id):
		return false

	var target: Dictionary = units[target_id]
	var owner := -1
	var owner_data = target.get("owner", {})
	if typeof(owner_data) == TYPE_DICTIONARY:
		owner = int(owner_data.get("0", -1))
	else:
		owner = int(owner_data)

	if owner == my_player_id:
		return false

	var attacker_pos := _unit_pos(selected_unit_id)
	if attacker_pos == Vector2i(-999, -999):
		return false
	return _is_neighbor(attacker_pos, hex)


func _draw_fog_overlay(corners: PackedVector2Array, intensity: float) -> void:
	# Draw a semi-transparent dark overlay with gradient from center
	var fog_color := Color(0.05, 0.06, 0.10, intensity)
	draw_colored_polygon(corners, fog_color)


func _draw_fog_edges(effective_origin: Vector2) -> void:
	# Draw soft glow at boundaries between visible and non-visible tiles
	var edge_color := Color(0.15, 0.18, 0.25, 0.6)
	var edge_width := 3.0 * zoom_level

	# Hex neighbor offsets for axial coordinates
	var neighbor_offsets := [
		Vector2i(1, 0), Vector2i(1, -1), Vector2i(0, -1),
		Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1)
	]

	for r in range(map_height):
		for q in range(map_width):
			var hex := Vector2i(q, r)
			var is_visible := visible_tiles.has(hex)
			if not is_visible:
				continue

			# Check each neighbor - draw edge if neighbor is not visible
			var center := HexMath.axial_to_pixel(hex, effective_origin, HEX_SIZE * zoom_level)
			var corners := HexMath.hex_corners(center, HEX_SIZE * zoom_level)

			for dir in range(6):
				var neighbor: Vector2i = hex + neighbor_offsets[dir]
				# Handle wrap
				if wrap_horizontal and map_width > 0:
					neighbor.x = posmod(neighbor.x, map_width)
				if not _hex_in_map(neighbor):
					continue

				var neighbor_explored: bool = explored_tiles.has(neighbor)

				# Draw edge glow if transitioning from visible to unexplored
				if not neighbor_explored:
					var a: Vector2 = corners[dir]
					var b: Vector2 = corners[(dir + 1) % 6]
					draw_line(a, b, edge_color, edge_width)


func _draw_hex_texture(center: Vector2, tex: Texture2D, is_visible: bool) -> void:
	# Draw texture clipped to hex shape using draw_polygon with UVs
	var size := HEX_SIZE * zoom_level
	var corners := HexMath.hex_corners(center, size)

	# Compute UV coordinates - map hex corners to texture space
	# Hex bounding box: width = size * sqrt(3), height = size * 2
	var hex_half_width := size * sqrt(3.0) * 0.5
	var hex_half_height := size

	var uvs := PackedVector2Array()
	uvs.resize(6)
	for i in range(6):
		var offset := corners[i] - center
		# Map from pixel offset to UV (0-1 range)
		uvs[i] = Vector2(
			0.5 + offset.x / (hex_half_width * 2.0),
			0.5 + offset.y / (hex_half_height * 2.0)
		)

	# Create color array for modulation
	# Reduce brightness for a more natural, less saturated look
	var modulate := Color(0.75, 0.75, 0.75, 1.0)
	if not is_visible:
		modulate = Color(0.35, 0.35, 0.38, 1.0)  # Darker blue-tinted for fog of war

	var colors := PackedColorArray()
	colors.resize(6)
	for i in range(6):
		colors[i] = modulate

	draw_polygon(corners, colors, uvs, tex)


func _closed_polyline(points: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	out.resize(points.size() + 1)
	for i in range(points.size()):
		out[i] = points[i]
	out[points.size()] = points[0]
	return out


func is_tile_visible(hex: Vector2i) -> bool:
	if not fog_enabled:
		return true
	return visible_tiles.has(hex)


func get_hovered_hex() -> Vector2i:
	return hovered_hex


func get_selected_unit_id() -> int:
	return selected_unit_id


func get_selected_city_id() -> int:
	return selected_city_id

func select_city(city_id: int) -> void:
	_select_city(city_id)

func select_unit(unit_id: int) -> void:
	_select_unit(unit_id)


func get_visible_hex_bounds() -> Rect2:
	if map_width <= 0 or map_height <= 0:
		return Rect2()

	var vp := get_viewport_rect().size
	var effective_origin := origin + camera_offset
	var hex_size := HEX_SIZE * zoom_level

	# Calculate hex positions at screen corners
	var top_left_hex := HexMath.pixel_to_axial(Vector2.ZERO, effective_origin, hex_size)
	var bottom_right_hex := HexMath.pixel_to_axial(vp, effective_origin, hex_size)

	# Clamp to map bounds
	top_left_hex.x = clampi(top_left_hex.x, 0, map_width - 1)
	top_left_hex.y = clampi(top_left_hex.y, 0, map_height - 1)
	bottom_right_hex.x = clampi(bottom_right_hex.x, 0, map_width - 1)
	bottom_right_hex.y = clampi(bottom_right_hex.y, 0, map_height - 1)

	return Rect2(
		Vector2(top_left_hex),
		Vector2(bottom_right_hex - top_left_hex)
	)


func center_on_hex(hex: Vector2i) -> void:
	if not _hex_in_map(hex):
		return

	var vp := get_viewport_rect().size
	# Calculate where the hex would be with current origin, then offset to center it
	var target_center := HexMath.axial_to_pixel(hex, origin, HEX_SIZE * zoom_level)
	camera_offset = vp * 0.5 - target_center
	_sync_3d_camera()
	queue_redraw()
