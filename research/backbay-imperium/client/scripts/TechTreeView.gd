extends Control
class_name TechTreeView

const UiTheme = preload("res://scripts/UiTheme.gd")

signal tech_selected(tech_id: int)
signal tech_hovered(tech_id: int)
signal tech_unhovered()

const STATUS_LOCKED := 0
const STATUS_AVAILABLE := 1
const STATUS_RESEARCHING := 2
const STATUS_COMPLETE := 3

const NODE_SIZE := Vector2(200, 96)
const COL_GAP := 72.0
const ROW_GAP := 32.0
const CULL_MARGIN := 80.0
const ZOOM_MIN := 0.55
const ZOOM_MAX := 1.7
const DRAG_THRESHOLD := 6.0
const GRID_SPACING := 120.0
const BAND_PAD := 18.0
const ERA_HEADER_HEIGHT := 28.0
const NODE_RADIUS := 12
const BADGE_RADIUS := 14.0
const ICON_CELL := 48
const ICON_SIZE := 40
const ICON_DRAW := 20.0
const ERA_HEADER_PATH := "res://assets/ui/tech/era_header.png"
const ERA_HEADER_TINT := Color(0.6, 0.9, 1.0, 0.7)

const ERA_NAMES := ["Ancient", "Classical", "Medieval", "Renaissance", "Industrial", "Modern"]

const COLOR_BG_TOP := Color(0.04, 0.09, 0.16, 0.98)
const COLOR_BG_BOTTOM := Color(0.03, 0.05, 0.1, 0.98)
const COLOR_GRID := Color(0.28, 0.46, 0.6, 0.12)
const COLOR_BAND_A := Color(0.06, 0.12, 0.18, 0.42)
const COLOR_BAND_B := Color(0.08, 0.14, 0.2, 0.34)
const COLOR_NODE := Color(0.08, 0.12, 0.18, 0.92)
const COLOR_NODE_ALT := Color(0.1, 0.15, 0.22, 0.95)
const COLOR_NODE_LOCKED := Color(0.07, 0.1, 0.15, 0.75)
const COLOR_BORDER := Color(0.2, 0.5, 0.64, 0.45)
const COLOR_BORDER_LOCKED := Color(0.16, 0.24, 0.3, 0.3)
const COLOR_TEXT := Color(0.92, 0.96, 1.0)
const COLOR_TEXT_MUTED := Color(0.6, 0.7, 0.78)
const COLOR_ACCENT := Color(0.2, 0.9, 0.95)
const COLOR_ACCENT_FOCUS := Color(0.45, 0.95, 1.0)
const COLOR_ACCENT_SOFT := Color(0.2, 0.9, 0.95, 0.2)
const COLOR_SUCCESS := Color(0.35, 0.9, 0.6)
const COLOR_WARNING := Color(0.94, 0.74, 0.3)

const ZOOM_SNAP_LEVELS := [0.55, 0.7, 0.85, 1.0, 1.2, 1.4, 1.7]
const ZOOM_LERP_SPEED := 12.0

const MINIMAP_SIZE := Vector2(220, 140)
const MINIMAP_MARGIN := 14.0
const MINIMAP_BG := Color(0.02, 0.04, 0.07, 0.82)
const MINIMAP_BORDER := Color(0.18, 0.35, 0.45, 0.5)
const MINIMAP_VIEWPORT := Color(0.25, 0.8, 0.95, 0.8)
const MINIMAP_NODE := Color(0.7, 0.85, 0.95, 0.7)
const MINIMAP_NODE_DIM := Color(0.45, 0.55, 0.65, 0.35)
const MINIMAP_NODE_ACTIVE := Color(0.25, 0.9, 0.95, 0.95)
const COLOR_BREADCRUMB := Color(0.25, 0.85, 0.95, 0.35)

var tech_data: Dictionary = {}
var known_techs: Array[int] = []
var current_research: int = -1
var research_progress: int = 0
var research_required: int = 0

var layout_dirty := true
var size_dirty := false
var recenter_on_layout := true
var node_rects: Dictionary = {} # tech_id -> Rect2 (world space)
var node_order: Array[int] = []
var edges: Array[Vector2i] = []
var dependents: Dictionary = {} # tech_id -> Array[int]
var layout_bounds := Rect2()
var layout_origin := Vector2.ZERO
var last_size := Vector2.ZERO

var pan := Vector2.ZERO
var zoom := 1.0
var zoom_target := 1.0
var zoom_anchor_screen := Vector2.ZERO
var zoom_anchor_world := Vector2.ZERO
var zoom_animating := false
var hovered_id := -1
var selected_id := -1

var drag_active := false
var drag_origin := Vector2.ZERO
var drag_start_pan := Vector2.ZERO
var drag_moved := false
var minimap_active := false

var filter_era := -1
var filter_tier := -1
var filter_search := ""
var filter_available_only := false
var filter_ids: Dictionary = {}
var filter_eras: Array[int] = []
var filter_tiers: Array[int] = []
var tiers_cache: Dictionary = {}

var label_font: Font
var label_font_size := 15
var meta_font: Font
var meta_font_size := 12
var era_font: Font
var era_font_size := 13
var icon_font: Font
var icon_font_size := 11

var node_styles: Dictionary = {}
var outline_styles: Dictionary = {}
var chip_styles: Dictionary = {}
var chip_text_colors: Dictionary = {}
var cost_chip_style: StyleBoxFlat
var cost_chip_text_color := COLOR_TEXT
var era_bands: Array = []
var icon_textures: Dictionary = {}
var icon_atlas: Texture2D = null
var icon_regions: Dictionary = {}
var era_header_texture: Texture2D = null

var text_cache: Dictionary = {} # tech_id -> {name, cost, prereqs, icon, name_size, cost_size, prereqs_size}
var status_cache: Dictionary = {} # status -> {text, size}


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_NONE
	clip_contents = true
	set_process(true)
	zoom_target = zoom
	_resolve_fonts()
	_build_status_cache()
	_build_styles()
	_load_era_header()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		size_dirty = true
		queue_redraw()
	elif what == NOTIFICATION_THEME_CHANGED:
		_resolve_fonts()
		_build_status_cache()
		_build_styles()
		layout_dirty = true
		recenter_on_layout = false
		queue_redraw()


