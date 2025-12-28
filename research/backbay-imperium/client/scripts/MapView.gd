extends Node2D
class_name MapView

@export var client_path: NodePath = NodePath("../GameClient")

signal why_panel_requested(panel: Dictionary)
signal unit_selected(unit_id: int)
signal city_selected(city_id: int)
signal end_turn_requested()

const BASE_HEX_SIZE := 36.0
const ZOOM_MIN := 0.5
const ZOOM_MAX := 2.5
const ZOOM_STEP := 1.1

const COLOR_TILE_OUTLINE := Color(0.25, 0.25, 0.3, 1.0)
const COLOR_TILE_FILL := Color(0.08, 0.08, 0.1, 1.0)
const COLOR_HOVER_OUTLINE := Color(0.9, 0.9, 0.9, 1.0)
const COLOR_RANGE_FILL := Color(0.2, 0.55, 1.0, 0.25)
const COLOR_PATH_LINE := Color(1.0, 0.9, 0.3, 0.9)
const COLOR_PATH_LINE_REMAINDER := Color(1.0, 0.9, 0.3, 0.25)
const COLOR_PATH_STOP_MARKER := Color(1.0, 1.0, 1.0, 0.9)
const COLOR_ZOC_OUTLINE := Color(1.0, 0.25, 0.25, 0.9)
const COLOR_ORDERS_LINE := Color(0.55, 0.8, 1.0, 0.85)
const COLOR_ORDERS_DEST := Color(0.55, 0.8, 1.0, 1.0)

const COLOR_UNIT_FRIEND := Color(0.25, 0.9, 0.35, 1.0)
const COLOR_UNIT_ENEMY := Color(0.95, 0.35, 0.35, 1.0)
const COLOR_UNIT_NEUTRAL := Color(0.7, 0.7, 0.7, 1.0)

const COLOR_IMPROVEMENT_FARM := Color(0.25, 0.85, 0.35, 0.9)
const COLOR_IMPROVEMENT_MINE := Color(0.65, 0.65, 0.7, 0.9)
const COLOR_IMPROVEMENT_TRADE := Color(0.95, 0.75, 0.25, 0.9)
const COLOR_IMPROVEMENT_UNKNOWN := Color(0.9, 0.9, 0.9, 0.9)
const COLOR_IMPROVEMENT_PILLAGED := Color(0.95, 0.35, 0.35, 0.95)

var client: GameClient

var map_width := 0
var map_height := 0
var wrap_horizontal := true
var origin := Vector2.ZERO
var zoom := 1.0

var _panning := false
var _terrain_colors: Dictionary = {}  # terrain_id -> Color
var _visible_tiles: Dictionary = {}  # Vector2i -> true

var selected_unit_id: int = -1
var selected_city_id: int = -1
var hovered_hex: Vector2i = Vector2i(-999, -999)

var movement_range: Dictionary = {}
var enemy_zoc_tiles: Dictionary = {}
var path_preview_full: Array = []
var path_preview_this_turn: Array = []
var path_preview_stop_at: Vector2i = Vector2i(-999, -999)
var path_preview_stop_reason: Variant = null

var orders_path: Array = []

var show_zoc_overlay := true
var show_orders_overlay := true

var _last_interrupted_unit_id: int = -1

func _ready() -> void:
	client = get_node(client_path) as GameClient
	client.snapshot_loaded.connect(_on_snapshot_loaded)
	client.events_received.connect(_on_events_received)

	origin = get_viewport_rect().size * 0.5


func _on_snapshot_loaded() -> void:
	_read_map_meta()
	_build_terrain_colors()
	_recenter()
	_auto_select_first_unit()
	_refresh_visible_tiles()
	_update_overlays()
	queue_redraw()


func _on_events_received(events: Array) -> void:
	_read_map_meta()
	_track_orders_interruptions(events)
	_validate_selection()
	_apply_visibility_events(events)
	_update_overlays()
	queue_redraw()

