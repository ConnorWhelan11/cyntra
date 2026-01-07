# gdlint:ignore = class-definitions-order
extends Node3D
class_name Unit3DManager

## Manages all 3D unit instances on the map.
## Handles spawning, despawning, and coordinating unit positions with the hex grid.

signal unit_clicked(unit_id: int)

const HEX_SIZE := 1.0  # World units per hex (adjust to match your map scale)
const UNIT_HEIGHT := 0.1  # Height above ground

# Unit type name mapping (from runtime ID to model name)
var _unit_type_names: Dictionary = {}  # unit_type_id -> String (e.g., "warrior")

# Active unit instances
var _units: Dictionary = {}  # unit_id -> Unit3D

# Owner colors for player identification
var _owner_colors: Dictionary = {
	0: Color(0.2, 0.6, 1.0),   # Blue (player)
	1: Color(1.0, 0.3, 0.3),   # Red
	2: Color(0.3, 1.0, 0.3),   # Green
	3: Color(1.0, 1.0, 0.3),   # Yellow
	4: Color(1.0, 0.3, 1.0),   # Magenta
	5: Color(0.3, 1.0, 1.0),   # Cyan
	6: Color(1.0, 0.6, 0.2),   # Orange
	7: Color(0.6, 0.3, 0.8),   # Purple
}

# Reference to texture loader for unit type names
var _texture_loader: TextureLoader = null


func _ready() -> void:
	pass


func set_texture_loader(loader: TextureLoader) -> void:
	"""Set reference to TextureLoader for unit type name lookups."""
	_texture_loader = loader


func apply_unit_types(unit_types: Array) -> void:
	"""Load unit type name mappings from rules catalog."""
	_unit_type_names.clear()
	for u in unit_types:
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = u
		var uid := _parse_runtime_id(ud.get("id", -1))
		var unit_name: String = ud.get("name", "")
		if uid >= 0 and unit_name != "":
			# Convert "Great General" -> "great_general"
			var model_name := unit_name.to_lower().replace(" ", "_")
			_unit_type_names[uid] = model_name


func _parse_runtime_id(val) -> int:
	"""Parse runtime ID from various formats."""
	if typeof(val) == TYPE_INT:
		return val
	if typeof(val) == TYPE_FLOAT:
		return int(val)
	if typeof(val) == TYPE_STRING:
		if val.is_valid_int():
			return val.to_int()
	if typeof(val) == TYPE_DICTIONARY:
		var d: Dictionary = val
		if d.has("id"):
			return _parse_runtime_id(d["id"])
	return -1


func get_unit_type_name(type_id: int) -> String:
	"""Get model name for a unit type ID."""
	if _unit_type_names.has(type_id):
		return _unit_type_names[type_id]
	# Fallback: try texture loader
	if _texture_loader and _texture_loader.unit_names.has(type_id):
		return _texture_loader.unit_names[type_id].to_lower().replace(" ", "_")
	return "warrior"  # Default fallback


func spawn_unit(unit_id: int, type_id: int, owner_id: int, hex_pos: Vector2i) -> Unit3D:
	"""Spawn a new 3D unit at the given hex position."""
	# Remove existing unit with same ID
	if _units.has(unit_id):
		despawn_unit(unit_id)

	var unit := Unit3D.new()
	unit.unit_id = unit_id
	unit.owner_id = owner_id
	unit.name = "Unit_%d" % unit_id

	add_child(unit)

	# Load the appropriate model
	var type_name := get_unit_type_name(type_id)
	var loaded := unit.load_model(type_name)
	if not loaded:
		push_warning("Failed to load model for unit type: %s" % type_name)

	# Position in world space
	unit.position = hex_to_world(hex_pos)

	# Apply owner color
	var color: Color = _owner_colors.get(owner_id, Color.WHITE)
	unit.set_owner_color(color)

	_units[unit_id] = unit
	return unit


func despawn_unit(unit_id: int) -> void:
	"""Remove a unit from the map."""
	if _units.has(unit_id):
		var unit: Unit3D = _units[unit_id]
		unit.queue_free()
		_units.erase(unit_id)


func get_unit(unit_id: int) -> Unit3D:
	"""Get a unit by ID."""
	return _units.get(unit_id, null)


func has_unit(unit_id: int) -> bool:
	"""Check if unit exists."""
	return _units.has(unit_id)


