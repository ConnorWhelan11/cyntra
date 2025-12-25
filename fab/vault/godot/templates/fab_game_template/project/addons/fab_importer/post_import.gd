@tool
extends EditorScenePostImport

## Fab Post-Import Script
##
## Converts marker meshes into gameplay nodes at import time.
## Assign this script as the "Post Import Script" in GLB import settings.
##
## Marker Conventions:
## - COLLIDER_* -> StaticBody3D with trimesh shape
## - TRIGGER_* -> Area3D (optionally with FabTriggerArea script)
## - NAV_* -> NavigationRegion3D (removed from visual scene)
## - NPC_SPAWN_* -> Marker3D with fab_npc_type metadata
## - ITEM_SPAWN_* -> Marker3D with fab_item_id metadata
## - AUDIO_ZONE_* -> Area3D with AudioStreamPlayer3D
## - WAYPOINT_* -> Marker3D for patrol paths
## - INTERACT_* -> Node3D with fab_interact metadata


func _post_import(scene: Node) -> Object:
	print("FabImporter: Processing markers...")

	var stats := {
		"colliders": 0,
		"triggers": 0,
		"navmeshes": 0,
		"npc_spawns": 0,
		"item_spawns": 0,
		"audio_zones": 0,
		"waypoints": 0,
		"interactables": 0,
	}

	# Process core markers
	stats.colliders = _process_colliders(scene)
	stats.triggers = _process_triggers(scene)

	# Process navigation
	stats.navmeshes = _process_navigation(scene)

	# Process spawn markers
	stats.npc_spawns = _process_npc_spawns(scene)
	stats.item_spawns = _process_item_spawns(scene)

	# Process environment
	stats.audio_zones = _process_audio_zones(scene)
	stats.waypoints = _process_waypoints(scene)

	# Process interactables
	stats.interactables = _process_interactables(scene)

	# Process physics layers from naming convention
	_process_physics_layers(scene)

	print("FabImporter: Processed %d colliders, %d triggers, %d navmeshes" % [
		stats.colliders, stats.triggers, stats.navmeshes
	])
	print("FabImporter: Processed %d NPC spawns, %d item spawns, %d audio zones" % [
		stats.npc_spawns, stats.item_spawns, stats.audio_zones
	])

	return scene


func _process_colliders(root: Node) -> int:
	var meshes := _find_marker_meshes(root, ["COLLIDER_", "OL_COLLIDER_"])
	for mesh in meshes:
		_convert_mesh_to_static_collider(mesh)
	return meshes.size()


func _process_triggers(root: Node) -> int:
	var meshes := _find_marker_meshes(root, ["TRIGGER_", "OL_TRIGGER_"])
	for mesh in meshes:
		_convert_mesh_to_trigger(mesh)
	return meshes.size()


func _process_navigation(root: Node) -> int:
	var meshes := _find_marker_meshes(root, ["NAV_", "OL_NAV_"])
	for mesh in meshes:
		_convert_mesh_to_navigation(mesh)
	return meshes.size()


func _process_npc_spawns(root: Node) -> int:
	var nodes := _find_marker_nodes(root, ["NPC_SPAWN_", "OL_NPC_SPAWN_"])
	for node in nodes:
		var npc_type := _extract_suffix(node.name, "NPC_SPAWN_")
		node.set_meta("fab_npc_type", npc_type)
		node.set_meta("fab_role", "npc_spawn")
	return nodes.size()


func _process_item_spawns(root: Node) -> int:
	var nodes := _find_marker_nodes(root, ["ITEM_SPAWN_", "OL_ITEM_SPAWN_"])
	for node in nodes:
		var item_id := _extract_suffix(node.name, "ITEM_SPAWN_")
		node.set_meta("fab_item_id", item_id)
		node.set_meta("fab_role", "item_spawn")
	return nodes.size()


func _process_audio_zones(root: Node) -> int:
	var meshes := _find_marker_meshes(root, ["AUDIO_ZONE_", "OL_AUDIO_ZONE_"])
	for mesh in meshes:
		_convert_mesh_to_audio_zone(mesh)
	return meshes.size()


func _process_waypoints(root: Node) -> int:
	var nodes := _find_marker_nodes(root, ["WAYPOINT_", "OL_WAYPOINT_"])
	for node in nodes:
		var number := _extract_waypoint_number(node.name)
		node.set_meta("fab_waypoint_index", number)
		node.set_meta("fab_role", "waypoint")
	return nodes.size()


func _process_interactables(root: Node) -> int:
	var nodes := _find_marker_nodes(root, ["INTERACT_", "OL_INTERACT_"])
	for node in nodes:
		node.set_meta("fab_interact", true)
		node.set_meta("fab_role", "interact")
	return nodes.size()


func _process_physics_layers(root: Node) -> void:
	# Parse COLLIDER_LAYER2_name -> set collision_layer = 2
	for body in _find_all_collision_nodes(root):
		var layer := _extract_layer_from_name(body.name)
		if layer > 0:
			if body is CollisionObject3D:
				body.collision_layer = 1 << (layer - 1)


# =============================================================================
# Marker Finding Utilities
# =============================================================================