func _track_orders_interruptions(events: Array) -> void:
	for raw in events:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var e: Dictionary = raw
		if String(e.get("type", "")) != "OrdersInterrupted":
			continue
		var unit_id := int(e.get("unit", -1))
		if unit_id < 0:
			continue
		if not client.units.has(unit_id):
			continue
		var u: Dictionary = client.units[unit_id]
		if int(u.get("owner", -1)) != client.current_player:
			continue
		_last_interrupted_unit_id = unit_id


func _unhandled_input(event: InputEvent) -> void:
	if map_width <= 0 or map_height <= 0:
		return

	if event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		var redraw := false
		if _panning:
			origin += motion.relative
			redraw = true

		var hex := _mouse_hex()
		if hex != hovered_hex:
			hovered_hex = hex
			_update_path_preview()
			redraw = true

		if redraw:
			queue_redraw()
		return

	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton

		if mouse_event.button_index == MOUSE_BUTTON_MIDDLE:
			_panning = mouse_event.pressed
			return

		if mouse_event.pressed and mouse_event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom_at_mouse(ZOOM_STEP)
			return

		if mouse_event.pressed and mouse_event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom_at_mouse(1.0 / ZOOM_STEP)
			return

		if not mouse_event.pressed:
			return

		var hex := _mouse_hex()
		if not _hex_in_map(hex):
			return

		if mouse_event.button_index == MOUSE_BUTTON_LEFT and mouse_event.alt_pressed:
			if _handle_alt_why(hex):
				return

		if event.is_action_pressed("bb_click_goto"):
			_issue_goto(hex)
			return

		if event.is_action_pressed("bb_click_primary"):
			# Click-to-attack: if you have a unit selected and click an adjacent enemy unit.
			if selected_unit_id >= 0:
				var target_id := _unit_at_hex(hex, -1)
				if target_id >= 0 and client.units.has(target_id):
					var target: Dictionary = client.units[target_id]
					if int(target.get("owner", -1)) != client.current_player:
						var attacker_pos := _unit_pos(selected_unit_id)
						if attacker_pos != Vector2i(-999, -999) and _is_neighbor(attacker_pos, hex):
							client.attack_unit(selected_unit_id, target_id)
							return

				var unit_id := _unit_at_hex(hex, client.current_player)
				if unit_id >= 0:
					_select_unit(unit_id)
					return
				var city_id := _city_at_hex(hex, client.current_player)
				if city_id >= 0:
					_select_city(city_id)
					return
				_issue_move(hex)
				return

	if event is InputEventKey and event.pressed:
		if event.is_action_pressed("bb_end_turn"):
			end_turn_requested.emit()
			return
		if event.is_action_pressed("bb_cancel_orders"):
			if selected_unit_id >= 0:
				client.cancel_orders(selected_unit_id)
				return
		if event.is_action_pressed("bb_cycle_unit"):
			_cycle_unit()
			return
		if event.is_action_pressed("bb_toggle_zoc"):
			show_zoc_overlay = not show_zoc_overlay
			_update_overlays()
			queue_redraw()
			return
		if event.is_action_pressed("bb_toggle_orders"):
			show_orders_overlay = not show_orders_overlay
			_update_overlays()
			queue_redraw()
			return
		if event.is_action_pressed("bb_repath_orders"):
			_handle_repath_orders()
			return


func _read_map_meta() -> void:
	var map_data: Dictionary = client.snapshot.get("map", {})
	map_width = int(map_data.get("width", map_width))
	map_height = int(map_data.get("height", map_height))
	wrap_horizontal = bool(map_data.get("wrap_horizontal", wrap_horizontal))

func _hex_size() -> float:
	return BASE_HEX_SIZE * zoom

