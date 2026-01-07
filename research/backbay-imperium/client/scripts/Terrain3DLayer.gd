# gdlint:ignore = class-definitions-order
extends SubViewportContainer
class_name Terrain3DLayer

## 3D rendering layer for terrain, rendered to a SubViewport
## and composited under units/UI.
## Uses PBR materials for professional terrain appearance.

@onready var viewport: SubViewport = $SubViewport
@onready var camera: Camera3D = $SubViewport/Camera3D
@onready var terrain_root: Node3D = $SubViewport/TerrainRoot
@onready var sun_light: DirectionalLight3D = $SubViewport/DirectionalLight3D
@onready var environment: WorldEnvironment = $SubViewport/WorldEnvironment

# Camera settings for isometric-like view
const CAMERA_DISTANCE := 50.0
const CAMERA_ANGLE := -55.0  # Degrees from horizontal (steeper for terrain)
const HEX_SIZE := 1.0

# Map state
var _map_width: int = 0
var _map_height: int = 0
var _zoom_level: float = 1.0
var _camera_offset: Vector2 = Vector2.ZERO

# Tile rendering
var _tile_meshes: Dictionary = {}  # Vector2i -> MeshInstance3D
var _material_loader = null  # Terrain3DMaterialLoader, set in _ready
var _hex_mesh_cache: Dictionary = {}  # height_key -> ArrayMesh
var _water_mesh_instance: MeshInstance3D = null

# Terrain data
var _tiles: Array = []
var _terrain_id_to_name: Dictionary = {}


func _ready() -> void:
	# Initialize material loader (deferred to avoid cyclic class loading)
	var MaterialLoaderScript = preload("res://scripts/Terrain3DMaterialLoader.gd")
	_material_loader = MaterialLoaderScript.new()

	# Force fullscreen sizing for CanvasLayer child
	_force_fullscreen_size()
	get_tree().root.size_changed.connect(_force_fullscreen_size)

	if camera:
		camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		camera.size = 25.0
		camera.far = 200.0
		camera.near = 0.1
		camera.rotation_degrees = Vector3(CAMERA_ANGLE, 0, 0)

	if sun_light:
		sun_light.rotation_degrees = Vector3(-45, 30, 0)
		sun_light.light_energy = 1.2
		sun_light.shadow_enabled = true


func _force_fullscreen_size() -> void:
	"""Force SubViewportContainer to fill the screen when inside CanvasLayer."""
	var window_size := get_tree().root.size
	# Use set_deferred to avoid anchor conflicts
	set_deferred("position", Vector2.ZERO)
	set_deferred("size", window_size)
	# Don't set viewport size directly - stretch mode handles it


func set_map_dimensions(width: int, height: int) -> void:
	"""Set the hex map dimensions."""
	if _map_width == width and _map_height == height:
		return

	_map_width = width
	_map_height = height
	_update_camera_position()


func set_camera_offset(offset: Vector2) -> void:
	"""Set camera offset to match 2D map view pan."""
	_camera_offset = offset
	_update_camera_position()


func set_zoom_level(zoom: float) -> void:
	"""Set zoom level to match 2D map view."""
	_zoom_level = zoom
	if camera:
		camera.size = 25.0 / zoom
	_update_camera_position()


func _update_camera_position() -> void:
	if not camera:
		return

	# Convert 2D camera offset (pixels) to 3D position (world units)
	const PIXEL_HEX_SIZE := 36.0

	var scale_factor := HEX_SIZE / (PIXEL_HEX_SIZE * _zoom_level)
	var cam_x := -_camera_offset.x * scale_factor
	var cam_z := -_camera_offset.y * scale_factor

	var height := CAMERA_DISTANCE * cos(deg_to_rad(-CAMERA_ANGLE))
	var back := CAMERA_DISTANCE * sin(deg_to_rad(-CAMERA_ANGLE))

	camera.position = Vector3(cam_x, height, cam_z + back)
	camera.look_at(Vector3(cam_x, 0, cam_z), Vector3.UP)


func set_rules_catalog(catalog: Dictionary) -> void:
	"""Apply rules catalog to material loader."""
	_material_loader.apply_rules_catalog(catalog)

	# Cache terrain ID to name mapping
	_terrain_id_to_name.clear()
	var terrains = catalog.get("terrains", [])
	if typeof(terrains) == TYPE_ARRAY:
		for t in terrains:
			if typeof(t) != TYPE_DICTIONARY:
				continue
			var td: Dictionary = t
			var tid := _parse_runtime_id(td.get("id", -1))
			if tid < 0:
				continue
			var terrain_name := _normalize_label(td.get("ui_icon", null))
			if terrain_name.is_empty():
				terrain_name = _normalize_label(td.get("name", null))
			if not terrain_name.is_empty():
				_terrain_id_to_name[tid] = terrain_name


