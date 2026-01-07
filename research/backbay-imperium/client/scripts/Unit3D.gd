# gdlint:ignore = class-definitions-order
extends Node3D
class_name Unit3D

## A 3D unit with skeletal animations.
## Supports both embedded animations and shared animation libraries.
## Custom meshes rigged to Mixamo skeleton can use shared humanoid animations.

signal animation_finished(anim_name: String)

enum State { IDLE, WALKING, ATTACKING, DYING }

const MODEL_PATH := "res://assets/units/models/"
const SHARED_ANIM_PATH := "res://assets/units/animations/humanoid_base.glb"
const PICK_LAYER := 1

# Unit categories for animation selection
enum UnitCategory { HUMANOID, NAVAL, MOUNTED, SIEGE }

@export var unit_type: String = ""
@export var unit_id: int = -1
@export var owner_id: int = -1

var current_state: State = State.IDLE
var target_rotation: float = 0.0
var _model: Node3D = null
var _animation_player: AnimationPlayer = null
var _skeleton: Skeleton3D = null
var _unit_category: UnitCategory = UnitCategory.HUMANOID
var _pick_area: Area3D = null

# Static cache for shared animations (loaded once, reused)
static var _shared_animations: Dictionary = {}  # category -> {anim_name -> Animation}
static var _shared_anims_loaded: bool = false


func _ready() -> void:
	if unit_type != "":
		load_model(unit_type)


func _process(delta: float) -> void:
	# Smoothly rotate toward target direction
	if abs(rotation.y - target_rotation) > 0.01:
		rotation.y = lerp_angle(rotation.y, target_rotation, delta * 8.0)


func load_model(type_name: String) -> bool:
	"""Load the GLB model for this unit type."""
	unit_type = type_name

	# Clear existing model
	if _model:
		_model.queue_free()
		_model = null
		_animation_player = null
		_skeleton = null

	# Determine unit category from type name
	_unit_category = _get_unit_category(type_name)

	# Load GLB file
	var path := MODEL_PATH + type_name + ".glb"
	if not ResourceLoader.exists(path):
		push_warning("Unit model not found: " + path)
		_spawn_placeholder_model(type_name)
		return true

	var packed_scene: PackedScene = load(path)
	if not packed_scene:
		push_warning("Failed to load unit model: " + path)
		_spawn_placeholder_model(type_name)
		return true

	_model = packed_scene.instantiate()
	add_child(_model)

	# Find AnimationPlayer and Skeleton
	_find_animation_components(_model)

	# Set scale based on unit category
	_model.scale = _get_model_scale()

	# If model lacks animations, try loading from shared library
	if _animation_player:
		var anim_list := _animation_player.get_animation_list()
		# Check if we only have a default/empty animation
		if anim_list.is_empty() or (anim_list.size() == 1 and anim_list[0] == "RESET"):
			_load_shared_animations()

	# Start idle animation
	play_animation("idle")

	_ensure_pick_proxy()
	return true

func _spawn_placeholder_model(type_name: String) -> void:
	# Simple mesh fallback when a GLB is missing.
	var mesh_instance := MeshInstance3D.new()
	var mesh := CapsuleMesh.new()
	mesh.radius = 0.25
	mesh.height = 0.7
	mesh_instance.mesh = mesh

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1, 1, 1, 1)
	mesh_instance.set_surface_override_material(0, mat)
	mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF

	_model = mesh_instance
	add_child(_model)
	_model.scale = _get_model_scale()
	_ensure_pick_proxy()


func _ensure_pick_proxy() -> void:
	if _pick_area == null:
		_pick_area = Area3D.new()
		_pick_area.name = "PickProxy"
		_pick_area.collision_layer = PICK_LAYER
		_pick_area.collision_mask = 0
		_pick_area.set_meta("unit_id", unit_id)
		add_child(_pick_area)

		var shape := CapsuleShape3D.new()
		var collider := CollisionShape3D.new()
		collider.shape = shape
		_pick_area.add_child(collider)

	_update_pick_proxy_shape()