func set_tech_data(data: Dictionary, icon_sources: Dictionary = {}) -> void:
	tech_data = data
	icon_textures = icon_sources
	_build_icon_atlas()
	_build_dependents()
	_rebuild_filter_options()
	layout_dirty = true
	recenter_on_layout = true
	if hovered_id >= 0 and not tech_data.has(hovered_id):
		hovered_id = -1
	if selected_id >= 0 and not tech_data.has(selected_id):
		selected_id = -1
	queue_redraw()


func update_state(p_known: Array, p_current: int, p_progress: int, p_required: int) -> void:
	known_techs.clear()
	for tech_id in p_known:
		known_techs.append(int(tech_id))
	current_research = p_current
	research_progress = p_progress
	research_required = p_required
	_update_filter_set()
	queue_redraw()


func set_filters(p_era: int, p_tier: int, p_search: String, p_available_only: bool) -> void:
	filter_era = p_era
	filter_tier = p_tier
	filter_search = p_search.strip_edges().to_lower()
	filter_available_only = p_available_only
	_update_filter_set()
	queue_redraw()


func get_filter_options() -> Dictionary:
	if tech_data.is_empty():
		return {"eras": [], "tiers": []}
	if filter_eras.is_empty() and filter_tiers.is_empty():
		_rebuild_filter_options()
	return {
		"eras": filter_eras.duplicate(),
		"tiers": filter_tiers.duplicate(),
	}


func _has_filters() -> bool:
	return filter_era >= 0 or filter_tier >= 0 or not filter_search.is_empty() or filter_available_only


func _rebuild_filter_options() -> void:
	tiers_cache = _compute_tiers()
	var eras: Array[int] = []
	for tech_id in tech_data.keys():
		var tech: Dictionary = tech_data[tech_id]
		eras.append(int(tech.get("era", 0)))
	eras.sort()
	filter_eras = _unique_sorted_ints(eras)

	var tiers: Array[int] = []
	for tier_val in tiers_cache.values():
		tiers.append(int(tier_val))
	tiers.sort()
	filter_tiers = _unique_sorted_ints(tiers)
	_update_filter_set()


func _unique_sorted_ints(values: Array[int]) -> Array[int]:
	var out: Array[int] = []
	for val in values:
		if out.is_empty() or out[-1] != val:
			out.append(val)
	return out


func _update_filter_set() -> void:
	filter_ids.clear()
	if not _has_filters():
		return
	if tiers_cache.is_empty() and not tech_data.is_empty():
		tiers_cache = _compute_tiers()

	for tech_id in tech_data.keys():
		var tid := int(tech_id)
		var tech: Dictionary = tech_data[tech_id]
		if filter_era >= 0 and int(tech.get("era", 0)) != filter_era:
			continue
		if filter_tier >= 0:
			var tier_val := int(tiers_cache.get(tid, 0))
			if tier_val != filter_tier:
				continue
		if filter_available_only:
			var status: int = _status_for(tid)
			if status != STATUS_AVAILABLE and status != STATUS_RESEARCHING:
				continue
		if not filter_search.is_empty():
			var name := String(tech.get("name", ""))
			if name.to_lower().findn(filter_search) < 0:
				continue
		filter_ids[tid] = true

	if selected_id >= 0 and not filter_ids.has(selected_id):
		selected_id = -1
	if hovered_id >= 0 and not filter_ids.has(hovered_id):
		hovered_id = -1

func _gui_input(event: InputEvent) -> void:
	if tech_data.is_empty():
		return

	if event is InputEventMouseButton:
		var mb: InputEventMouseButton = event
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				if _handle_minimap_press(mb.position):
					accept_event()
					return
				drag_active = true
				drag_moved = false
				drag_origin = mb.position
				drag_start_pan = pan
				accept_event()
				return
			if drag_active:
				drag_active = false
				if not drag_moved:
					var hit := _hit_test(mb.position)
					if hit >= 0:
						selected_id = hit
						tech_selected.emit(hit)
					else:
						selected_id = -1
					queue_redraw()
				accept_event()
				return
			if minimap_active:
				minimap_active = false
				accept_event()
				return

		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_apply_zoom(1.1, mb.position)
			accept_event()
			return
		if mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_apply_zoom(1.0 / 1.1, mb.position)
			accept_event()
			return

	if event is InputEventMagnifyGesture:
		var mg: InputEventMagnifyGesture = event
		_apply_zoom(mg.factor, mg.position)
		accept_event()
		return

	if event is InputEventPanGesture:
		var pan_event: InputEventPanGesture = event
		pan += pan_event.delta * 10.0
		_clamp_pan()
		queue_redraw()
		accept_event()
		return

	if event is InputEventMouseMotion:
		var motion: InputEventMouseMotion = event
		if minimap_active:
			_pan_to_minimap(motion.position)
			accept_event()
			return
		if drag_active:
			var delta := motion.position - drag_origin
			if delta.length() > DRAG_THRESHOLD:
				drag_moved = true
			pan = drag_start_pan + delta
			_clamp_pan()
			queue_redraw()
			accept_event()
			return

		var next_hover := _hit_test(motion.position)
		if next_hover != hovered_id:
			hovered_id = next_hover
			if hovered_id >= 0:
				tech_hovered.emit(hovered_id)
			else:
				tech_unhovered.emit()
			queue_redraw()


