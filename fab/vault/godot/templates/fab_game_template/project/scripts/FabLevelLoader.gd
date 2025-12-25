extends Node3D

## FabLevelLoader - Converts Blender-exported GLB markers into Godot gameplay nodes.
##
## Marker Conventions:
## - SPAWN_PLAYER: Player spawn point (exactly 1 required)
## - COLLIDER_*: Invisible collision meshes -> StaticBody3D
## - TRIGGER_*: Trigger volumes -> Area3D with signals
## - INTERACT_*: Interactable markers -> metadata flag
## - NAV_*: Navigation meshes -> NavigationRegion3D
## - NPC_SPAWN_*: NPC spawn points -> spawns NPC of type
## - ITEM_SPAWN_*: Item spawn points -> spawns interactable
## - AUDIO_ZONE_*: Ambient audio areas -> Area3D + AudioPlayer
## - WAYPOINT_*: Patrol path points -> Path3D nodes
##
## Gameplay Integration:
## - Loads gameplay.json from assets folder
## - Configures entities based on gameplay definitions
## - Wires triggers to FabTriggerSystem
## - Sets up interaction handling

@export var level_path: String = "res://assets/level.glb"
@export var use_cogito: bool = false  # Toggle Cogito mode for full gameplay
@export var use_gameplay_config: bool = true  # Load gameplay.json for entity configuration
@export var player_scene: PackedScene = preload("res://scenes/Player.tscn")
@export var cogito_player_scene: PackedScene  # Set to CogitoPlayer.tscn when available
@export var show_collider_meshes: bool = false
@export var show_trigger_meshes: bool = false
@export var show_nav_meshes: bool = false

# Gameplay system references
var gameplay_loader: FabGameplayLoader
var trigger_system: FabTriggerSystem
var objective_tracker: FabObjectiveTracker
var interaction_handler: FabInteractionHandler


func _ready() -> void:
	# Find gameplay system references
	_find_gameplay_systems()

	var resource := load(level_path)
	if resource == null:
		push_error("FabLevelLoader: failed to load level: %s" % level_path)
		return
	if not (resource is PackedScene):
		push_error("FabLevelLoader: level is not a PackedScene: %s" % level_path)
		return

	var level_instance := (resource as PackedScene).instantiate()
	add_child(level_instance)

	_apply_fab_conventions(level_instance)


func _find_gameplay_systems() -> void:
	if has_node("/root/FabGameplayLoader"):
		gameplay_loader = get_node("/root/FabGameplayLoader")
	if has_node("/root/FabTriggerSystem"):
		trigger_system = get_node("/root/FabTriggerSystem")
	if has_node("/root/FabObjectiveTracker"):
		objective_tracker = get_node("/root/FabObjectiveTracker")
	if has_node("/root/FabInteractionHandler"):
		interaction_handler = get_node("/root/FabInteractionHandler")


func _apply_fab_conventions(root: Node) -> void:
	var spawn := _find_first_spawn(root)

	# Choose player based on mode
	if use_cogito and cogito_player_scene:
		_spawn_cogito_player(spawn)
		_setup_cogito_systems(root)
	else:
		_spawn_player(spawn)

	# Core conventions (both modes)
	var collider_meshes := _find_marker_meshes(root, ["COLLIDER_", "OL_COLLIDER_"])
	for mesh in collider_meshes:
		_convert_mesh_to_static_collider(mesh)

	var trigger_meshes := _find_marker_meshes(root, ["TRIGGER_", "OL_TRIGGER_"])
	for mesh in trigger_meshes:
		_convert_mesh_to_trigger(mesh)

	var interact_nodes := _find_marker_nodes(root, ["INTERACT_", "OL_INTERACT_"])
	for node in interact_nodes:
		node.set_meta("fab_interact", true)
		var interact_id := FabGameplayLoader.extract_interaction_id_from_marker(node.name)
		node.set_meta("fab_interact_name", node.name)
		node.set_meta("fab_interact_id", interact_id)

	# Navigation (for NPC pathfinding)
	var nav_meshes := _find_marker_meshes(root, ["NAV_", "OL_NAV_"])
	for mesh in nav_meshes:
		_convert_mesh_to_navigation(mesh)

	# Cogito-only features
	if use_cogito:
		_spawn_npcs(root)
		_spawn_items(root)
		_setup_audio_zones(root)
		_setup_patrol_paths(root)


