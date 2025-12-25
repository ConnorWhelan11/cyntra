extends Node
class_name FabBehaviorTreeIntegration

## FabBehaviorTreeIntegration - Bridges Fab gameplay system with behavior tree addons.
##
## Supports:
## - beehave (MIT, tree-based behavior)
## - limboai (MIT, HSM + BT hybrid)
##
## This integration:
## - Creates behavior trees from entity configs
## - Provides blackboard data from gameplay state
## - Handles patrol paths and NPC scheduling

signal npc_behavior_started(npc_id: String, behavior: String)
signal npc_behavior_changed(npc_id: String, old_behavior: String, new_behavior: String)
signal npc_reached_waypoint(npc_id: String, waypoint_index: int)

# Which addon is available
enum BTAddon { NONE, BEEHAVE, LIMBOAI }
var active_addon: BTAddon = BTAddon.NONE

# References
var gameplay_loader: FabGameplayLoader
var trigger_system: FabTriggerSystem

# NPC tracking
var _npc_behaviors: Dictionary = {}  # npc_id -> { tree: Node, behavior: String }
var _patrol_paths: Dictionary = {}  # path_name -> Path3D


func _ready() -> void:
	_detect_addon()
	_find_references()


func _detect_addon() -> void:
	# Check for beehave
	if ClassDB.class_exists("BeehaveTree"):
		active_addon = BTAddon.BEEHAVE
		print("FabBehaviorTreeIntegration: Using beehave addon")
		return

	# Check for limboai
	if ClassDB.class_exists("BTPlayer") or ClassDB.class_exists("LimboHSM"):
		active_addon = BTAddon.LIMBOAI
		print("FabBehaviorTreeIntegration: Using limboai addon")
		return

	push_warning("FabBehaviorTreeIntegration: No behavior tree addon found (beehave or limboai)")


func _find_references() -> void:
	if has_node("/root/FabGameplayLoader"):
		gameplay_loader = get_node("/root/FabGameplayLoader")
	if has_node("/root/FabTriggerSystem"):
		trigger_system = get_node("/root/FabTriggerSystem")


## Configure behavior for an NPC based on gameplay.yaml entity config
func configure_npc(npc_node: Node3D, npc_id: String) -> void:
	if not gameplay_loader or not gameplay_loader.is_loaded():
		return

	var entity := gameplay_loader.get_entity(npc_id)
	if entity.is_empty():
		push_warning("FabBehaviorTreeIntegration: No entity config for NPC '%s'" % npc_id)
		return

	var behavior: String = entity.get("behavior", "idle")
	var patrol_path: String = entity.get("patrol_path", "")

	print("FabBehaviorTreeIntegration: Configuring NPC '%s' with behavior '%s'" % [npc_id, behavior])

	match active_addon:
		BTAddon.BEEHAVE:
			_configure_beehave(npc_node, npc_id, behavior, patrol_path, entity)
		BTAddon.LIMBOAI:
			_configure_limboai(npc_node, npc_id, behavior, patrol_path, entity)
		BTAddon.NONE:
			_configure_fallback(npc_node, npc_id, behavior, patrol_path, entity)

	_npc_behaviors[npc_id] = {
		"node": npc_node,
		"behavior": behavior,
		"patrol_path": patrol_path
	}
	npc_behavior_started.emit(npc_id, behavior)


## Change NPC behavior at runtime
func set_npc_behavior(npc_id: String, new_behavior: String) -> void:
	if not _npc_behaviors.has(npc_id):
		push_warning("FabBehaviorTreeIntegration: Unknown NPC '%s'" % npc_id)
		return

	var data: Dictionary = _npc_behaviors[npc_id]
	var old_behavior: String = data.get("behavior", "")

	if old_behavior == new_behavior:
		return

	data["behavior"] = new_behavior
	npc_behavior_changed.emit(npc_id, old_behavior, new_behavior)

	var npc_node: Node3D = data.get("node")
	if npc_node:
		_update_behavior_tree(npc_node, npc_id, new_behavior)


## Register a patrol path for NPCs to use
func register_patrol_path(path_name: String, path_node: Path3D) -> void:
	_patrol_paths[path_name] = path_node
	print("FabBehaviorTreeIntegration: Registered patrol path '%s'" % path_name)