func move_unit(unit_id: int, from_hex: Vector2i, to_hex: Vector2i, duration: float = 0.5) -> void:
	"""Animate unit movement between hexes."""
	var unit := get_unit(unit_id)
	if not unit:
		return

	var from_pos := hex_to_world(from_hex)
	var to_pos := hex_to_world(to_hex)

	# Face movement direction
	var direction := Vector2(to_pos.x - from_pos.x, to_pos.z - from_pos.z)
	unit.face_direction(direction)

	# Start walking animation
	unit.set_state(Unit3D.State.WALKING)

	# Tween position
	var tween := create_tween()
	tween.tween_property(unit, "position", to_pos, duration)
	tween.tween_callback(func(): unit.set_state(Unit3D.State.IDLE))


func teleport_unit(unit_id: int, hex_pos: Vector2i) -> void:
	"""Instantly move unit to hex (no animation)."""
	var unit := get_unit(unit_id)
	if unit:
		unit.position = hex_to_world(hex_pos)


func update_unit_position(unit_id: int, hex_pos: Vector2i) -> void:
	"""Update unit position (used for sync)."""
	teleport_unit(unit_id, hex_pos)


func set_unit_state(unit_id: int, state: Unit3D.State) -> void:
	"""Set animation state for a unit."""
	var unit := get_unit(unit_id)
	if unit:
		unit.set_state(state)


func hex_to_world(hex: Vector2i) -> Vector3:
	"""Convert hex coordinates to 3D world position.
	Uses axial coordinates matching HexMath.axial_to_pixel."""
	var q := float(hex.x)
	var r := float(hex.y)

	# Axial coordinate system (same as 2D HexMath)
	var world_x := HEX_SIZE * sqrt(3.0) * (q + r * 0.5)
	var world_z := HEX_SIZE * 1.5 * r

	return Vector3(world_x, UNIT_HEIGHT, world_z)


func world_to_hex(world_pos: Vector3) -> Vector2i:
	"""Convert 3D world position to hex coordinates.
	Uses axial coordinates matching HexMath.pixel_to_axial."""
	var x := world_pos.x
	var z := world_pos.z

	# Reverse of axial coordinate conversion
	var qf := (sqrt(3.0) / 3.0 * x - 1.0 / 3.0 * z) / HEX_SIZE
	var rf := (2.0 / 3.0 * z) / HEX_SIZE

	return _axial_round(qf, rf)


func _axial_round(qf: float, rf: float) -> Vector2i:
	"""Round fractional axial coordinates to nearest hex."""
	var sf := -qf - rf

	var q: float = round(qf)
	var r: float = round(rf)
	var s: float = round(sf)

	var q_diff: float = abs(q - qf)
	var r_diff: float = abs(r - rf)
	var s_diff: float = abs(s - sf)

	if q_diff > r_diff and q_diff > s_diff:
		q = -r - s
	elif r_diff > s_diff:
		r = -q - s
	else:
		s = -q - r

	return Vector2i(int(q), int(r))


func sync_units(unit_data: Array) -> void:
	"""Synchronize all units with game state.
	unit_data is array of dictionaries with: id, type_id, owner, position (Vector2i)"""
	var seen_ids: Dictionary = {}

	for u in unit_data:
		if typeof(u) != TYPE_DICTIONARY:
			continue

		var unit_id: int = u.get("id", -1)
		var type_id: int = u.get("type_id", 0)
		var owner_id: int = u.get("owner", 0)
		var pos = u.get("position", Vector2i.ZERO)

		if unit_id < 0:
			continue

		seen_ids[unit_id] = true

		if has_unit(unit_id):
			# Update existing unit position
			update_unit_position(unit_id, pos)
		else:
			# Spawn new unit
			spawn_unit(unit_id, type_id, owner_id, pos)

	# Remove units that no longer exist
	var to_remove: Array = []
	for existing_id in _units.keys():
		if not seen_ids.has(existing_id):
			to_remove.append(existing_id)

	for remove_id in to_remove:
		despawn_unit(remove_id)


func clear_all_units() -> void:
	"""Remove all units."""
	for unit_id in _units.keys():
		despawn_unit(unit_id)
	_units.clear()


func get_all_unit_ids() -> Array:
	"""Get list of all active unit IDs."""
	return _units.keys()


func get_unit_count() -> int:
	"""Get number of active units."""
	return _units.size()