func _build_terrain_colors() -> void:
	_terrain_colors.clear()
	var terrains = client.rules_names.get("terrains", [])
	if typeof(terrains) != TYPE_ARRAY:
		return

	for i in range(terrains.size()):
		var name := String(terrains[i]).to_lower()
		_terrain_colors[i] = _terrain_color_for_name(name)

func _terrain_color_for_name(name: String) -> Color:
	if name.find("ocean") >= 0:
		return Color(0.12, 0.22, 0.45, 1.0)
	if name.find("coast") >= 0:
		return Color(0.25, 0.45, 0.65, 1.0)
	if name.find("mount") >= 0:
		return Color(0.45, 0.42, 0.40, 1.0)
	if name.find("hill") >= 0:
		return Color(0.45, 0.50, 0.35, 1.0)
	if name.find("grass") >= 0:
		return Color(0.35, 0.55, 0.25, 1.0)
	if name.find("plain") >= 0:
		return Color(0.65, 0.55, 0.35, 1.0)
	return COLOR_TILE_FILL

func _refresh_visible_tiles() -> void:
	_visible_tiles.clear()
	var visible = client.get_visible_tiles(client.current_player)
	for h in visible:
		_visible_tiles[h] = true

func _apply_visibility_events(events: Array) -> void:
	for e in events:
		if typeof(e) != TYPE_DICTIONARY:
			continue
		var d: Dictionary = e
		var t = String(d.get("type", ""))
		match t:
			"TileRevealed":
				var hex = d.get("hex", {})
				if typeof(hex) == TYPE_DICTIONARY:
					var h: Dictionary = hex
					_visible_tiles[_normalize_hex(Vector2i(int(h.get("q", 0)), int(h.get("r", 0))))] = true
			"TileHidden":
				var hex = d.get("hex", {})
				if typeof(hex) == TYPE_DICTIONARY:
					var h: Dictionary = hex
					_visible_tiles.erase(_normalize_hex(Vector2i(int(h.get("q", 0)), int(h.get("r", 0)))))
			"TurnStarted":
				# As a safety net (e.g. desync or replay scrub), re-seed visibility from the engine.
				_refresh_visible_tiles()
			_:
				pass

func _tile_visible(hex: Vector2i) -> bool:
	if _visible_tiles.is_empty():
		return true
	return _visible_tiles.has(hex)

func _zoom_at_mouse(factor: float) -> void:
	var old_zoom: float = zoom
	var new_zoom: float = clampf(old_zoom * factor, ZOOM_MIN, ZOOM_MAX)
	if is_equal_approx(old_zoom, new_zoom):
		return

	var mouse_pos := get_local_mouse_position()
	var delta := mouse_pos - origin
	zoom = new_zoom
	origin = mouse_pos - delta * (zoom / old_zoom)

	hovered_hex = _mouse_hex()
	_update_path_preview()
	queue_redraw()


func _recenter() -> void:
	var vp := get_viewport_rect().size
	var center_hex := Vector2i(int(map_width / 2), int(map_height / 2))
	var center_px := HexMath.axial_to_pixel(center_hex, Vector2.ZERO, _hex_size())
	origin = vp * 0.5 - center_px


func _auto_select_first_unit() -> void:
	if selected_unit_id >= 0 and client.units.has(selected_unit_id):
		return
	var unit_id := client.first_unit_id_for_player(client.current_player)
	if unit_id >= 0:
		_select_unit(unit_id)


func _validate_selection() -> void:
	if selected_unit_id >= 0:
		if not client.units.has(selected_unit_id):
			selected_unit_id = -1
		else:
			var unit_data: Dictionary = client.units[selected_unit_id]
			var owner = int(unit_data.get("owner", -1))
			if owner != client.current_player:
				selected_unit_id = -1

	if selected_city_id >= 0:
		if not client.cities.has(selected_city_id):
			selected_city_id = -1
		else:
			var city_data: Dictionary = client.cities[selected_city_id]
			var city_owner = int(city_data.get("owner", -1))
			if city_owner != client.current_player:
				selected_city_id = -1