func _draw() -> void:
	_draw_background()

	if tech_data.is_empty():
		_draw_empty_state()
		return

	if layout_dirty:
		_rebuild_layout()
	elif size_dirty or size != last_size:
		last_size = size
		size_dirty = false
		_clamp_pan()

	var cull_rect := Rect2(Vector2.ZERO, size).grow(CULL_MARGIN)
	_draw_grid()
	_draw_era_bands(cull_rect)
	var filter_active := _has_filters()
	if filter_active and filter_ids.is_empty():
		_draw_filter_empty_state()
		_draw_minimap()
		return

	var focus_id := hovered_id if hovered_id >= 0 else selected_id
	var breadcrumb_ids: Dictionary = {}
	var breadcrumb_edges: Dictionary = {}
	if focus_id >= 0:
		breadcrumb_ids = _build_prereq_chain(focus_id)
		breadcrumb_edges = _build_prereq_edges(breadcrumb_ids)

	for edge in edges:
		var from_id := edge.x
		var to_id := edge.y
		if filter_active and (not filter_ids.has(from_id) or not filter_ids.has(to_id)):
			continue
		var is_breadcrumb_edge := breadcrumb_edges.has(edge)
		if not node_rects.has(from_id) or not node_rects.has(to_id):
			continue
		var from_rect: Rect2 = _world_rect_to_screen(node_rects[from_id])
		var to_rect: Rect2 = _world_rect_to_screen(node_rects[to_id])
		if not from_rect.intersects(cull_rect) and not to_rect.intersects(cull_rect):
			continue
		_draw_edge(from_id, to_id, from_rect, to_rect, focus_id, is_breadcrumb_edge)

	for tech_id in node_order:
		if filter_active and not filter_ids.has(tech_id):
			continue
		if not node_rects.has(tech_id):
			continue
		var screen_rect: Rect2 = _world_rect_to_screen(node_rects[tech_id])
		if not screen_rect.intersects(cull_rect):
			continue
		var status := _status_for(tech_id)
		var is_breadcrumb := breadcrumb_ids.has(tech_id)
		_draw_node(tech_id, screen_rect, status, is_breadcrumb, tech_id == focus_id)
	_draw_minimap()


func _draw_background() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), COLOR_BG_BOTTOM, true)
	var top_height := size.y * 0.55
	draw_rect(Rect2(Vector2.ZERO, Vector2(size.x, top_height)), COLOR_BG_TOP, true)


func _draw_grid() -> void:
	var world_top_left := _screen_to_world(Vector2.ZERO)
	var world_bottom_right := _screen_to_world(size)
	var start_x: float = float(floori(world_top_left.x / GRID_SPACING)) * GRID_SPACING
	var end_x: float = float(ceili(world_bottom_right.x / GRID_SPACING)) * GRID_SPACING
	var x: float = start_x
	while x <= end_x:
		var sx := _world_to_screen(Vector2(x, 0)).x
		draw_line(Vector2(sx, 0), Vector2(sx, size.y), COLOR_GRID, 1.0)
		x += GRID_SPACING

	var start_y: float = float(floori(world_top_left.y / GRID_SPACING)) * GRID_SPACING
	var end_y: float = float(ceili(world_bottom_right.y / GRID_SPACING)) * GRID_SPACING
	var y: float = start_y
	while y <= end_y:
		var sy := _world_to_screen(Vector2(0, y)).y
		draw_line(Vector2(0, sy), Vector2(size.x, sy), COLOR_GRID, 1.0)
		y += GRID_SPACING


func _draw_era_bands(cull_rect: Rect2) -> void:
	if era_bands.is_empty():
		return
	for idx in range(era_bands.size()):
		var band: Dictionary = era_bands[idx]
		var rect: Rect2 = _world_rect_to_screen(band.get("rect", Rect2()))
		if not rect.intersects(cull_rect):
			continue
		var band_color := COLOR_BAND_A if idx % 2 == 0 else COLOR_BAND_B
		draw_rect(rect, band_color, true)
		_draw_era_header(rect)

		if zoom >= 0.75:
			var era_id := int(band.get("era", 0))
			var label := _era_label(era_id)
			var label_pos := rect.position + Vector2(12, 20)
			draw_string(era_font, label_pos, label, HORIZONTAL_ALIGNMENT_LEFT, -1, era_font_size, COLOR_TEXT_MUTED)


func _draw_era_header(rect: Rect2) -> void:
	if era_header_texture == null:
		return
	var header_rect := Rect2(rect.position, Vector2(rect.size.x, ERA_HEADER_HEIGHT))
	draw_texture_rect(era_header_texture, header_rect, false, ERA_HEADER_TINT)


func _draw_edge(
	from_id: int,
	to_id: int,
	from_rect: Rect2,
	to_rect: Rect2,
	focus_id: int,
	is_breadcrumb_edge: bool
) -> void:
	var from_pos := Vector2(from_rect.position.x + from_rect.size.x, from_rect.position.y + from_rect.size.y * 0.5)
	var to_pos := Vector2(to_rect.position.x, to_rect.position.y + to_rect.size.y * 0.5)
	var edge_active := _status_for(from_id) == STATUS_COMPLETE and _status_for(to_id) != STATUS_LOCKED
	var edge_focus := focus_id >= 0 and (from_id == focus_id or to_id == focus_id)
	var edge_color := Color(0.16, 0.26, 0.34, 0.55)
	var edge_width := 1.2
	if is_breadcrumb_edge:
		edge_color = COLOR_BREADCRUMB
		edge_width = 1.4
	if edge_active:
		edge_color = COLOR_ACCENT
		edge_width = 1.6
	if edge_focus:
		edge_color = COLOR_ACCENT_FOCUS
		edge_width = 2.1

	var mid_x := (from_pos.x + to_pos.x) * 0.5
	var path := PackedVector2Array([
		from_pos,
		Vector2(mid_x, from_pos.y),
		Vector2(mid_x, to_pos.y),
		to_pos
	])
	var glow := edge_color
	glow.a = min(edge_color.a + 0.25, 0.55)
	draw_polyline(path, glow, edge_width + 3.0, true)
	draw_polyline(path, edge_color, edge_width, true)

	if zoom >= 0.9:
		draw_circle(from_pos, 2.4, edge_color)
		draw_circle(to_pos, 2.4, edge_color)