func _spawn_player(spawn_node: Node3D) -> void:
	var player := player_scene.instantiate()
	add_child(player)

	var t := Transform3D.IDENTITY
	if spawn_node != null:
		t = spawn_node.global_transform
	player.global_transform = t


func _spawn_cogito_player(spawn_node: Node3D) -> void:
	if not cogito_player_scene:
		push_warning("FabLevelLoader: cogito_player_scene not set, falling back to basic player")
		_spawn_player(spawn_node)
		return

	var player := cogito_player_scene.instantiate()
	add_child(player)

	var t := Transform3D.IDENTITY
	if spawn_node != null:
		t = spawn_node.global_transform
	player.global_transform = t

	# Add player to group for trigger detection
	player.add_to_group("player")


func _setup_cogito_systems(_root: Node) -> void:
	# Initialize Cogito singletons if needed
	# This would connect to CogitoSceneManager, etc.
	pass


func _find_first_spawn(root: Node) -> Node3D:
	var candidates := _find_marker_nodes(root, ["SPAWN_PLAYER", "OL_SPAWN_PLAYER"])
	if candidates.is_empty():
		return null
	var node := candidates[0]
	if node is Node3D:
		return node as Node3D
	return null


func _find_marker_nodes(root: Node, tokens: Array[String]) -> Array[Node]:
	var found: Array[Node] = []
	_walk(root, found, func(n: Node) -> bool:
		var upper := n.name.to_upper()
		for token in tokens:
			var t := token.to_upper()
			if upper == t or upper.begins_with(t + "_") or upper.begins_with(t):
				return true
		return false
	)
	return found


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


func _walk(root: Node, out: Array, predicate: Callable) -> void:
	if predicate.call(root):
		out.append(root)
	for child in root.get_children():
		_walk(child, out, predicate)


func _convert_mesh_to_static_collider(mesh_instance: MeshInstance3D) -> void:
	if mesh_instance.mesh == null:
		return

	var shape := mesh_instance.mesh.create_trimesh_shape()
	if shape == null:
		return

	var body := StaticBody3D.new()
	body.name = "StaticCollider_%s" % mesh_instance.name
	body.global_transform = mesh_instance.global_transform

	var collision := CollisionShape3D.new()
	collision.shape = shape
	body.add_child(collision)

	mesh_instance.get_parent().add_child(body)
	mesh_instance.visible = show_collider_meshes


func _convert_mesh_to_trigger(mesh_instance: MeshInstance3D) -> void:
	if mesh_instance.mesh == null:
		return

	var shape := mesh_instance.mesh.create_trimesh_shape()
	if shape == null:
		return

	var area := Area3D.new()
	area.name = "Trigger_%s" % mesh_instance.name
	area.global_transform = mesh_instance.global_transform

	var collision := CollisionShape3D.new()
	collision.shape = shape
	area.add_child(collision)

	# Extract trigger ID from marker name
	var trigger_id := FabGameplayLoader.extract_trigger_id_from_marker(mesh_instance.name)
	area.set_meta("fab_trigger_id", trigger_id)

	var trigger_script := load("res://scripts/FabTriggerArea.gd")
	if trigger_script != null:
		area.set_script(trigger_script)
		area.set("trigger_name", mesh_instance.name)

		# Connect to trigger system if available
		if trigger_system:
			area.body_entered.connect(func(body): trigger_system.on_trigger_enter(trigger_id, body))
			area.body_exited.connect(func(body): trigger_system.on_trigger_exit(trigger_id, body))

	mesh_instance.get_parent().add_child(area)
	mesh_instance.visible = show_trigger_meshes


func _convert_mesh_to_navigation(mesh_instance: MeshInstance3D) -> void:
	if mesh_instance.mesh == null:
		return

	var nav_region := NavigationRegion3D.new()
	nav_region.name = "NavRegion_%s" % mesh_instance.name
	nav_region.global_transform = mesh_instance.global_transform

	# Create navigation mesh from geometry
	var nav_mesh := NavigationMesh.new()
	nav_mesh.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_MESH_INSTANCES

	# Bake the navigation mesh from the source mesh
	# Note: This requires the mesh to be properly set up
	nav_region.navigation_mesh = nav_mesh

	mesh_instance.get_parent().add_child(nav_region)
	mesh_instance.visible = show_nav_meshes

	# Trigger rebake after adding to scene tree
	nav_region.bake_navigation_mesh()