func _select_unit(unit_id: int) -> void:
	selected_unit_id = unit_id
	selected_city_id = -1
	_update_overlays()
	queue_redraw()
	unit_selected.emit(unit_id)

func select_unit(unit_id: int) -> void:
	_select_unit(unit_id)


func _select_city(city_id: int) -> void:
	selected_city_id = city_id
	selected_unit_id = -1
	_update_overlays()
	queue_redraw()
	city_selected.emit(city_id)

func select_city(city_id: int) -> void:
	_select_city(city_id)


func _issue_move(dest: Vector2i) -> void:
	if selected_unit_id < 0:
		return
	var path := _path_for_destination(dest)
	if path.is_empty():
		return
	client.move_unit(selected_unit_id, path)


func _issue_goto(dest: Vector2i) -> void:
	if selected_unit_id < 0:
		return
	var path := _path_for_destination(dest)
	if path.is_empty():
		return
	client.set_goto_orders(selected_unit_id, path)

func _path_for_destination(dest: Vector2i) -> Array[Vector2i]:
	var full: Array = []
	if dest == hovered_hex and not path_preview_full.is_empty():
		full = path_preview_full
	else:
		var preview: Dictionary = client.get_path_preview(selected_unit_id, dest)
		full = preview.get("full_path", [])

	if full.is_empty():
		return []

	var out: Array[Vector2i] = []
	for h in full:
		if typeof(h) == TYPE_VECTOR2I:
			out.append(h)
		elif typeof(h) == TYPE_DICTIONARY and h.has("q") and h.has("r"):
			out.append(Vector2i(int(h.q), int(h.r)))
	return out


func _update_overlays() -> void:
	movement_range.clear()
	enemy_zoc_tiles.clear()
	path_preview_full.clear()
	path_preview_this_turn.clear()
	path_preview_stop_at = Vector2i(-999, -999)
	path_preview_stop_reason = null
	orders_path.clear()

	if selected_city_id >= 0:
		return
	if selected_unit_id < 0:
		return

	if not client.units.has(selected_unit_id):
		return

	for h in client.get_movement_range(selected_unit_id):
		movement_range[h] = true

	if show_zoc_overlay:
		for h in client.get_enemy_zoc(client.current_player):
			enemy_zoc_tiles[h] = true

	if show_orders_overlay:
		_update_orders_overlay()
	_update_path_preview()


func _update_path_preview() -> void:
	path_preview_full.clear()
	path_preview_this_turn.clear()
	path_preview_stop_at = Vector2i(-999, -999)
	path_preview_stop_reason = null
	if selected_unit_id < 0:
		return
	if not _hex_in_map(hovered_hex):
		return
	var preview := client.get_path_preview(selected_unit_id, hovered_hex)
	if preview.is_empty():
		return
	path_preview_full = preview.get("full_path", [])
	path_preview_this_turn = preview.get("this_turn_path", [])
	path_preview_stop_at = preview.get("stop_at", Vector2i(-999, -999))
	path_preview_stop_reason = preview.get("stop_reason", null)


func _update_orders_overlay() -> void:
	orders_path.clear()
	if selected_unit_id < 0:
		return
	if not client.units.has(selected_unit_id):
		return
	var u: Dictionary = client.units[selected_unit_id]
	var orders = u.get("orders", null)
	if typeof(orders) != TYPE_DICTIONARY:
		return
	var o: Dictionary = orders
	if String(o.get("type", "")) != "Goto":
		return
	var raw_path = o.get("path", [])
	if typeof(raw_path) != TYPE_ARRAY:
		return
	for h in raw_path:
		if typeof(h) == TYPE_DICTIONARY and h.has("q") and h.has("r"):
			orders_path.append(Vector2i(int(h.q), int(h.r)))


func _mouse_hex() -> Vector2i:
	var pos := get_local_mouse_position()
	var hex := HexMath.pixel_to_axial(pos, origin, _hex_size())
	return _normalize_hex(hex)


