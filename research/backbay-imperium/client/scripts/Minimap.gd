extends Control
class_name Minimap

## Minimap component showing an overview of the entire map.
## Click to navigate to any location.

signal minimap_clicked(hex: Vector2i)

const MINIMAP_SIZE := Vector2(180, 180)

@onready var _background: ColorRect = $Background
@onready var minimap_texture: TextureRect = $MinimapTexture

# Map data
var map_width := 0
var map_height := 0
var tiles: Array = []
var cities: Dictionary = {}
var units: Dictionary = {}
var my_player_id := 0

# Viewport indicator (the rectangle showing current view)
var viewport_hex_bounds: Rect2 = Rect2()

# Cached texture
var cached_texture: ImageTexture = null
var needs_regenerate := true


func _ready() -> void:
	custom_minimum_size = MINIMAP_SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			var hex := _screen_to_hex(event.position)
			minimap_clicked.emit(hex)
			AudioManager.play("ui_click")
			get_viewport().set_input_as_handled()


func _draw() -> void:
	if map_width <= 0 or map_height <= 0:
		return

	# Draw viewport indicator rectangle
	if viewport_hex_bounds.size.x > 0 and viewport_hex_bounds.size.y > 0:
		var scale := _get_scale()
		var rect := Rect2(
			viewport_hex_bounds.position * scale,
			viewport_hex_bounds.size * scale
		)

		# Clamp to minimap bounds
		rect.position.x = clampf(rect.position.x, 0, size.x)
		rect.position.y = clampf(rect.position.y, 0, size.y)
		rect.size.x = clampf(rect.size.x, 4, size.x - rect.position.x)
		rect.size.y = clampf(rect.size.y, 4, size.y - rect.position.y)

		draw_rect(rect, Color.WHITE, false, 2.0)

	# Draw city markers on top of texture
	var scale := _get_scale()
	for city_id in cities.keys():
		var city: Dictionary = cities[city_id]
		var pos := _city_hex(city)
		if pos.x < 0 or pos.y < 0:
			continue

		var screen_pos := Vector2(pos) * scale
		var owner := _get_owner(city)
		var color := Color(0.3, 0.7, 1.0) if owner == my_player_id else Color(1.0, 0.4, 0.3)

		# Draw city as small rectangle
		var rect := Rect2(screen_pos - Vector2(2, 2), Vector2(4, 4))
		draw_rect(rect, color)
		draw_rect(rect, Color.WHITE, false, 1.0)


func update_from_snapshot(snapshot: Dictionary) -> void:
	var map_data: Dictionary = snapshot.get("map", {})
	var new_width = int(map_data.get("width", 0))
	var new_height = int(map_data.get("height", 0))

	# Check if map size changed
	if new_width != map_width or new_height != map_height:
		map_width = new_width
		map_height = new_height
		needs_regenerate = true

	tiles = map_data.get("tiles", [])

	# Extract cities
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

	# Extract units (for potential future use)
	units.clear()
	for unit_data in snapshot.get("units", []):
		if typeof(unit_data) == TYPE_DICTIONARY:
			var uid = unit_data.get("id", {})
			var unit_id: int
			if typeof(uid) == TYPE_DICTIONARY:
				unit_id = int(uid.get("index", 0)) + int(uid.get("generation", 0)) * 10000
			else:
				unit_id = int(uid)
			units[unit_id] = unit_data

	if needs_regenerate:
		_regenerate_texture()
		needs_regenerate = false

	queue_redraw()


func set_my_player_id(pid: int) -> void:
	my_player_id = pid


func set_viewport_bounds(bounds: Rect2) -> void:
	viewport_hex_bounds = bounds
	queue_redraw()


func _regenerate_texture() -> void:
	if map_width <= 0 or map_height <= 0:
		return

	# Create image
	var img := Image.create(map_width, map_height, false, Image.FORMAT_RGBA8)

	# Draw terrain
	for r in range(map_height):
		for q in range(map_width):
			var idx := r * map_width + q
			var terrain_id := _get_terrain_id(idx)
			var color := TerrainColors.get_terrain_color(terrain_id)
			img.set_pixel(q, r, color)

	# Create texture
	cached_texture = ImageTexture.create_from_image(img)
	minimap_texture.texture = cached_texture

	# Scale texture to fit minimap
	minimap_texture.custom_minimum_size = size
	minimap_texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED


func _get_terrain_id(tile_idx: int) -> int:
	if tile_idx < 0 or tile_idx >= tiles.size():
		return 0

	var tile = tiles[tile_idx]
	if typeof(tile) != TYPE_DICTIONARY:
		return 0

	var terrain_data = tile.get("terrain", {})
	if typeof(terrain_data) == TYPE_DICTIONARY:
		return int(terrain_data.get("raw", 0))
	elif typeof(terrain_data) == TYPE_INT or typeof(terrain_data) == TYPE_FLOAT:
		return int(terrain_data)
	return 0


func _city_hex(city: Dictionary) -> Vector2i:
	var pos_data = city.get("pos", {})
	if typeof(pos_data) == TYPE_DICTIONARY:
		return Vector2i(int(pos_data.get("q", -1)), int(pos_data.get("r", -1)))
	return Vector2i(-1, -1)


func _get_owner(entity: Dictionary) -> int:
	var owner_data = entity.get("owner", {})
	if typeof(owner_data) == TYPE_DICTIONARY:
		return int(owner_data.get("0", -1))
	return int(owner_data)


func _get_scale() -> Vector2:
	if map_width <= 0 or map_height <= 0:
		return Vector2.ONE
	return size / Vector2(map_width, map_height)


func _screen_to_hex(screen_pos: Vector2) -> Vector2i:
	if map_width <= 0 or map_height <= 0:
		return Vector2i(-1, -1)

	var scale := _get_scale()
	var hex := Vector2i(
		int(screen_pos.x / scale.x),
		int(screen_pos.y / scale.y)
	)

	# Clamp to map bounds
	hex.x = clampi(hex.x, 0, map_width - 1)
	hex.y = clampi(hex.y, 0, map_height - 1)

	return hex
