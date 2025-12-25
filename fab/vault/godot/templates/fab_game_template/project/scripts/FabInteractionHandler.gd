extends Node
class_name FabInteractionHandler

## FabInteractionHandler - Handles player interactions with objects.
##
## Provides raycast-based interaction detection and executes
## interaction definitions from gameplay.yaml.

signal interaction_available(interaction_id: String, node: Node)
signal interaction_unavailable()
signal interaction_started(interaction_id: String)
signal interaction_completed(interaction_id: String)
signal interaction_locked(interaction_id: String, message: String)

# References
var gameplay_loader: FabGameplayLoader
var trigger_system: FabTriggerSystem
var objective_tracker: FabObjectiveTracker

# Configuration
@export var interact_distance: float = 2.5
@export var interact_layer: int = 1  # Physics layer for interactables

# State
var _current_target: Node = null
var _current_interaction_id: String = ""
var _used_interactions: Dictionary = {}  # interaction_id -> true (for one-shot)
var _player: Node3D = null
var _camera: Camera3D = null


func _ready() -> void:
	# Find references
	if has_node("/root/FabGameplayLoader"):
		gameplay_loader = get_node("/root/FabGameplayLoader")

	if has_node("/root/FabTriggerSystem"):
		trigger_system = get_node("/root/FabTriggerSystem")

	if has_node("/root/FabObjectiveTracker"):
		objective_tracker = get_node("/root/FabObjectiveTracker")


func _process(_delta: float) -> void:
	if _player == null or _camera == null:
		_find_player()
		return

	_check_interaction_target()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("interact") and _current_target != null:
		interact_with_current()


## Set the player and camera references
func set_player(player: Node3D, camera: Camera3D) -> void:
	_player = player
	_camera = camera


## Attempt to interact with current target
func interact_with_current() -> void:
	if _current_target == null or _current_interaction_id.is_empty():
		return

	interact_with(_current_interaction_id, _current_target)


## Interact with a specific interaction ID
func interact_with(interaction_id: String, target_node: Node = null) -> void:
	if not gameplay_loader or not gameplay_loader.is_loaded():
		push_warning("FabInteractionHandler: Cannot interact - gameplay not loaded")
		return

	var config := gameplay_loader.get_interaction(interaction_id)
	if config.is_empty():
		# No config, just trigger the interaction
		interaction_started.emit(interaction_id)
		interaction_completed.emit(interaction_id)
		return

	# Check one-shot
	if config.get("one_shot", false) and _used_interactions.has(interaction_id):
		return

	# Check requirements
	var requires = config.get("requires")
	if not _check_requirements(requires):
		var locked_message: String = config.get("locked_message", "This is locked.")
		interaction_locked.emit(interaction_id, locked_message)
		print("FabInteractionHandler: Interaction '%s' locked: %s" % [interaction_id, locked_message])
		return

	# Start interaction
	interaction_started.emit(interaction_id)
	print("FabInteractionHandler: Interacting with '%s'" % interaction_id)

	# Execute result actions
	var results: Array = config.get("result", [])
	for action in results:
		if trigger_system:
			trigger_system.execute_action(action)

	# Mark as used for one-shot
	if config.get("one_shot", false):
		_used_interactions[interaction_id] = true

	# Complete interaction
	interaction_completed.emit(interaction_id)


## Handle item pickup
func pickup_item(item_id: String, item_node: Node) -> void:
	if not gameplay_loader or not gameplay_loader.is_loaded():
		# Default pickup behavior
		if item_node:
			item_node.queue_free()
		return

	var entity := gameplay_loader.get_entity(item_id)
	if entity.is_empty():
		# No config, just pick up
		if item_node:
			item_node.queue_free()
		return

	print("FabInteractionHandler: Picking up item '%s'" % item_id)

	# Execute on_pickup actions
	var on_pickup: Array = entity.get("on_pickup", [])
	for action in on_pickup:
		if trigger_system:
			trigger_system.execute_action(action)

	# Record acquisition for objectives
	if objective_tracker:
		objective_tracker.record_item_acquired(item_id)

	# Remove item from world
	if item_node:
		item_node.queue_free()