func _draw_node(
	tech_id: int,
	screen_rect: Rect2,
	status: int,
	is_breadcrumb: bool,
	is_focus: bool
) -> void:
	var is_hover := tech_id == hovered_id
	var is_selected := tech_id == selected_id

	var glow_color := _node_glow_color(status, is_hover, is_selected)
	if glow_color.a > 0.0:
		var grow := 6.0
		if is_selected:
			grow = 12.0
		elif is_hover:
			grow = 10.0
		draw_rect(screen_rect.grow(grow), glow_color, true)

	if is_breadcrumb and not is_selected and not is_hover:
		var breadcrumb_glow := COLOR_BREADCRUMB
		if is_focus:
			breadcrumb_glow.a = 0.6
		draw_rect(screen_rect.grow(4.0), breadcrumb_glow, true)

	var style: StyleBoxFlat = node_styles.get(status, null)
	if style != null:
		draw_style_box(style, screen_rect)
	else:
		draw_rect(screen_rect, COLOR_NODE, true)

	var sheen_rect := Rect2(
		screen_rect.position + Vector2(10, 8),
		Vector2(screen_rect.size.x - 20, 6)
	)
	draw_rect(sheen_rect, Color(1, 1, 1, 0.05), true)

	if is_selected:
		var outline: StyleBoxFlat = outline_styles.get("selected", null)
		if outline != null:
			draw_style_box(outline, screen_rect)
	elif is_hover:
		var hover_outline: StyleBoxFlat = outline_styles.get("hover", null)
		if hover_outline != null:
			draw_style_box(hover_outline, screen_rect)
	elif status == STATUS_RESEARCHING:
		var research_outline: StyleBoxFlat = outline_styles.get("research", null)
		if research_outline != null:
			draw_style_box(research_outline, screen_rect)

	var cache: Dictionary = text_cache.get(tech_id, {})
	var name: String = cache.get("name", "")
	var cost: String = cache.get("cost", "")
	var prereqs: String = cache.get("prereqs", "")
	var icon_text: String = cache.get("icon", "")
	var text_color := COLOR_TEXT if status != STATUS_LOCKED else COLOR_TEXT_MUTED

	var pad := 12.0
	var badge_center := screen_rect.position + Vector2(pad + BADGE_RADIUS, pad + BADGE_RADIUS)
	var badge_fill := COLOR_NODE_ALT
	var badge_stroke := COLOR_BORDER
	if status == STATUS_LOCKED:
		badge_fill = COLOR_NODE_LOCKED
		badge_stroke = COLOR_BORDER_LOCKED
	elif status == STATUS_COMPLETE:
		badge_stroke = COLOR_SUCCESS
	elif status == STATUS_AVAILABLE or status == STATUS_RESEARCHING:
		badge_stroke = COLOR_ACCENT
	draw_circle(badge_center, BADGE_RADIUS, badge_fill)
	draw_arc(badge_center, BADGE_RADIUS, 0.0, TAU, 32, badge_stroke, 1.2)

	var icon_rect := Rect2(
		badge_center - Vector2(ICON_DRAW * 0.5, ICON_DRAW * 0.5),
		Vector2(ICON_DRAW, ICON_DRAW)
	)
	if icon_atlas != null and icon_regions.has(tech_id):
		var region: Rect2 = icon_regions[tech_id]
		var modulate := _icon_modulate_for(status, is_hover, is_selected)
		draw_texture_rect_region(icon_atlas, icon_rect, region, modulate, false, true)
	elif icon_text != "" and icon_font != null:
		var icon_size := icon_font.get_string_size(icon_text, HORIZONTAL_ALIGNMENT_LEFT, -1, icon_font_size)
		var icon_pos := badge_center + Vector2(-icon_size.x * 0.5, icon_size.y * 0.35)
		draw_string(icon_font, icon_pos, icon_text, HORIZONTAL_ALIGNMENT_LEFT, -1, icon_font_size, badge_stroke)

	var title_pos := screen_rect.position + Vector2(pad * 2.0 + BADGE_RADIUS * 2.0 - 2.0, pad + 2.0)
	draw_string(label_font, title_pos, name, HORIZONTAL_ALIGNMENT_LEFT, -1, label_font_size, text_color)

	var chip_height: float = max(18.0, float(meta_font_size) + 6.0)
	if zoom >= 0.85:
		if cost != "" and cost_chip_style != null:
			var cost_size: Vector2 = cache.get("cost_size", Vector2.ZERO)
			var cost_width := cost_size.x + 16.0
			var cost_rect := Rect2(
				Vector2(screen_rect.position.x + screen_rect.size.x - cost_width - pad, screen_rect.position.y + pad),
				Vector2(cost_width, chip_height)
			)
			draw_style_box(cost_chip_style, cost_rect)
			var cost_pos := cost_rect.position + Vector2(8, chip_height - 5.0)
			draw_string(meta_font, cost_pos, cost, HORIZONTAL_ALIGNMENT_LEFT, -1, meta_font_size, cost_chip_text_color)

		var status_info: Dictionary = status_cache.get(status, {})
		var status_text := String(status_info.get("text", ""))
		if status_text != "":
			var status_size: Vector2 = status_info.get("size", Vector2.ZERO)
			var status_width := status_size.x + 16.0
			var status_rect := Rect2(
				Vector2(screen_rect.position.x + pad, screen_rect.position.y + screen_rect.size.y - chip_height - pad),
				Vector2(status_width, chip_height)
			)
			var status_box: StyleBoxFlat = chip_styles.get(status, null)
			if status_box != null:
				draw_style_box(status_box, status_rect)
			var status_color: Color = chip_text_colors.get(status, COLOR_TEXT)
			var status_pos := status_rect.position + Vector2(8, chip_height - 5.0)
			draw_string(meta_font, status_pos, status_text, HORIZONTAL_ALIGNMENT_LEFT, -1, meta_font_size, status_color)

		if zoom >= 1.0 and prereqs != "":
			var prereq_pos := title_pos + Vector2(0, label_font_size + 8)
			draw_string(meta_font, prereq_pos, prereqs, HORIZONTAL_ALIGNMENT_LEFT, -1, meta_font_size, COLOR_TEXT_MUTED)

	if status == STATUS_RESEARCHING and research_required > 0:
		var progress: float = clampf(float(research_progress) / float(research_required), 0.0, 1.0)
		var bar_rect := Rect2(
			Vector2(screen_rect.position.x + pad, screen_rect.position.y + screen_rect.size.y - 6.0),
			Vector2(screen_rect.size.x - pad * 2.0, 3.0)
		)
		draw_rect(bar_rect, COLOR_ACCENT_SOFT, true)
		var fill_rect := Rect2(bar_rect.position, Vector2(bar_rect.size.x * progress, bar_rect.size.y))
		draw_rect(fill_rect, COLOR_ACCENT, true)


