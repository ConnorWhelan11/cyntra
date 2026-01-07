# gdlint:ignore = class-definitions-order
extends SubViewportContainer
class_name Unit3DLayer

## 3D rendering layer for units, rendered to a SubViewport
## and composited over the 2D hex map.

@onready var viewport: SubViewport = $SubViewport
@onready var camera: Camera3D = $SubViewport/Camera3D
@onready var unit_manager: Unit3DManager = $SubViewport/Unit3DManager

# Camera settings for isometric-like view
const CAMERA_DISTANCE := 50.0
const CAMERA_ANGLE := -55.0  # Degrees from horizontal (match terrain view)
const CAMERA_FOV := 45.0
const PIXEL_HEX_SIZE := 36.0
const PICK_MASK := 1
const CAMERA_SIZE_FACTOR := 0.5  # Orthographic size is half-height in world units.
const DEBUG_ANCHOR_ENABLED := true
const DEBUG_LOGS := true

# Map size tracking for camera positioning
var _map_width: int = 0
var _map_height: int = 0
var _zoom_level: float = 1.0
var _camera_offset: Vector2 = Vector2.ZERO
var _debug_anchor: MeshInstance3D = null


func _ready() -> void:
	# Force fullscreen sizing for CanvasLayer child
	_force_fullscreen_size()
	get_tree().root.size_changed.connect(_force_fullscreen_size)

	# Setup camera
	if camera:
		camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		_apply_camera_zoom()
		camera.far = 200.0
		camera.near = 0.1
		camera.rotation_degrees = Vector3(CAMERA_ANGLE, 0, 0)
	if viewport:
		viewport.own_world_3d = true
		if viewport.world_3d == null:
			viewport.world_3d = World3D.new()
		viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS

	_ensure_debug_anchor()
	if DEBUG_LOGS and camera and viewport:
		print("[Unit3DLayer] viewport=%s camera_size=%.3f zoom=%.3f" % [str(viewport.size), camera.size, _zoom_level])


func _force_fullscreen_size() -> void:
	"""Force SubViewportContainer to fill the screen when inside CanvasLayer."""
	var window_size := get_tree().root.size
	# Use set_deferred to avoid anchor conflicts
	set_deferred("position", Vector2.ZERO)
	set_deferred("size", window_size)
	if viewport:
		viewport.size = window_size
	_apply_camera_zoom()
	_update_camera_position()


func set_map_dimensions(width: int, height: int) -> void:
	"""Set the hex map dimensions for camera bounds."""
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
		_apply_camera_zoom()
	_update_camera_position()

func _apply_camera_zoom() -> void:
	if not camera:
		return
	var window_size := get_tree().root.size
	if viewport:
		window_size = Vector2(viewport.size)
	var hex_size_3d: float = unit_manager.HEX_SIZE if unit_manager else 1.0
	var zoom: float = _zoom_level
	if zoom < 0.001:
		zoom = 0.001
	var world_units_per_pixel: float = hex_size_3d / (PIXEL_HEX_SIZE * zoom)
	camera.size = float(window_size.y) * world_units_per_pixel * CAMERA_SIZE_FACTOR


func _ensure_debug_anchor() -> void:
	if not DEBUG_ANCHOR_ENABLED or not unit_manager:
		if _debug_anchor:
			_debug_anchor.queue_free()
			_debug_anchor = null
		return
	if _debug_anchor:
		_debug_anchor.position = unit_manager.hex_to_world(Vector2i.ZERO)
		return

	var anchor := MeshInstance3D.new()
	anchor.name = "DebugAnchor"
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.35, 0.35, 0.35)
	anchor.mesh = mesh

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1, 0, 1, 0.95)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	anchor.set_surface_override_material(0, mat)
	anchor.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	anchor.position = unit_manager.hex_to_world(Vector2i.ZERO)
	unit_manager.add_child(anchor)
	_debug_anchor = anchor


func _update_camera_position() -> void:
	if not camera:
		return

	# Convert 2D camera offset (pixels) to 3D position (world units)
	var hex_size_3d: float = unit_manager.HEX_SIZE if unit_manager else 1.0

	# Convert pixel offset to hex-world offset
	# Divide by 2D hex pixel size, then multiply by 3D hex world size
	# Also account for zoom (camera offset in pixels is already zoomed)
	var scale_factor: float = hex_size_3d / (PIXEL_HEX_SIZE * _zoom_level)
	var cam_x: float = -_camera_offset.x * scale_factor  # Negative because camera offset is inverted
	var cam_z: float = -_camera_offset.y * scale_factor

	# Isometric-ish camera so 3D units read with depth.
	var height := CAMERA_DISTANCE * cos(deg_to_rad(-CAMERA_ANGLE))
	var back := CAMERA_DISTANCE * sin(deg_to_rad(-CAMERA_ANGLE))
	camera.position = Vector3(cam_x, height, cam_z + back)
	camera.look_at(Vector3(cam_x, 0, cam_z), Vector3.UP)


func pick_unit(screen_pos: Vector2) -> int:
	if not viewport or not camera:
		return -1
	var rect := get_global_rect()
	if not rect.has_point(screen_pos):
		return -1
	if rect.size.x <= 0.0 or rect.size.y <= 0.0:
		return -1

	var local := screen_pos - rect.position
	var viewport_size := Vector2(viewport.size)
	var vp_pos := Vector2(
		local.x * viewport_size.x / rect.size.x,
		local.y * viewport_size.y / rect.size.y
	)

	var origin := camera.project_ray_origin(vp_pos)
	var dir := camera.project_ray_normal(vp_pos)
	var to := origin + dir * 200.0

	var world := viewport.get_world_3d()
	if world == null:
		return -1
	var space_state := world.direct_space_state
	var params := PhysicsRayQueryParameters3D.create(origin, to)
	params.collision_mask = PICK_MASK
	params.collide_with_areas = true
	params.collide_with_bodies = true
	var result := space_state.intersect_ray(params)
	if result.is_empty():
		return -1
	var collider = result.get("collider", null)
	if collider != null and collider.has_meta("unit_id"):
		return _coerce_unit_id(collider.get_meta("unit_id"))
	return -1


func _coerce_unit_id(value) -> int:
	if value == null:
		return -1
	var value_type := typeof(value)
	if value_type == TYPE_INT:
		return value
	if value_type == TYPE_FLOAT:
		return int(value)
	if value_type == TYPE_STRING or value_type == TYPE_STRING_NAME:
		return String(value).to_int()
	return -1


func get_unit_manager() -> Unit3DManager:
	return unit_manager


# Forwarding methods to unit manager
func spawn_unit(unit_id: int, type_id: int, owner_id: int, hex_pos: Vector2i) -> Unit3D:
	return unit_manager.spawn_unit(unit_id, type_id, owner_id, hex_pos)


func despawn_unit(unit_id: int) -> void:
	unit_manager.despawn_unit(unit_id)


func move_unit(unit_id: int, from_hex: Vector2i, to_hex: Vector2i, duration: float = 0.5) -> void:
	unit_manager.move_unit(unit_id, from_hex, to_hex, duration)


func sync_units(unit_data: Array) -> void:
	unit_manager.sync_units(unit_data)


func clear_all_units() -> void:
	unit_manager.clear_all_units()


func apply_unit_types(unit_types: Array) -> void:
	unit_manager.apply_unit_types(unit_types)