func _spawn_npcs(root: Node) -> void:
	var npc_spawns := _find_marker_nodes(root, ["NPC_SPAWN_", "OL_NPC_SPAWN_"])
	if npc_spawns.is_empty():
		return

	# Use FabNPCSpawner if available
	var spawner_script := load("res://scripts/FabNPCSpawner.gd")
	if spawner_script != null and spawner_script.has_method("spawn_at_markers"):
		spawner_script.spawn_at_markers(root)
	else:
		# Fallback: just mark them for later use
		for spawn in npc_spawns:
			spawn.set_meta("fab_npc_spawn", true)
			var npc_type := _extract_type_from_name(spawn.name, "NPC_SPAWN_")
			spawn.set_meta("fab_npc_type", npc_type)
			print("NPC spawn marker: %s (type: %s)" % [spawn.name, npc_type])


func _spawn_items(root: Node) -> void:
	var item_spawns := _find_marker_nodes(root, ["ITEM_SPAWN_", "OL_ITEM_SPAWN_"])
	if item_spawns.is_empty():
		return

	# Use FabItemSpawner if available
	var spawner_script := load("res://scripts/FabItemSpawner.gd")
	if spawner_script != null and spawner_script.has_method("spawn_at_markers"):
		spawner_script.spawn_at_markers(root)
	else:
		# Fallback: just mark them
		for spawn in item_spawns:
			spawn.set_meta("fab_item_spawn", true)
			var item_id := _extract_type_from_name(spawn.name, "ITEM_SPAWN_")
			spawn.set_meta("fab_item_id", item_id)
			print("Item spawn marker: %s (id: %s)" % [spawn.name, item_id])


func _setup_audio_zones(root: Node) -> void:
	var audio_zones := _find_marker_meshes(root, ["AUDIO_ZONE_", "OL_AUDIO_ZONE_"])
	for zone_mesh in audio_zones:
		_convert_mesh_to_audio_zone(zone_mesh)


func _convert_mesh_to_audio_zone(mesh_instance: MeshInstance3D) -> void:
	if mesh_instance.mesh == null:
		return

	var shape := mesh_instance.mesh.create_trimesh_shape()
	if shape == null:
		return

	var area := Area3D.new()
	area.name = "AudioZone_%s" % mesh_instance.name
	area.global_transform = mesh_instance.global_transform

	var collision := CollisionShape3D.new()
	collision.shape = shape
	area.add_child(collision)

	# Add AudioStreamPlayer3D for ambient sound
	var audio_player := AudioStreamPlayer3D.new()
	audio_player.name = "AmbientAudio"
	area.add_child(audio_player)

	# Set metadata for later configuration
	var zone_name := _extract_type_from_name(mesh_instance.name, "AUDIO_ZONE_")
	area.set_meta("fab_audio_zone", zone_name)

	mesh_instance.get_parent().add_child(area)
	mesh_instance.visible = false


func _setup_patrol_paths(root: Node) -> void:
	var waypoints := _find_marker_nodes(root, ["WAYPOINT_", "OL_WAYPOINT_"])
	if waypoints.is_empty():
		return

	# Sort waypoints by number suffix
	waypoints.sort_custom(func(a: Node, b: Node) -> bool:
		var num_a := _extract_waypoint_number(a.name)
		var num_b := _extract_waypoint_number(b.name)
		return num_a < num_b
	)

	# Create Path3D from waypoints
	var path := Path3D.new()
	path.name = "PatrolPath"

	var curve := Curve3D.new()
	for wp in waypoints:
		if wp is Node3D:
			curve.add_point((wp as Node3D).global_position)

	path.curve = curve
	add_child(path)

	print("Created patrol path with %d waypoints" % waypoints.size())


func _extract_type_from_name(name: String, prefix: String) -> String:
	var stripped := name.replace("OL_", "").replace(prefix, "")
	var parts := stripped.split("_")
	if parts.size() > 0:
		return parts[0].to_lower()
	return "default"


func _extract_waypoint_number(name: String) -> int:
	var stripped := name.replace("OL_", "").replace("WAYPOINT_", "")
	if stripped.is_valid_int():
		return stripped.to_int()
	return 999