func _update_pick_proxy_shape() -> void:
	if _pick_area == null:
		return
	var collider := _pick_area.get_child(0) if _pick_area.get_child_count() > 0 else null
	if collider == null or not (collider is CollisionShape3D):
		return
	var shape := (collider as CollisionShape3D).shape
	if shape == null or not (shape is CapsuleShape3D):
		return
	var scale_factor := 1.0
	if _model:
		scale_factor = max(_model.scale.x, max(_model.scale.y, _model.scale.z))
	var capsule := shape as CapsuleShape3D
	capsule.radius = 0.35 * scale_factor
	capsule.height = 0.9 * scale_factor
	(collider as CollisionShape3D).position = Vector3(0, capsule.height * 0.5, 0)


func _get_unit_category(type_name: String) -> UnitCategory:
	"""Determine unit category from type name."""
	var naval_units := ["galley", "trireme", "caravel", "frigate", "ironclad", "battleship", "destroyer", "carrier"]
	var mounted_units := ["horseman", "knight", "cavalry", "chariot", "tank"]
	var siege_units := ["catapult", "trebuchet", "cannon", "artillery"]

	if type_name in naval_units:
		return UnitCategory.NAVAL
	elif type_name in mounted_units:
		return UnitCategory.MOUNTED
	elif type_name in siege_units:
		return UnitCategory.SIEGE
	else:
		return UnitCategory.HUMANOID


func _get_model_scale() -> Vector3:
	"""Get appropriate scale based on unit category."""
	match _unit_category:
		UnitCategory.NAVAL:
			# Naval units are typically larger meshes
			return Vector3(0.5, 0.5, 0.5)
		UnitCategory.MOUNTED:
			# Mounted units slightly larger than infantry
			return Vector3(1.2, 1.2, 1.2)
		UnitCategory.SIEGE:
			return Vector3(0.8, 0.8, 0.8)
		_:
			# Humanoid units - Mixamo models are ~2 units tall
			return Vector3(1.0, 1.0, 1.0)


func _load_shared_animations() -> void:
	"""Load animations from shared animation library for humanoid units."""
	if _unit_category != UnitCategory.HUMANOID:
		return  # Only humanoids use shared animations

	if not _animation_player:
		return

	# Load shared animations if not cached
	if not _shared_anims_loaded:
		_load_shared_animation_cache()

	# Get animations for this category
	var category_anims: Dictionary = _shared_animations.get(UnitCategory.HUMANOID, {})
	if category_anims.is_empty():
		return

	# Add shared animations to this unit's AnimationPlayer
	for anim_name in category_anims:
		if not _animation_player.has_animation(anim_name):
			var anim: Animation = category_anims[anim_name]
			# Create AnimationLibrary if needed
			if not _animation_player.has_animation_library("shared"):
				_animation_player.add_animation_library("shared", AnimationLibrary.new())
			var lib := _animation_player.get_animation_library("shared")
			lib.add_animation(anim_name, anim.duplicate())


static func _load_shared_animation_cache() -> void:
	"""Load and cache shared animations from the base humanoid model."""
	if _shared_anims_loaded:
		return

	_shared_anims_loaded = true
	_shared_animations[UnitCategory.HUMANOID] = {}

	if not ResourceLoader.exists(SHARED_ANIM_PATH):
		push_warning("Shared animation file not found: " + SHARED_ANIM_PATH)
		return

	var packed_scene: PackedScene = load(SHARED_ANIM_PATH)
	if not packed_scene:
		push_warning("Failed to load shared animation file: " + SHARED_ANIM_PATH)
		return

	var temp_instance := packed_scene.instantiate()
	var anim_player := _find_animation_player_static(temp_instance)

	if anim_player:
		for anim_name in anim_player.get_animation_list():
			if anim_name == "RESET":
				continue  # Skip reset animation
			var anim := anim_player.get_animation(anim_name)
			if anim:
				# Normalize animation name
				var normalized_name := _normalize_anim_name(anim_name)
				_shared_animations[UnitCategory.HUMANOID][normalized_name] = anim.duplicate()

		print("[Unit3D] Loaded %d shared humanoid animations" % _shared_animations[UnitCategory.HUMANOID].size())

	temp_instance.queue_free()


static func _find_animation_player_static(node: Node) -> AnimationPlayer:
	"""Static helper to find AnimationPlayer in a node tree."""
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found := _find_animation_player_static(child)
		if found:
			return found
	return null