func _node_glow_color(status: int, is_hover: bool, is_selected: bool) -> Color:
	var base := COLOR_ACCENT
	if status == STATUS_COMPLETE:
		base = COLOR_SUCCESS
	elif status == STATUS_LOCKED:
		base = COLOR_BORDER_LOCKED
	if is_selected:
		base = COLOR_ACCENT_FOCUS

	var alpha := 0.0
	if is_selected:
		alpha = 0.35
	elif is_hover:
		alpha = 0.28
	elif status == STATUS_RESEARCHING:
		alpha = 0.2
	elif status == STATUS_AVAILABLE:
		alpha = 0.14
	elif status == STATUS_COMPLETE:
		alpha = 0.16

	return Color(base.r, base.g, base.b, alpha)


func _icon_modulate_for(status: int, is_hover: bool, is_selected: bool) -> Color:
	var color := COLOR_ACCENT
	if status == STATUS_COMPLETE:
		color = COLOR_SUCCESS
	elif status == STATUS_RESEARCHING:
		color = COLOR_ACCENT_FOCUS
	elif status == STATUS_LOCKED:
		color = COLOR_TEXT_MUTED

	if is_selected:
		color = COLOR_ACCENT_FOCUS
	elif is_hover and status != STATUS_LOCKED:
		color = COLOR_ACCENT_FOCUS.lightened(0.08)

	if status == STATUS_LOCKED:
		color.a = 0.55
	else:
		color.a = 1.0

	return color


func _era_label(era: int) -> String:
	if ERA_NAMES.is_empty():
		return "Era %d" % era
	return ERA_NAMES[era % ERA_NAMES.size()]


func _draw_empty_state() -> void:
	var message := "No tech data"
	var font := label_font if label_font else ThemeDB.fallback_font
	var text_size := font.get_string_size(message, HORIZONTAL_ALIGNMENT_LEFT, -1, label_font_size)
	var pos := (size - text_size) * 0.5
	draw_string(font, pos, message, HORIZONTAL_ALIGNMENT_LEFT, -1, label_font_size, COLOR_TEXT_MUTED)


func _draw_filter_empty_state() -> void:
	var message := "No matching techs"
	var font := label_font if label_font else ThemeDB.fallback_font
	var text_size := font.get_string_size(message, HORIZONTAL_ALIGNMENT_LEFT, -1, label_font_size)
	var pos := (size - text_size) * 0.5
	draw_string(font, pos, message, HORIZONTAL_ALIGNMENT_LEFT, -1, label_font_size, COLOR_TEXT_MUTED)


func _get_minimap_rect() -> Rect2:
	if layout_bounds.size == Vector2.ZERO:
		return Rect2()
	var width: float = min(MINIMAP_SIZE.x, size.x - MINIMAP_MARGIN * 2.0)
	var height: float = min(MINIMAP_SIZE.y, size.y - MINIMAP_MARGIN * 2.0)
	if width <= 0.0 or height <= 0.0:
		return Rect2()
	var rect_size := Vector2(width, height)
	var pos := Vector2(size.x - rect_size.x - MINIMAP_MARGIN, size.y - rect_size.y - MINIMAP_MARGIN)
	return Rect2(pos, rect_size)


func _draw_minimap() -> void:
	var rect := _get_minimap_rect()
	if rect.size == Vector2.ZERO:
		return
	var layout_size := layout_bounds.size
	if layout_size.x <= 0.0 or layout_size.y <= 0.0:
		return

	draw_rect(rect, MINIMAP_BG, true)
	draw_rect(rect, MINIMAP_BORDER, false, 1.0)

	var scale: float = min(rect.size.x / layout_size.x, rect.size.y / layout_size.y)
	var map_size := layout_size * scale
	var map_pos := rect.position + (rect.size - map_size) * 0.5
	var map_rect := Rect2(map_pos, map_size)

	var filter_active := _has_filters()
	for tech_id in node_order:
		if not node_rects.has(tech_id):
			continue
		var node_rect: Rect2 = node_rects[tech_id]
		var center := node_rect.position + node_rect.size * 0.5
		var pos := map_rect.position + (center - layout_bounds.position) * scale
		var color: Color = MINIMAP_NODE
		if filter_active and not filter_ids.has(tech_id):
			color = MINIMAP_NODE_DIM
		elif filter_active:
			color = MINIMAP_NODE_ACTIVE
		draw_circle(pos, 2.0, color)

	var world_top_left := _screen_to_world(Vector2.ZERO)
	var world_bottom_right := _screen_to_world(size)
	var view_rect: Rect2 = Rect2(world_top_left, world_bottom_right - world_top_left).abs()
	var view_pos := map_rect.position + (view_rect.position - layout_bounds.position) * scale
	var view_size := view_rect.size * scale
	var viewport_rect := Rect2(view_pos, view_size)
	draw_rect(viewport_rect, MINIMAP_VIEWPORT, false, 1.5)


func _handle_minimap_press(pos: Vector2) -> bool:
	var rect := _get_minimap_rect()
	if rect.size == Vector2.ZERO or not rect.has_point(pos):
		return false
	minimap_active = true
	drag_active = false
	drag_moved = false
	_pan_to_minimap(pos)
	return true


func _pan_to_minimap(pos: Vector2) -> void:
	if layout_bounds.size == Vector2.ZERO:
		return
	var world_pos := _minimap_to_world(pos)
	pan = size * 0.5 - (world_pos - layout_origin) * zoom
	_clamp_pan()
	queue_redraw()


func _minimap_to_world(pos: Vector2) -> Vector2:
	var rect := _get_minimap_rect()
	if rect.size == Vector2.ZERO:
		return Vector2.ZERO
	var layout_size := layout_bounds.size
	if layout_size.x <= 0.0 or layout_size.y <= 0.0:
		return Vector2.ZERO
	var scale: float = min(rect.size.x / layout_size.x, rect.size.y / layout_size.y)
	var map_size := layout_size * scale
	var map_pos := rect.position + (rect.size - map_size) * 0.5
	var clamped := pos
	clamped.x = clampf(clamped.x, map_pos.x, map_pos.x + map_size.x)
	clamped.y = clampf(clamped.y, map_pos.y, map_pos.y + map_size.y)
	return layout_bounds.position + (clamped - map_pos) / scale

