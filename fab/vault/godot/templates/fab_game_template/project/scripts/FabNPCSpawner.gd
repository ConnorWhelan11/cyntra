class_name FabNPCSpawner
extends RefCounted

## FabNPCSpawner - Spawns NPCs at NPC_SPAWN_* markers.
##
## Usage:
##   FabNPCSpawner.spawn_at_markers(level_root)
##
## NPC types are extracted from marker names:
##   NPC_SPAWN_librarian -> type "librarian"
##   NPC_SPAWN_scholar_01 -> type "scholar"

# Map of NPC types to their scene paths
# Override this in your project to use custom NPC scenes
const DEFAULT_NPC_SCENES := {
	"librarian": "res://scenes/npcs/librarian.tscn",
	"scholar": "res://scenes/npcs/scholar.tscn",
	"student": "res://scenes/npcs/student.tscn",
	"guard": "res://scenes/npcs/guard.tscn",
	"merchant": "res://scenes/npcs/merchant.tscn",
	"default": "res://scenes/npcs/generic_npc.tscn",
}


static func spawn_at_markers(root: Node, npc_scenes: Dictionary = {}) -> Array[Node]:
	"""Spawn NPCs at all NPC_SPAWN_* markers under root."""
	var spawned: Array[Node] = []
	var scenes := DEFAULT_NPC_SCENES.duplicate()
	scenes.merge(npc_scenes, true)  # Override with custom scenes

	var markers := _find_npc_spawn_markers(root)

	for marker in markers:
		var npc := _spawn_npc_at_marker(marker, scenes, root)
		if npc:
			spawned.append(npc)

	if spawned.size() > 0:
		print("FabNPCSpawner: Spawned %d NPCs" % spawned.size())

	return spawned


static func _find_npc_spawn_markers(root: Node) -> Array[Node3D]:
	"""Find all NPC_SPAWN_* markers in the scene tree."""
	var found: Array[Node3D] = []
	_walk_for_markers(root, found)
	return found


static func _walk_for_markers(node: Node, out: Array[Node3D]) -> void:
	var upper := node.name.to_upper()
	if upper.begins_with("NPC_SPAWN_") or upper.begins_with("OL_NPC_SPAWN_"):
		if node is Node3D:
			out.append(node as Node3D)

	for child in node.get_children():
		_walk_for_markers(child, out)


static func _spawn_npc_at_marker(marker: Node3D, scenes: Dictionary, root: Node) -> Node:
	"""Spawn a single NPC at the given marker."""
	var npc_type := _extract_type(marker.name)

	# Find the appropriate scene
	var scene_path: String = scenes.get(npc_type, scenes.get("default", ""))
	if scene_path.is_empty():
		push_warning("FabNPCSpawner: No scene for NPC type '%s'" % npc_type)
		return null

	# Check if scene exists
	if not ResourceLoader.exists(scene_path):
		push_warning("FabNPCSpawner: Scene not found: %s" % scene_path)
		return null

	var scene: PackedScene = load(scene_path)
	if scene == null:
		push_warning("FabNPCSpawner: Failed to load scene: %s" % scene_path)
		return null

	var npc := scene.instantiate()
	npc.global_transform = marker.global_transform

	# Set metadata on NPC
	npc.set_meta("fab_npc_type", npc_type)
	npc.set_meta("fab_spawn_marker", marker.name)

	# Find nearby waypoints for patrol path
	var waypoints := _find_nearby_waypoints(root, marker.global_position, 30.0)
	if not waypoints.is_empty():
		if npc.has_method("set_patrol_path"):
			npc.set_patrol_path(waypoints)
		else:
			npc.set_meta("fab_patrol_waypoints", waypoints)

	# Add NPC to group for easy querying
	npc.add_to_group("fab_npcs")
	npc.add_to_group("fab_npc_%s" % npc_type)

	root.add_child(npc)

	print("  Spawned NPC: %s at %s" % [npc_type, marker.name])

	return npc


static func _extract_type(name: String) -> String:
	"""Extract NPC type from marker name."""
	# NPC_SPAWN_librarian -> librarian
	# OL_NPC_SPAWN_scholar_01 -> scholar
	var stripped := name.replace("OL_", "").replace("NPC_SPAWN_", "")
	var parts := stripped.split("_")
	if parts.size() > 0 and not parts[0].is_empty():
		return parts[0].to_lower()
	return "default"


static func _find_nearby_waypoints(root: Node, center: Vector3, radius: float) -> Array[Vector3]:
	"""Find WAYPOINT_* markers within radius of center."""
	var waypoints: Array[Vector3] = []
	var markers: Array[Node3D] = []

	_walk_for_waypoints(root, markers)

	for marker in markers:
		var dist := marker.global_position.distance_to(center)
		if dist <= radius:
			waypoints.append(marker.global_position)

	# Sort by waypoint number
	markers.sort_custom(func(a: Node3D, b: Node3D) -> bool:
		return _extract_waypoint_number(a.name) < _extract_waypoint_number(b.name)
	)

	# Rebuild waypoints array in sorted order
	waypoints.clear()
	for marker in markers:
		var dist := marker.global_position.distance_to(center)
		if dist <= radius:
			waypoints.append(marker.global_position)

	return waypoints


static func _walk_for_waypoints(node: Node, out: Array[Node3D]) -> void:
	var upper := node.name.to_upper()
	if upper.begins_with("WAYPOINT_") or upper.begins_with("OL_WAYPOINT_"):
		if node is Node3D:
			out.append(node as Node3D)

	for child in node.get_children():
		_walk_for_waypoints(child, out)


static func _extract_waypoint_number(name: String) -> int:
	"""Extract numeric suffix from waypoint name."""
	var stripped := name.replace("OL_", "").replace("WAYPOINT_", "")
	if stripped.is_valid_int():
		return stripped.to_int()
	return 999