func _normalize_hex(hex: Vector2i) -> Vector2i:
	var r := hex.y
	if r < 0 or r >= map_height:
		return Vector2i(-999, -999)
	var q := hex.x
	if wrap_horizontal:
		q = posmod(q, map_width)
	else:
		if q < 0 or q >= map_width:
			return Vector2i(-999, -999)
	return Vector2i(q, r)


func _hex_in_map(hex: Vector2i) -> bool:
	return hex.x >= 0 and hex.x < map_width and hex.y >= 0 and hex.y < map_height


func _unit_at_hex(hex: Vector2i, owner_filter: int) -> int:
	for unit_id in client.units.keys():
		var u: Dictionary = client.units[unit_id]
		var owner = int(u.get("owner", -1))
		if owner_filter >= 0 and owner != owner_filter:
			continue
		var pos: Dictionary = u.get("pos", {})
		if typeof(pos) == TYPE_DICTIONARY:
			if int(pos.get("q", -999)) == hex.x and int(pos.get("r", -999)) == hex.y:
				if owner != client.current_player and not _tile_visible(hex):
					continue
				return int(unit_id)
	return -1

func _city_at_hex(hex: Vector2i, owner_filter: int = -1) -> int:
	for city_id in client.cities.keys():
		var c: Dictionary = client.cities[city_id]
		var owner = int(c.get("owner", -1))
		if owner_filter >= 0 and owner != owner_filter:
			continue
		var pos: Dictionary = c.get("pos", {})
		if typeof(pos) == TYPE_DICTIONARY:
			if int(pos.get("q", -999)) == hex.x and int(pos.get("r", -999)) == hex.y:
				if owner != client.current_player and not _tile_visible(hex):
					continue
				return int(city_id)
	return -1

func _is_neighbor(a: Vector2i, b: Vector2i) -> bool:
	var dirs := [
		Vector2i(1, 0),
		Vector2i(0, 1),
		Vector2i(-1, 1),
		Vector2i(-1, 0),
		Vector2i(0, -1),
		Vector2i(1, -1),
	]
	for d in dirs:
		var n := _normalize_hex(a + d)
		if n == b:
			return true
	return false

func _handle_alt_why(hex: Vector2i) -> bool:
	# Combat: Alt+LMB on an adjacent enemy unit while a unit is selected.
	if selected_unit_id >= 0:
		var target_id := _unit_at_hex(hex, -1)
		if target_id >= 0 and client.units.has(target_id):
			var target: Dictionary = client.units[target_id]
			if int(target.get("owner", -1)) != client.current_player:
				var attacker_pos := _unit_pos(selected_unit_id)
				if attacker_pos != Vector2i(-999, -999) and _is_neighbor(attacker_pos, hex):
					var panel := client.get_combat_why(selected_unit_id, target_id)
					if not panel.is_empty():
						why_panel_requested.emit(panel)
						return true

	# City upkeep: Alt+LMB on a friendly city.
	var city_id := _city_at_hex(hex)
	if city_id >= 0 and client.cities.has(city_id):
		var city: Dictionary = client.cities[city_id]
		if int(city.get("owner", -1)) == client.current_player:
			var panel := client.get_city_maintenance_why(city_id)
			if not panel.is_empty():
				why_panel_requested.emit(panel)
				return true

	return false