static func _normalize_anim_name(anim_name: String) -> String:
	"""Normalize Mixamo animation names to standard names."""
	var lower := anim_name.to_lower()

	# Map common Mixamo naming conventions
	if "idle" in lower or "breathing" in lower:
		return "idle"
	elif "walk" in lower:
		return "walk"
	elif "run" in lower:
		return "run"
	elif "attack" in lower or "punch" in lower or "slash" in lower:
		return "attack"
	elif "death" in lower or "dying" in lower:
		return "death"
	elif "hit" in lower or "react" in lower:
		return "hit"

	# Keep original name if no match
	return anim_name


func _find_animation_components(node: Node) -> void:
	"""Recursively find AnimationPlayer and Skeleton3D."""
	if node is AnimationPlayer:
		_animation_player = node
		_animation_player.animation_finished.connect(_on_animation_finished)
	elif node is Skeleton3D:
		_skeleton = node

	for child in node.get_children():
		_find_animation_components(child)


func play_animation(anim_name: String, loop: bool = true) -> void:
	"""Play a named animation."""
	if not _animation_player:
		return

	# Try direct name first
	var resolved_name := _resolve_animation_name(anim_name)

	if _animation_player.has_animation(resolved_name):
		var anim := _animation_player.get_animation(resolved_name)
		if anim:
			anim.loop_mode = Animation.LOOP_LINEAR if loop else Animation.LOOP_NONE
		_animation_player.play(resolved_name)
	elif _animation_player.has_animation("shared/" + anim_name):
		# Try shared library
		var full_name := "shared/" + anim_name
		var anim := _animation_player.get_animation(full_name)
		if anim:
			anim.loop_mode = Animation.LOOP_LINEAR if loop else Animation.LOOP_NONE
		_animation_player.play(full_name)


func _resolve_animation_name(anim_name: String) -> String:
	"""Resolve animation name with fallbacks."""
	if _animation_player.has_animation(anim_name):
		return anim_name

	# Try common fallback names
	var fallbacks := {
		"idle": ["Idle", "idle", "breathing_idle", "Armature|mixamo.com|Layer0"],
		"walk": ["Walking", "walk", "Walk", "walking"],
		"run": ["Running", "run", "Run", "running"],
		"attack": ["Attack", "attack", "Slash", "slash", "Punch", "punch"],
		"death": ["Death", "death", "Dying", "dying"],
		"hit": ["Hit_Reaction", "hit", "Hit", "react"],
	}

	if anim_name in fallbacks:
		for fallback in fallbacks[anim_name]:
			if _animation_player.has_animation(fallback):
				return fallback

	return anim_name


func set_state(new_state: State) -> void:
	"""Change unit state and play appropriate animation."""
	if current_state == new_state:
		return

	current_state = new_state

	match current_state:
		State.IDLE:
			play_animation("idle", true)
		State.WALKING:
			play_animation("walk", true)
		State.ATTACKING:
			play_animation("attack", false)
		State.DYING:
			play_animation("death", false)


func face_direction(direction: Vector2) -> void:
	"""Rotate to face a direction (in 2D hex coordinates)."""
	if direction.length_squared() < 0.001:
		return
	target_rotation = atan2(direction.x, direction.y)


func face_position(target_pos: Vector3) -> void:
	"""Rotate to face a 3D position."""
	var dir := target_pos - global_position
	if dir.length_squared() > 0.001:
		target_rotation = atan2(dir.x, dir.z)


func set_owner_color(color: Color) -> void:
	"""Apply owner color tint to the model."""
	if not _model:
		return

	# Find all mesh instances and apply color
	_apply_color_recursive(_model, color)


func _apply_color_recursive(node: Node, color: Color) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		# Create material override with color tint
		for i in range(mesh_instance.get_surface_override_material_count()):
			var mat := mesh_instance.get_surface_override_material(i)
			if mat is StandardMaterial3D:
				mat = mat.duplicate()
				mat.albedo_color = mat.albedo_color * color
				mesh_instance.set_surface_override_material(i, mat)

	for child in node.get_children():
		_apply_color_recursive(child, color)


func _on_animation_finished(anim_name: String) -> void:
	animation_finished.emit(anim_name)

	# Return to idle after one-shot animations
	if current_state == State.ATTACKING:
		set_state(State.IDLE)


func get_animation_list() -> PackedStringArray:
	"""Get list of available animations for this unit."""
	if not _animation_player:
		return PackedStringArray()
	return _animation_player.get_animation_list()


func has_skeleton() -> bool:
	"""Check if this unit has a skeleton for animation."""
	return _skeleton != null