func _find_marker_meshes(root: Node, prefixes: Array[String]) -> Array[MeshInstance3D]:
	var found: Array[MeshInstance3D] = []
	_walk(root, found, func(n: Node) -> bool:
		if not (n is MeshInstance3D):
			return false
		var upper := n.name.to_upper()
		for prefix in prefixes:
			if upper.begins_with(prefix.to_upper()):
				return true
		return false
	)
	return found


func _find_marker_nodes(root: Node, prefixes: Array[String]) -> Array[Node]:
	var found: Array[Node] = []
	_walk(root, found, func(n: Node) -> bool:
		var upper := n.name.to_upper()
		for prefix in prefixes:
			if upper.begins_with(prefix.to_upper()):
				return true
		return false
	)
	return found


func _find_all_collision_nodes(root: Node) -> Array[Node]:
	var found: Array[Node] = []
	_walk(root, found, func(n: Node) -> bool:
		return n is CollisionObject3D
	)
	return found


func _walk(root: Node, out: Array, predicate: Callable) -> void:
	if predicate.call(root):
		out.append(root)
	for child in root.get_children():
		_walk(child, out, predicate)


# =============================================================================
# Conversion Functions
# =============================================================================

func _convert_mesh_to_static_collider(mesh_instance: MeshInstance3D) -> void:
	if mesh_instance.mesh == null:
		return
	var shape := mesh_instance.mesh.create_trimesh_shape()
	if shape == null:
		return

	var body := StaticBody3D.new()
	body.name = "StaticCollider_%s" % mesh_instance.name
	body.transform = mesh_instance.transform

	var collision := CollisionShape3D.new()
	collision.shape = shape
	body.add_child(collision)
	collision.owner = body.owner

	mesh_instance.get_parent().add_child(body)
	body.owner = mesh_instance.owner

	# Hide the original mesh
	mesh_instance.visible = false


func _convert_mesh_to_trigger(mesh_instance: MeshInstance3D) -> void:
	if mesh_instance.mesh == null:
		return
	var shape := mesh_instance.mesh.create_trimesh_shape()
	if shape == null:
		return

	var area := Area3D.new()
	area.name = "Trigger_%s" % mesh_instance.name
	area.transform = mesh_instance.transform
	area.set_meta("fab_trigger_name", _extract_suffix(mesh_instance.name, "TRIGGER_"))
	area.set_meta("fab_role", "trigger")

	var collision := CollisionShape3D.new()
	collision.shape = shape
	area.add_child(collision)
	collision.owner = area.owner

	mesh_instance.get_parent().add_child(area)
	area.owner = mesh_instance.owner

	# Hide the original mesh
	mesh_instance.visible = false


func _convert_mesh_to_navigation(mesh_instance: MeshInstance3D) -> void:
	if mesh_instance.mesh == null:
		return

	var nav_region := NavigationRegion3D.new()
	nav_region.name = "NavRegion_%s" % mesh_instance.name
	nav_region.transform = mesh_instance.transform

	# Create navigation mesh from geometry
	var nav_mesh := NavigationMesh.new()
	nav_mesh.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_MESH_INSTANCES

	# The navmesh will be baked when the scene is loaded
	nav_region.navigation_mesh = nav_mesh

	mesh_instance.get_parent().add_child(nav_region)
	nav_region.owner = mesh_instance.owner

	# Remove the source mesh (navigation meshes shouldn't be visible)
	mesh_instance.queue_free()


func _convert_mesh_to_audio_zone(mesh_instance: MeshInstance3D) -> void:
	if mesh_instance.mesh == null:
		return
	var shape := mesh_instance.mesh.create_trimesh_shape()
	if shape == null:
		return

	var area := Area3D.new()
	area.name = "AudioZone_%s" % mesh_instance.name
	area.transform = mesh_instance.transform

	var collision := CollisionShape3D.new()
	collision.shape = shape
	area.add_child(collision)
	collision.owner = area.owner

	# Add audio player
	var audio := AudioStreamPlayer3D.new()
	audio.name = "AmbientAudio"
	area.add_child(audio)
	audio.owner = area.owner

	# Set metadata
	var zone_name := _extract_suffix(mesh_instance.name, "AUDIO_ZONE_")
	area.set_meta("fab_audio_zone", zone_name)
	area.set_meta("fab_role", "audio_zone")

	mesh_instance.get_parent().add_child(area)
	area.owner = mesh_instance.owner

	# Remove the source mesh
	mesh_instance.queue_free()


# =============================================================================
# Extraction Utilities
# =============================================================================

func _extract_suffix(name: String, prefix: String) -> String:
	var stripped := name.replace("OL_", "").replace(prefix, "")
	var parts := stripped.split("_")
	if parts.size() > 0 and not parts[0].is_empty():
		return parts[0].to_lower()
	return ""


func _extract_waypoint_number(name: String) -> int:
	var stripped := name.replace("OL_", "").replace("WAYPOINT_", "")
	if stripped.is_valid_int():
		return stripped.to_int()
	return 999


func _extract_layer_from_name(name: String) -> int:
	# Parse LAYER2 or _LAYER2_ from name
	var upper := name.to_upper()
	var regex := RegEx.new()
	regex.compile("LAYER(\\d+)")
	var result := regex.search(upper)
	if result:
		return result.get_string(1).to_int()
	return 0