func load_terrain(tiles: Array, map_width: int, map_height: int) -> void:
	"""Load terrain data and create 3D meshes."""
	_tiles = tiles
	set_map_dimensions(map_width, map_height)

	# Clear existing meshes
	_clear_terrain()

	# Create terrain meshes
	for r in range(map_height):
		for q in range(map_width):
			var idx := r * map_width + q
			if idx >= tiles.size():
				continue

			var tile_data: Dictionary = {}
			if typeof(tiles[idx]) == TYPE_DICTIONARY:
				tile_data = tiles[idx]

			_create_tile_mesh(Vector2i(q, r), tile_data)

	# Create water plane for ocean areas
	_create_water_plane()



func _create_tile_mesh(hex: Vector2i, tile_data: Dictionary) -> void:
	"""Create a 3D mesh for a single tile."""
	if not terrain_root:
		return

	# Get terrain type
	var terrain_id := 0
	var terrain_data = tile_data.get("terrain", {})
	if typeof(terrain_data) == TYPE_DICTIONARY:
		terrain_id = int(terrain_data.get("raw", 0))
	elif typeof(terrain_data) == TYPE_INT or typeof(terrain_data) == TYPE_FLOAT:
		terrain_id = int(terrain_data)

	var terrain_name: String = _terrain_id_to_name.get(terrain_id, "grassland")

	# Skip ocean tiles (they'll be covered by water plane)
	if terrain_name == "ocean":
		return

	# Get height for this terrain type
	var height: float = _material_loader.get_terrain_height(terrain_name)

	# Get or create hex mesh for this height
	var mesh := _get_hex_mesh_for_height(height)

	# Create mesh instance
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.mesh = mesh

	# Use appropriate material based on terrain type
	if terrain_name == "coast":
		mesh_instance.material_override = _material_loader.get_coast_material()
	elif terrain_name == "lake":
		mesh_instance.material_override = _material_loader.get_lake_material()
	else:
		mesh_instance.material_override = _material_loader.get_material_for_terrain(terrain_name)

	# Position in world coordinates
	var world_pos := HexMeshGenerator.axial_to_world(hex.x, hex.y)
	mesh_instance.position = world_pos

	terrain_root.add_child(mesh_instance)
	_tile_meshes[hex] = mesh_instance


func _get_hex_mesh_for_height(height: float) -> ArrayMesh:
	"""Get or create a hex mesh for a specific height."""
	var key := "h%.2f" % height
	if _hex_mesh_cache.has(key):
		return _hex_mesh_cache[key]

	var mesh := HexMeshGenerator.create_hex_mesh_with_height(height)
	_hex_mesh_cache[key] = mesh
	return mesh


func _create_water_plane() -> void:
	"""Create a water plane covering ocean areas."""
	if not terrain_root:
		return

	if _water_mesh_instance:
		_water_mesh_instance.queue_free()
		_water_mesh_instance = null

	var water_mesh := HexMeshGenerator.create_water_plane(_map_width, _map_height)
	_water_mesh_instance = MeshInstance3D.new()
	_water_mesh_instance.mesh = water_mesh
	_water_mesh_instance.material_override = _material_loader.get_water_material()

	terrain_root.add_child(_water_mesh_instance)


func _clear_terrain() -> void:
	"""Remove all terrain meshes."""
	for hex in _tile_meshes.keys():
		var mesh_instance: MeshInstance3D = _tile_meshes[hex]
		if mesh_instance:
			mesh_instance.queue_free()
	_tile_meshes.clear()

	if _water_mesh_instance:
		_water_mesh_instance.queue_free()
		_water_mesh_instance = null


func update_tile(hex: Vector2i, tile_data: Dictionary) -> void:
	"""Update a single tile's mesh (for visibility changes, etc.)."""
	# Remove existing mesh
	if _tile_meshes.has(hex):
		_tile_meshes[hex].queue_free()
		_tile_meshes.erase(hex)

	# Create new mesh
	_create_tile_mesh(hex, tile_data)


func set_fog_of_war(visible_tiles: Dictionary, explored_tiles: Dictionary) -> void:
	"""Apply fog of war to terrain tiles."""
	for hex in _tile_meshes.keys():
		var mesh_instance: MeshInstance3D = _tile_meshes[hex]
		if not mesh_instance:
			continue

		var is_visible := visible_tiles.has(hex)
		var is_explored := explored_tiles.has(hex)

		if not is_explored:
			mesh_instance.visible = false
		elif not is_visible:
			mesh_instance.visible = true
			# Darken unexplored tiles
			var mat: StandardMaterial3D = mesh_instance.material_override
			if mat:
				var dimmed := mat.duplicate()
				dimmed.albedo_color = dimmed.albedo_color.darkened(0.35)
				mesh_instance.material_override = dimmed
		else:
			mesh_instance.visible = true


func _parse_runtime_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
	return int(value)


func _normalize_label(value: Variant) -> String:
	if typeof(value) != TYPE_STRING:
		return ""
	var label := String(value).strip_edges().to_lower()
	return label.replace(" ", "_")