func _resolve_fonts() -> void:
	var fonts := UiTheme.load_fonts()
	label_font = fonts.get("body_bold", null)
	if label_font == null:
		label_font = get_theme_font("font", "Label")
	if label_font == null:
		label_font = ThemeDB.fallback_font
	meta_font = fonts.get("body", label_font)
	era_font = fonts.get("heading", label_font)
	icon_font = fonts.get("body_bold", label_font)

	label_font_size = get_theme_font_size("font_size", "Label")
	if label_font_size <= 0:
		label_font_size = 15
	label_font_size = max(15, label_font_size)
	meta_font_size = max(11, label_font_size - 3)
	era_font_size = max(12, meta_font_size + 1)
	icon_font_size = max(10, meta_font_size - 1)


func _build_status_cache() -> void:
	status_cache = {
		STATUS_LOCKED: {"text": "Locked"},
		STATUS_AVAILABLE: {"text": "Available"},
		STATUS_RESEARCHING: {"text": "Researching"},
		STATUS_COMPLETE: {"text": "Complete"},
	}
	var font := meta_font if meta_font else ThemeDB.fallback_font
	for key in status_cache.keys():
		var text := String(status_cache[key]["text"])
		var size := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, meta_font_size)
		status_cache[key]["size"] = size


func _load_era_header() -> void:
	if ResourceLoader.exists(ERA_HEADER_PATH):
		era_header_texture = load(ERA_HEADER_PATH)
	else:
		era_header_texture = null


func _build_styles() -> void:
	node_styles.clear()
	outline_styles.clear()
	chip_styles.clear()
	chip_text_colors.clear()

	node_styles[STATUS_LOCKED] = _make_node_style(COLOR_NODE_LOCKED, COLOR_BORDER_LOCKED)
	node_styles[STATUS_AVAILABLE] = _make_node_style(COLOR_NODE_ALT, COLOR_ACCENT)
	node_styles[STATUS_RESEARCHING] = _make_node_style(COLOR_NODE_ALT, COLOR_ACCENT_FOCUS)
	node_styles[STATUS_COMPLETE] = _make_node_style(COLOR_NODE_ALT, COLOR_SUCCESS)

	outline_styles["hover"] = _make_outline_style(COLOR_ACCENT_FOCUS, 2)
	outline_styles["selected"] = _make_outline_style(COLOR_ACCENT_FOCUS.lightened(0.08), 3)
	outline_styles["research"] = _make_outline_style(COLOR_ACCENT, 2)

	cost_chip_style = _make_chip_style(Color(0.12, 0.18, 0.26, 0.9), COLOR_BORDER)
	cost_chip_text_color = COLOR_TEXT

	chip_styles[STATUS_LOCKED] = _make_chip_style(Color(0.1, 0.14, 0.2, 0.7), COLOR_BORDER_LOCKED)
	chip_text_colors[STATUS_LOCKED] = COLOR_TEXT_MUTED
	chip_styles[STATUS_AVAILABLE] = _make_chip_style(COLOR_ACCENT, COLOR_ACCENT_FOCUS)
	chip_text_colors[STATUS_AVAILABLE] = Color(0.04, 0.08, 0.1)
	chip_styles[STATUS_RESEARCHING] = _make_chip_style(Color(0.18, 0.72, 0.9), COLOR_ACCENT_FOCUS)
	chip_text_colors[STATUS_RESEARCHING] = Color(0.04, 0.08, 0.1)
	chip_styles[STATUS_COMPLETE] = _make_chip_style(COLOR_SUCCESS, COLOR_SUCCESS.lightened(0.1))
	chip_text_colors[STATUS_COMPLETE] = Color(0.04, 0.08, 0.1)


func _build_icon_atlas() -> void:
	icon_atlas = null
	icon_regions.clear()

	if icon_textures.is_empty():
		return

	var tech_ids: Array[int] = []
	for raw_id in icon_textures.keys():
		var tech_id := int(raw_id)
		var tex: Texture2D = icon_textures.get(tech_id, null)
		if tex != null:
			tech_ids.append(tech_id)

	if tech_ids.is_empty():
		return

	tech_ids.sort()
	var count := tech_ids.size()
	var cols := int(ceil(sqrt(float(count))))
	var rows := int(ceil(float(count) / float(cols)))
	var atlas_width := cols * ICON_CELL
	var atlas_height := rows * ICON_CELL
	var atlas_image := Image.create(atlas_width, atlas_height, false, Image.FORMAT_RGBA8)
	atlas_image.fill(Color(0, 0, 0, 0))

	for idx in range(count):
		var tech_id := tech_ids[idx]
		var tex: Texture2D = icon_textures.get(tech_id, null)
		if tex == null:
			continue
		var icon_image := tex.get_image()
		if icon_image == null:
			continue

		icon_image = _normalize_icon_image(icon_image)
		var col := idx % cols
		var row := idx / cols
		var dst := Vector2i(
			col * ICON_CELL + int((ICON_CELL - ICON_SIZE) * 0.5),
			row * ICON_CELL + int((ICON_CELL - ICON_SIZE) * 0.5)
		)
		atlas_image.blit_rect(icon_image, Rect2i(Vector2i.ZERO, icon_image.get_size()), dst)
		icon_regions[tech_id] = Rect2(dst, Vector2(ICON_SIZE, ICON_SIZE))

	icon_atlas = ImageTexture.create_from_image(atlas_image)


func _normalize_icon_image(image: Image) -> Image:
	var icon := image.duplicate()
	icon.convert(Image.FORMAT_RGBA8)
	icon.resize(ICON_SIZE, ICON_SIZE, Image.INTERPOLATE_LANCZOS)
	var w: int = icon.get_width()
	var h: int = icon.get_height()
	for y in range(h):
		for x in range(w):
			var c: Color = icon.get_pixel(x, y)
			if c.a <= 0.01:
				continue
			var lum: float = c.r * 0.299 + c.g * 0.587 + c.b * 0.114
			icon.set_pixel(x, y, Color(lum, lum, lum, c.a))
	return icon