func _draw() -> void:
	if map_width <= 0 or map_height <= 0:
		return

	var size := _hex_size()
	var map_data: Dictionary = client.snapshot.get("map", {})
	var tiles: Array = []
	var raw_tiles = map_data.get("tiles", [])
	if typeof(raw_tiles) == TYPE_ARRAY:
		tiles = raw_tiles

	for r in range(map_height):
		for q in range(map_width):
			var hex := Vector2i(q, r)
			var center := HexMath.axial_to_pixel(hex, origin, size)
			var corners := HexMath.hex_corners(center, size)
			var outline := _closed_polyline(corners)

			var idx := r * map_width + q
			var fill := COLOR_TILE_FILL
			var tile_dict: Dictionary = {}
			var has_tile := false
			if idx >= 0 and idx < tiles.size():
				var tile = tiles[idx]
				if typeof(tile) == TYPE_DICTIONARY:
					tile_dict = tile
					has_tile = true
					var terrain_id = int(tile_dict.get("terrain", 0))
					fill = _terrain_colors.get(terrain_id, COLOR_TILE_FILL)

			draw_colored_polygon(corners, fill)

			var visible := _tile_visible(hex)
			if not visible:
				draw_colored_polygon(corners, Color(0, 0, 0, 0.55))

			if visible and movement_range.has(hex):
				draw_colored_polygon(corners, COLOR_RANGE_FILL)

			if visible and has_tile:
				var improvement = tile_dict.get("improvement", null)
				if typeof(improvement) == TYPE_DICTIONARY:
					var impr: Dictionary = improvement
					var impr_id = int(impr.get("id", -1))
					var tier = int(impr.get("tier", 1))
					var pillaged = bool(impr.get("pillaged", false))

					var color := _improvement_color(impr_id)
					var tier_scale: float = float(clampi(tier - 1, 0, 4))
					var radius: float = size * (0.08 + 0.03 * tier_scale)
					draw_circle(center, radius, color)

					if pillaged:
						var s := size * 0.16
						draw_line(center + Vector2(-s, -s), center + Vector2(s, s), COLOR_IMPROVEMENT_PILLAGED, 3.0)
						draw_line(center + Vector2(-s, s), center + Vector2(s, -s), COLOR_IMPROVEMENT_PILLAGED, 3.0)

			if visible and enemy_zoc_tiles.has(hex):
				draw_polyline(outline, COLOR_ZOC_OUTLINE, 2.0)

			draw_polyline(outline, COLOR_TILE_OUTLINE, 1.0)

	if _hex_in_map(hovered_hex):
		var hover_center := HexMath.axial_to_pixel(hovered_hex, origin, size)
		var hover_outline := _closed_polyline(HexMath.hex_corners(hover_center, size))
		draw_polyline(hover_outline, COLOR_HOVER_OUTLINE, 2.0)

		# Hover affordance: highlight attackable enemies.
		if selected_unit_id >= 0:
			var target_id := _unit_at_hex(hovered_hex, -1)
			if target_id >= 0 and client.units.has(target_id):
				var target: Dictionary = client.units[target_id]
				if int(target.get("owner", -1)) != client.current_player:
					var attacker_pos := _unit_pos(selected_unit_id)
					if attacker_pos != Vector2i(-999, -999) and _is_neighbor(attacker_pos, hovered_hex):
						draw_polyline(hover_outline, COLOR_ZOC_OUTLINE, 4.0)

	_draw_orders()
	_draw_path_preview()
	_draw_cities()
	_draw_units()


func _draw_cities() -> void:
	var size := _hex_size()
	for city_id in client.cities.keys():
		var c: Dictionary = client.cities[city_id]
		var pos: Dictionary = c.get("pos", {})
		if typeof(pos) != TYPE_DICTIONARY:
			continue
		var hex = Vector2i(int(pos.get("q", -999)), int(pos.get("r", -999)))
		if not _hex_in_map(hex):
			continue

		var owner = int(c.get("owner", -1))
		if owner != client.current_player and not _tile_visible(hex):
			continue

		var center := HexMath.axial_to_pixel(hex, origin, size)
		var s := size * 0.18
		var color := Color(0.25, 0.7, 1.0, 0.95)

		if int(city_id) == selected_city_id:
			draw_circle(center, s * 1.8, Color(1, 1, 1, 0.95))

		draw_rect(Rect2(center - Vector2(s, s), Vector2(s * 2, s * 2)), color)