## Get a registered patrol path
func get_patrol_path(path_name: String) -> Path3D:
	return _patrol_paths.get(path_name)


## Get blackboard data for behavior tree conditions
func get_blackboard_data(npc_id: String) -> Dictionary:
	var data: Dictionary = {
		"npc_id": npc_id,
		"player_nearby": false,
		"player_distance": INF,
		"current_time": Time.get_datetime_dict_from_system(),
	}

	# Add gameplay flags
	if trigger_system:
		data["flags"] = {}
		# Common flags NPCs might check
		var common_flags := ["player_spotted", "alarm_triggered", "night_time"]
		for flag in common_flags:
			data["flags"][flag] = trigger_system.get_flag(flag)

	# Add entity-specific data
	if gameplay_loader and gameplay_loader.is_loaded():
		var entity := gameplay_loader.get_entity(npc_id)
		data["entity_config"] = entity

		# Check schedule if present
		var schedule: Array = entity.get("schedule", [])
		if not schedule.is_empty():
			data["scheduled_behavior"] = _get_scheduled_behavior(schedule)

	# Check player distance
	var player := _find_player()
	var npc_data: Dictionary = _npc_behaviors.get(npc_id, {})
	var npc_node: Node3D = npc_data.get("node")

	if player and npc_node:
		var distance := player.global_position.distance_to(npc_node.global_position)
		data["player_distance"] = distance
		data["player_nearby"] = distance < 5.0  # 5 meter threshold

	return data


# =============================================================================
# BEEHAVE INTEGRATION
# =============================================================================

func _configure_beehave(npc: Node3D, npc_id: String, behavior: String, patrol_path: String, entity: Dictionary) -> void:
	# Check if NPC already has a BeehaveTree
	var existing_tree := npc.find_child("BeehaveTree", false, false)
	if existing_tree:
		_configure_existing_beehave_tree(existing_tree, npc_id, behavior, patrol_path)
		return

	# Create a new behavior tree
	var tree := _create_beehave_tree(npc_id, behavior, patrol_path, entity)
	if tree:
		npc.add_child(tree)


func _configure_existing_beehave_tree(tree: Node, npc_id: String, behavior: String, patrol_path: String) -> void:
	# Set blackboard values
	if tree.has_method("set_value"):
		tree.set_value("npc_id", npc_id)
		tree.set_value("behavior", behavior)
		tree.set_value("patrol_path", patrol_path)
	elif tree.has_node("Blackboard"):
		var bb := tree.get_node("Blackboard")
		if bb.has_method("set_value"):
			bb.set_value("npc_id", npc_id)
			bb.set_value("behavior", behavior)
			bb.set_value("patrol_path", patrol_path)


func _create_beehave_tree(npc_id: String, behavior: String, patrol_path: String, entity: Dictionary) -> Node:
	# Try to load a pre-made tree for this behavior
	var tree_path := "res://scenes/behaviors/%s_tree.tscn" % behavior
	if ResourceLoader.exists(tree_path):
		var tree_scene: PackedScene = load(tree_path)
		var tree := tree_scene.instantiate()
		_configure_existing_beehave_tree(tree, npc_id, behavior, patrol_path)
		return tree

	# Otherwise create a simple procedural tree
	print("FabBehaviorTreeIntegration: Creating procedural beehave tree for '%s' (%s)" % [npc_id, behavior])

	# Note: This requires beehave classes to be available
	# In practice, you'd want pre-made tree scenes
	return null


# =============================================================================
# LIMBOAI INTEGRATION
# =============================================================================

func _configure_limboai(npc: Node3D, npc_id: String, behavior: String, patrol_path: String, entity: Dictionary) -> void:
	# Check for existing BTPlayer or LimboHSM
	var bt_player := npc.find_child("BTPlayer", false, false)
	var hsm := npc.find_child("LimboHSM", false, false)

	if bt_player:
		_configure_limboai_bt(bt_player, npc_id, behavior, patrol_path)
	elif hsm:
		_configure_limboai_hsm(hsm, npc_id, behavior)
	else:
		# Create new behavior based on type
		var has_schedule: bool = entity.has("schedule")
		if has_schedule:
			# Use HSM for schedule-based behavior
			_create_limboai_hsm(npc, npc_id, entity)
		else:
			# Use BT for simple behaviors
			_create_limboai_bt(npc, npc_id, behavior, patrol_path)