## Talk to NPC
func talk_to_npc(npc_id: String, npc_node: Node) -> void:
	if not gameplay_loader or not gameplay_loader.is_loaded():
		return

	var entity := gameplay_loader.get_entity(npc_id)
	if entity.is_empty():
		return

	var dialogue: String = entity.get("dialogue", "")
	if dialogue.is_empty():
		return

	print("FabInteractionHandler: Talking to NPC '%s', dialogue '%s'" % [npc_id, dialogue])

	# Start dialogue via trigger system
	if trigger_system:
		trigger_system.execute_action({"start_dialogue": dialogue})


## Check if an interaction is available (requirements met)
func is_available(interaction_id: String) -> bool:
	if not gameplay_loader or not gameplay_loader.is_loaded():
		return true

	var config := gameplay_loader.get_interaction(interaction_id)
	if config.is_empty():
		return true

	# Check one-shot
	if config.get("one_shot", false) and _used_interactions.has(interaction_id):
		return false

	# Check requirements
	return _check_requirements(config.get("requires"))


## Get interaction action verb
func get_action_verb(interaction_id: String) -> String:
	if not gameplay_loader or not gameplay_loader.is_loaded():
		return "Interact"

	var config := gameplay_loader.get_interaction(interaction_id)
	var action: String = config.get("action", "use")

	# Capitalize first letter
	return action.capitalize()


## Reset all interaction state
func reset() -> void:
	_used_interactions.clear()
	_current_target = null
	_current_interaction_id = ""


func _find_player() -> void:
	# Find player in scene
	var players := get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		_player = players[0] as Node3D

		# Find camera
		if _player:
			var camera := _player.find_child("Camera3D", true, false)
			if camera:
				_camera = camera as Camera3D
			else:
				# Try to find by name
				camera = _player.find_child("Head", true, false)
				if camera:
					var cam := camera.find_child("Camera3D", true, false)
					if cam:
						_camera = cam as Camera3D


func _check_interaction_target() -> void:
	if _camera == null:
		return

	# Get player settings for interact distance
	if gameplay_loader and gameplay_loader.is_loaded():
		var settings := gameplay_loader.get_player_settings()
		interact_distance = settings.get("interact_distance", interact_distance)

	# Raycast from camera
	var space_state := _camera.get_world_3d().direct_space_state
	var from := _camera.global_position
	var to := from + (-_camera.global_basis.z * interact_distance)

	var query := PhysicsRayQueryParameters3D.create(from, to)
	query.collision_mask = interact_layer
	query.collide_with_areas = true

	var result := space_state.intersect_ray(query)

	if result.is_empty():
		_clear_target()
		return

	var collider: Node = result.get("collider")
	if collider == null:
		_clear_target()
		return

	# Check if this is an interactable
	var interaction_id := _get_interaction_id(collider)
	if interaction_id.is_empty():
		_clear_target()
		return

	# Update current target
	if _current_target != collider or _current_interaction_id != interaction_id:
		_current_target = collider
		_current_interaction_id = interaction_id
		interaction_available.emit(interaction_id, collider)


func _clear_target() -> void:
	if _current_target != null:
		_current_target = null
		_current_interaction_id = ""
		interaction_unavailable.emit()


func _get_interaction_id(node: Node) -> String:
	# Check for fab_interact metadata
	if node.has_meta("fab_interact"):
		var marker_name: String = node.get_meta("fab_interact_name", node.name)
		return FabGameplayLoader.extract_interaction_id_from_marker(marker_name)

	# Check for fab_item metadata
	if node.has_meta("fab_item_spawn"):
		return node.get_meta("fab_item_id", "")

	# Check for fab_npc metadata
	if node.has_meta("fab_npc_spawn"):
		return node.get_meta("fab_npc_type", "")

	# Check node name for INTERACT_ prefix
	var name := node.name.to_upper()
	if name.begins_with("INTERACT_") or name.begins_with("OL_INTERACT_"):
		return FabGameplayLoader.extract_interaction_id_from_marker(node.name)

	return ""


func _check_requirements(requires) -> bool:
	if requires == null:
		return true

	if not (requires is Dictionary):
		return true

	# Check item requirement
	if requires.has("item"):
		var item_id: String = requires["item"]
		if trigger_system and not trigger_system.get_flag("has_item_" + item_id):
			return false

	# Check objective requirement
	if requires.has("objective_complete"):
		var obj_id: String = requires["objective_complete"]
		if objective_tracker and not objective_tracker.is_complete(obj_id):
			return false

	# Check flag requirement
	if requires.has("flag"):
		var flag_name: String = requires["flag"]
		if trigger_system and not trigger_system.get_flag(flag_name):
			return false

	return true