func _draw_path_preview() -> void:
	if selected_unit_id < 0:
		return
	var unit_pos := _unit_pos(selected_unit_id)
	if unit_pos == Vector2i(-999, -999):
		return
	if path_preview_full.is_empty():
		return
	var size := _hex_size()

	if not path_preview_this_turn.is_empty():
		var points_this_turn := PackedVector2Array()
		points_this_turn.append(HexMath.axial_to_pixel(unit_pos, origin, size))
		for h in path_preview_this_turn:
			points_this_turn.append(HexMath.axial_to_pixel(h, origin, size))
		draw_polyline(points_this_turn, COLOR_PATH_LINE, 3.0)

	var remaining: Array = []
	for i in range(path_preview_this_turn.size(), path_preview_full.size()):
		remaining.append(path_preview_full[i])
	if not remaining.is_empty():
		var start_hex: Vector2i = unit_pos
		if not path_preview_this_turn.is_empty():
			start_hex = path_preview_this_turn[path_preview_this_turn.size() - 1]
		var points_remaining := PackedVector2Array()
		points_remaining.append(HexMath.axial_to_pixel(start_hex, origin, size))
		for h in remaining:
			points_remaining.append(HexMath.axial_to_pixel(h, origin, size))
		draw_polyline(points_remaining, COLOR_PATH_LINE_REMAINDER, 3.0)

	if _hex_in_map(path_preview_stop_at) and typeof(path_preview_stop_reason) != TYPE_NIL:
		var stop_center := HexMath.axial_to_pixel(path_preview_stop_at, origin, size)
		draw_circle(stop_center, size * 0.12, COLOR_PATH_STOP_MARKER)

		if typeof(path_preview_stop_reason) == TYPE_DICTIONARY:
			var r: Dictionary = path_preview_stop_reason
			if String(r.get("type", "")) == "Blocked":
				var attempted = r.get("attempted", {})
				if typeof(attempted) == TYPE_DICTIONARY:
					var a: Dictionary = attempted
					var attempted_hex = Vector2i(int(a.get("q", -999)), int(a.get("r", -999)))
					if _hex_in_map(attempted_hex):
						var c := HexMath.axial_to_pixel(attempted_hex, origin, size)
						var s := size * 0.16
						draw_line(c + Vector2(-s, -s), c + Vector2(s, s), COLOR_ZOC_OUTLINE, 3.0)
						draw_line(c + Vector2(-s, s), c + Vector2(s, -s), COLOR_ZOC_OUTLINE, 3.0)


func _draw_orders() -> void:
	if not show_orders_overlay:
		return
	if selected_unit_id < 0 or orders_path.is_empty():
		return
	var unit_pos := _unit_pos(selected_unit_id)
	if unit_pos == Vector2i(-999, -999):
		return
	var size := _hex_size()

	var points := PackedVector2Array()
	points.append(HexMath.axial_to_pixel(unit_pos, origin, size))
	for h in orders_path:
		points.append(HexMath.axial_to_pixel(h, origin, size))
	draw_polyline(points, COLOR_ORDERS_LINE, 2.0)

	var dest: Vector2i = orders_path[orders_path.size() - 1]
	if _hex_in_map(dest):
		var c := HexMath.axial_to_pixel(dest, origin, size)
		draw_circle(c, size * 0.12, COLOR_ORDERS_DEST)


func _cycle_unit() -> void:
	if client == null:
		return

	var actionable: Array[int] = []
	var all: Array[int] = []
	for raw_id in client.units.keys():
		var unit_id := int(raw_id)
		var u: Dictionary = client.units[raw_id]
		if int(u.get("owner", -1)) != client.current_player:
			continue
		all.append(unit_id)

		var moves_left = int(u.get("moves_left", 0))
		var has_orders = u.get("orders", null) != null
		if moves_left > 0 or has_orders:
			actionable.append(unit_id)

	if all.is_empty():
		return

	all.sort()
	actionable.sort()

	var list: Array[int] = actionable if not actionable.is_empty() else all
	var start_index := list.find(selected_unit_id)
	if start_index < 0:
		_select_unit(list[0])
		return

	var next_index = (start_index + 1) % list.size()
	_select_unit(list[next_index])