func _configure_limboai_bt(bt_player: Node, npc_id: String, behavior: String, patrol_path: String) -> void:
	# Set blackboard values
	if bt_player.has_node("Blackboard"):
		var bb := bt_player.get_node("Blackboard")
		if bb.has_method("set_var"):
			bb.set_var("npc_id", npc_id)
			bb.set_var("behavior", behavior)
			bb.set_var("patrol_path", patrol_path)


func _configure_limboai_hsm(hsm: Node, npc_id: String, behavior: String) -> void:
	# LimboHSM uses states; transition to initial state
	if hsm.has_method("set_active"):
		hsm.set_active(true)
	if hsm.has_method("update"):
		# Set initial state based on behavior
		pass


func _create_limboai_bt(npc: Node3D, npc_id: String, behavior: String, patrol_path: String) -> void:
	# Try to load pre-made BehaviorTree resource
	var bt_path := "res://ai/trees/%s.tres" % behavior
	if ResourceLoader.exists(bt_path):
		# Load and configure BTPlayer
		print("FabBehaviorTreeIntegration: Loading limboai tree '%s'" % bt_path)
		# var bt_resource = load(bt_path)
		# var bt_player = BTPlayer.new()
		# bt_player.behavior_tree = bt_resource
		# npc.add_child(bt_player)
	else:
		print("FabBehaviorTreeIntegration: No limboai tree found for behavior '%s'" % behavior)


func _create_limboai_hsm(npc: Node3D, npc_id: String, entity: Dictionary) -> void:
	# Create state machine for schedule-based behavior
	var schedule: Array = entity.get("schedule", [])
	print("FabBehaviorTreeIntegration: Creating schedule HSM for '%s' with %d entries" % [npc_id, schedule.size()])
	# Implementation depends on LimboHSM API


# =============================================================================
# FALLBACK (NO ADDON)
# =============================================================================

func _configure_fallback(npc: Node3D, npc_id: String, behavior: String, patrol_path: String, entity: Dictionary) -> void:
	# Simple script-based behavior without addon
	var fallback_script := load("res://scripts/FabSimpleNPCBehavior.gd")
	if fallback_script:
		npc.set_script(fallback_script)
		if npc.has_method("configure"):
			npc.configure(npc_id, behavior, patrol_path)
	else:
		# Just add metadata
		npc.set_meta("fab_npc_id", npc_id)
		npc.set_meta("fab_behavior", behavior)
		npc.set_meta("fab_patrol_path", patrol_path)


func _update_behavior_tree(npc: Node3D, npc_id: String, new_behavior: String) -> void:
	match active_addon:
		BTAddon.BEEHAVE:
			var tree := npc.find_child("BeehaveTree", false, false)
			if tree:
				_configure_existing_beehave_tree(tree, npc_id, new_behavior, "")
		BTAddon.LIMBOAI:
			var bt_player := npc.find_child("BTPlayer", false, false)
			if bt_player:
				_configure_limboai_bt(bt_player, npc_id, new_behavior, "")


# =============================================================================
# HELPERS
# =============================================================================

func _find_player() -> Node3D:
	var players := get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		return players[0] as Node3D
	return null


func _get_scheduled_behavior(schedule: Array) -> Dictionary:
	var current_time := Time.get_datetime_dict_from_system()
	var current_hour: int = current_time.get("hour", 12)

	for entry in schedule:
		var time_range: Array = entry.get("time", [0, 24])
		if time_range.size() >= 2:
			var start_hour: int = time_range[0]
			var end_hour: int = time_range[1]

			if current_hour >= start_hour and current_hour < end_hour:
				return entry

	return {}


## Get all registered NPC IDs
func get_registered_npcs() -> Array:
	return _npc_behaviors.keys()


## Check if an NPC is registered
func has_npc(npc_id: String) -> bool:
	return _npc_behaviors.has(npc_id)


## Get current behavior for an NPC
func get_npc_behavior(npc_id: String) -> String:
	var data: Dictionary = _npc_behaviors.get(npc_id, {})
	return data.get("behavior", "")