func _make_node_style(bg_color: Color, border_color: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = bg_color
	box.border_color = border_color
	box.set_border_width_all(1)
	box.set_corner_radius_all(NODE_RADIUS)
	box.shadow_size = 0
	box.shadow_color = Color(0, 0, 0, 0)
	return box


func _make_outline_style(border_color: Color, width: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0, 0, 0, 0)
	box.border_color = border_color
	box.set_border_width_all(width)
	box.set_corner_radius_all(NODE_RADIUS)
	box.shadow_size = 0
	return box


func _make_chip_style(bg_color: Color, border_color: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = bg_color
	box.border_color = border_color
	box.set_border_width_all(1)
	box.set_corner_radius_all(8)
	box.shadow_size = 0
	return box


func _build_dependents() -> void:
	dependents.clear()
	for tech_id in tech_data.keys():
		dependents[int(tech_id)] = []
	for tech_id in tech_data.keys():
		var tech: Dictionary = tech_data[tech_id]
		var prereqs: Array = tech.get("prereqs", [])
		for prereq in prereqs:
			var pid := int(prereq)
			if not dependents.has(pid):
				dependents[pid] = []
			dependents[pid].append(int(tech_id))


func _rebuild_layout() -> void:
	node_rects.clear()
	node_order.clear()
	edges.clear()
	text_cache.clear()
	era_bands.clear()
	layout_bounds = Rect2()

	if tech_data.is_empty():
		layout_dirty = false
		last_size = size
		return

	var tiers := _compute_tiers()

	var eras: Array[int] = []
	for tech_id in tech_data.keys():
		var tech: Dictionary = tech_data[tech_id]
		eras.append(int(tech.get("era", 0)))
	eras.sort()
	var unique_eras: Array[int] = []
	for era in eras:
		if unique_eras.is_empty() or unique_eras[-1] != era:
			unique_eras.append(era)
	eras = unique_eras
	tiers_cache = tiers
	filter_eras = eras.duplicate()
	var tier_values: Array[int] = []
	for tier_value in tiers_cache.values():
		tier_values.append(int(tier_value))
	tier_values.sort()
	filter_tiers = _unique_sorted_ints(tier_values)
	_update_filter_set()

	var buckets: Dictionary = {}
	for tech_id in tech_data.keys():
		var tid := int(tech_id)
		var tech: Dictionary = tech_data[tech_id]
		var era := int(tech.get("era", 0))
		var tier := int(tiers.get(tid, 0))
		var key := "%d:%d" % [era, tier]
		if not buckets.has(key):
			buckets[key] = []
		buckets[key].append(tid)

	for key in buckets.keys():
		buckets[key].sort()

	var row_index: Dictionary = {}
	for era in eras:
		var tiers_in_era: Array[int] = []
		for tech_id in tech_data.keys():
			var tech: Dictionary = tech_data[tech_id]
			if int(tech.get("era", 0)) == era:
				tiers_in_era.append(int(tiers.get(int(tech_id), 0)))
		tiers_in_era.sort()
		var unique_tiers: Array[int] = []
		for tier_value in tiers_in_era:
			if unique_tiers.is_empty() or unique_tiers[-1] != tier_value:
				unique_tiers.append(tier_value)
		tiers_in_era = unique_tiers

		var row_cursor := 0
		for tier in tiers_in_era:
			var key := "%d:%d" % [era, tier]
			var ids: Array = buckets.get(key, [])
			for idx in range(ids.size()):
				row_index[int(ids[idx])] = row_cursor + idx
			row_cursor += max(ids.size(), 1)

	node_order.clear()
	for key in tech_data.keys():
		node_order.append(int(key))
	node_order.sort_custom(func(a, b):
		var tech_a: Dictionary = tech_data[a]
		var tech_b: Dictionary = tech_data[b]
		var era_a := int(tech_a.get("era", 0))
		var era_b := int(tech_b.get("era", 0))
		if era_a != era_b:
			return era_a < era_b
		var tier_a := int(tiers.get(a, 0))
		var tier_b := int(tiers.get(b, 0))
		if tier_a != tier_b:
			return tier_a < tier_b
		return a < b
	)

	for tech_id in node_order:
		var tech: Dictionary = tech_data[tech_id]
		var era := int(tech.get("era", 0))
		var col := eras.find(era)
		if col < 0:
			col = 0
		var row := int(row_index.get(tech_id, 0))
		var pos := Vector2(
			col * (NODE_SIZE.x + COL_GAP),
			row * (NODE_SIZE.y + ROW_GAP)
		)
		node_rects[tech_id] = Rect2(pos, NODE_SIZE)

	for tech_id in tech_data.keys():
		var tech: Dictionary = tech_data[tech_id]
		var prereqs: Array = tech.get("prereqs", [])
		for prereq in prereqs:
			var pid := int(prereq)
			if tech_data.has(pid):
				edges.append(Vector2i(pid, int(tech_id)))

	var min_x := INF
	var min_y := INF
	var max_x := -INF
	var max_y := -INF
	for rect in node_rects.values():
		min_x = min(min_x, rect.position.x)
		min_y = min(min_y, rect.position.y)
		max_x = max(max_x, rect.position.x + rect.size.x)
		max_y = max(max_y, rect.position.y + rect.size.y)

	if min_x == INF:
		layout_bounds = Rect2()
	else:
		var padding := Vector2(40, 40)
		layout_bounds = Rect2(Vector2(min_x, min_y), Vector2(max_x - min_x, max_y - min_y))
		layout_bounds.position -= padding
		layout_bounds.size += padding * 2.0
		layout_bounds.position.y -= ERA_HEADER_HEIGHT
		layout_bounds.size.y += ERA_HEADER_HEIGHT

		era_bands.clear()
		for col in range(eras.size()):
			var band_x := col * (NODE_SIZE.x + COL_GAP) - BAND_PAD
			var band_rect := Rect2(
				Vector2(band_x, layout_bounds.position.y),
				Vector2(NODE_SIZE.x + BAND_PAD * 2.0, layout_bounds.size.y)
			)
			era_bands.append({
				"era": eras[col],
				"rect": band_rect,
			})

	layout_origin = layout_bounds.position
	_cache_text()

	if recenter_on_layout:
		var content_size := layout_bounds.size * zoom
		pan = (size - content_size) * 0.5
		recenter_on_layout = false
	layout_dirty = false
	last_size = size
	size_dirty = false
	_clamp_pan()


func _cache_text() -> void:
	text_cache.clear()
	var font := label_font if label_font else ThemeDB.fallback_font
	var meta := meta_font if meta_font else ThemeDB.fallback_font
	for tech_id in tech_data.keys():
		var tech: Dictionary = tech_data[tech_id]
		var name := String(tech.get("name", "Tech %d" % int(tech_id)))
		var cost := "%d Sci" % int(tech.get("cost", 0))
		var prereqs: Variant = tech.get("prereqs", [])
		var prereq_label := ""
		if typeof(prereqs) == TYPE_ARRAY and not prereqs.is_empty():
			prereq_label = "Req %d" % prereqs.size()

		var icon := ""
		if not name.is_empty():
			icon = name.left(1).to_upper()

		text_cache[int(tech_id)] = {
			"name": name,
			"cost": cost,
			"prereqs": prereq_label,
			"icon": icon,
			"name_size": font.get_string_size(name, HORIZONTAL_ALIGNMENT_LEFT, -1, label_font_size),
			"cost_size": meta.get_string_size(cost, HORIZONTAL_ALIGNMENT_LEFT, -1, meta_font_size),
			"prereqs_size": meta.get_string_size(prereq_label, HORIZONTAL_ALIGNMENT_LEFT, -1, meta_font_size),
		}


func _compute_tiers() -> Dictionary:
	var tiers: Dictionary = {}
	var visiting: Dictionary = {}

	for tech_id in tech_data.keys():
		_tier_for(int(tech_id), tiers, visiting)

	return tiers


func _tier_for(tech_id: int, tiers: Dictionary, visiting: Dictionary) -> int:
	if tiers.has(tech_id):
		return int(tiers[tech_id])
	if visiting.has(tech_id):
		return 0
	visiting[tech_id] = true
	var tier := 0
	var tech: Dictionary = tech_data.get(tech_id, {})
	var prereqs: Array = tech.get("prereqs", [])
	for prereq in prereqs:
		tier = max(tier, _tier_for(int(prereq), tiers, visiting) + 1)
	visiting.erase(tech_id)
	tiers[tech_id] = tier
	return tier


func _status_for(tech_id: int) -> int:
	if known_techs.has(tech_id):
		return STATUS_COMPLETE
	if tech_id == current_research:
		return STATUS_RESEARCHING
	if _can_research(tech_id):
		return STATUS_AVAILABLE
	return STATUS_LOCKED


func _can_research(tech_id: int) -> bool:
	if known_techs.has(tech_id):
		return false
	var tech: Dictionary = tech_data.get(tech_id, {})
	var prereqs: Array = tech.get("prereqs", [])
	for prereq in prereqs:
		if not known_techs.has(int(prereq)):
			return false
	return true


func _world_rect_to_screen(rect: Rect2) -> Rect2:
	var pos := _world_to_screen(rect.position)
	return Rect2(pos, rect.size * zoom)


func _world_to_screen(pos: Vector2) -> Vector2:
	return (pos - layout_origin) * zoom + pan


func _screen_to_world(pos: Vector2) -> Vector2:
	return (pos - pan) / zoom + layout_origin


func _hit_test(pos: Vector2) -> int:
	if layout_dirty:
		_rebuild_layout()
	var world_pos := _screen_to_world(pos)
	var filter_active := _has_filters()
	for tech_id in node_order:
		if filter_active and not filter_ids.has(tech_id):
			continue
		var rect: Rect2 = node_rects.get(tech_id, Rect2())
		if rect.has_point(world_pos):
			return tech_id
	return -1


func _apply_zoom(factor: float, anchor: Vector2) -> void:
	var base_zoom := zoom_target
	var new_zoom: float = clamp(base_zoom * factor, ZOOM_MIN, ZOOM_MAX)
	var snapped := _snap_zoom(new_zoom)
	if abs(snapped - zoom_target) <= 0.0001:
		return
	zoom_anchor_screen = anchor
	zoom_anchor_world = _screen_to_world(anchor)
	zoom_target = snapped
	zoom_animating = true
	queue_redraw()


func _snap_zoom(value: float) -> float:
	var best: float = float(ZOOM_SNAP_LEVELS[0])
	var best_dist: float = absf(value - best)
	for level in ZOOM_SNAP_LEVELS:
		var candidate: float = float(level)
		var dist: float = absf(value - candidate)
		if dist < best_dist:
			best = candidate
			best_dist = dist
	return clampf(best, ZOOM_MIN, ZOOM_MAX)


func _process(delta: float) -> void:
	if not zoom_animating:
		return
	var step: float = min(1.0, ZOOM_LERP_SPEED * delta)
	zoom = lerp(zoom, zoom_target, step)
	if abs(zoom - zoom_target) <= 0.001:
		zoom = zoom_target
		zoom_animating = false
	pan = zoom_anchor_screen - (zoom_anchor_world - layout_origin) * zoom
	_clamp_pan()
	queue_redraw()


func _build_prereq_chain(tech_id: int) -> Dictionary:
	var chain: Dictionary = {}
	_collect_prereqs(tech_id, chain)
	return chain


func _collect_prereqs(tech_id: int, chain: Dictionary) -> void:
	if tech_id < 0 or chain.has(tech_id):
		return
	chain[tech_id] = true
	var tech: Dictionary = tech_data.get(tech_id, {})
	var prereqs: Array = tech.get("prereqs", [])
	for prereq in prereqs:
		_collect_prereqs(int(prereq), chain)


func _build_prereq_edges(chain: Dictionary) -> Dictionary:
	var edges_out: Dictionary = {}
	for tech_id in chain.keys():
		var tech: Dictionary = tech_data.get(tech_id, {})
		var prereqs: Array = tech.get("prereqs", [])
		for prereq in prereqs:
			var pid := int(prereq)
			if chain.has(pid):
				edges_out[Vector2i(pid, int(tech_id))] = true
	return edges_out


func _clamp_pan() -> void:
	if layout_bounds.size == Vector2.ZERO:
		return
	var content_size := layout_bounds.size * zoom
	var margin := 30.0

	var min_x := size.x - content_size.x - margin
	var max_x := margin
	if content_size.x <= size.x:
		min_x = (size.x - content_size.x) * 0.5
		max_x = min_x

	var min_y := size.y - content_size.y - margin
	var max_y := margin
	if content_size.y <= size.y:
		min_y = (size.y - content_size.y) * 0.5
		max_y = min_y

	pan.x = clamp(pan.x, min_x, max_x)
	pan.y = clamp(pan.y, min_y, max_y)