func _handle_repath_orders() -> void:
	if _repath_orders_for_unit(selected_unit_id):
		return
	if _last_interrupted_unit_id >= 0 and _last_interrupted_unit_id != selected_unit_id:
		if _repath_orders_for_unit(_last_interrupted_unit_id):
			_select_unit(_last_interrupted_unit_id)


func _repath_orders_for_unit(unit_id: int) -> bool:
	if unit_id < 0:
		return false
	if not client.units.has(unit_id):
		return false

	var u: Dictionary = client.units[unit_id]
	var orders = u.get("orders", null)
	if typeof(orders) != TYPE_DICTIONARY:
		return false

	var o: Dictionary = orders
	if String(o.get("type", "")) != "Goto":
		return false

	var raw_path = o.get("path", [])
	if typeof(raw_path) != TYPE_ARRAY or raw_path.is_empty():
		return false

	var last = raw_path[raw_path.size() - 1]
	if typeof(last) != TYPE_DICTIONARY:
		return false

	var dest_dict: Dictionary = last
	var dest := Vector2i(int(dest_dict.get("q", -999)), int(dest_dict.get("r", -999)))
	if not _hex_in_map(dest):
		return false

	var preview: Dictionary = client.get_path_preview(unit_id, dest)
	var full_path: Array = preview.get("full_path", [])
	if full_path.is_empty():
		return false

	var path: Array[Vector2i] = []
	for h in full_path:
		if typeof(h) == TYPE_VECTOR2I:
			path.append(h)
		elif typeof(h) == TYPE_DICTIONARY and h.has("q") and h.has("r"):
			path.append(Vector2i(int(h.q), int(h.r)))

	client.set_goto_orders(unit_id, path)
	return true


func _draw_units() -> void:
	var size := _hex_size()
	for unit_id in client.units.keys():
		var u: Dictionary = client.units[unit_id]
		var pos := _unit_pos(int(unit_id))
		if pos == Vector2i(-999, -999):
			continue
		var owner = int(u.get("owner", -1))
		if owner != client.current_player and not _tile_visible(pos):
			continue

		var center := HexMath.axial_to_pixel(pos, origin, size)
		var color := COLOR_UNIT_NEUTRAL
		if owner == client.current_player:
			color = COLOR_UNIT_FRIEND
		elif owner >= 0:
			color = COLOR_UNIT_ENEMY

		var radius := size * 0.28
		if int(unit_id) == selected_unit_id:
			draw_circle(center, radius * 1.35, Color(1, 1, 1, 0.95))
		draw_circle(center, radius, color)


func _unit_pos(unit_id: int) -> Vector2i:
	if not client.units.has(unit_id):
		return Vector2i(-999, -999)
	var u: Dictionary = client.units[unit_id]
	var pos: Dictionary = u.get("pos", {})
	if typeof(pos) != TYPE_DICTIONARY:
		return Vector2i(-999, -999)
	return Vector2i(int(pos.get("q", -999)), int(pos.get("r", -999)))

func _improvement_color(impr_id: int) -> Color:
	var name := client.improvement_name(impr_id).to_lower()
	if name.find("farm") >= 0:
		return COLOR_IMPROVEMENT_FARM
	if name.find("mine") >= 0:
		return COLOR_IMPROVEMENT_MINE
	if name.find("trade") >= 0:
		return COLOR_IMPROVEMENT_TRADE
	return COLOR_IMPROVEMENT_UNKNOWN


func _closed_polyline(points: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	out.resize(points.size() + 1)
	for i in range(points.size()):
		out[i] = points[i]
	out[points.size()] = points[0]
	return out
