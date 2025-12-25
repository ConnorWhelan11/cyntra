class_name FabItemSpawner
extends RefCounted

## FabItemSpawner - Spawns interactable items at ITEM_SPAWN_* markers.
##
## Usage:
##   FabItemSpawner.spawn_at_markers(level_root)
##
## Item IDs are extracted from marker names:
##   ITEM_SPAWN_book_01 -> id "book"
##   ITEM_SPAWN_key_master -> id "key"

# Map of item IDs to their scene paths
# Override this in your project to use custom item scenes
const DEFAULT_ITEM_SCENES := {
	"book": "res://scenes/items/book.tscn",
	"key": "res://scenes/items/key.tscn",
	"scroll": "res://scenes/items/scroll.tscn",
	"potion": "res://scenes/items/potion.tscn",
	"coin": "res://scenes/items/coin.tscn",
	"gem": "res://scenes/items/gem.tscn",
	"weapon": "res://scenes/items/weapon.tscn",
	"default": "res://scenes/items/generic_item.tscn",
}


static func spawn_at_markers(root: Node, item_scenes: Dictionary = {}) -> Array[Node]:
	"""Spawn items at all ITEM_SPAWN_* markers under root."""
	var spawned: Array[Node] = []
	var scenes := DEFAULT_ITEM_SCENES.duplicate()
	scenes.merge(item_scenes, true)  # Override with custom scenes

	var markers := _find_item_spawn_markers(root)

	for marker in markers:
		var item := _spawn_item_at_marker(marker, scenes, root)
		if item:
			spawned.append(item)

	if spawned.size() > 0:
		print("FabItemSpawner: Spawned %d items" % spawned.size())

	return spawned


static func _find_item_spawn_markers(root: Node) -> Array[Node3D]:
	"""Find all ITEM_SPAWN_* markers in the scene tree."""
	var found: Array[Node3D] = []
	_walk_for_markers(root, found)
	return found


static func _walk_for_markers(node: Node, out: Array[Node3D]) -> void:
	var upper := node.name.to_upper()
	if upper.begins_with("ITEM_SPAWN_") or upper.begins_with("OL_ITEM_SPAWN_"):
		if node is Node3D:
			out.append(node as Node3D)

	for child in node.get_children():
		_walk_for_markers(child, out)


static func _spawn_item_at_marker(marker: Node3D, scenes: Dictionary, root: Node) -> Node:
	"""Spawn a single item at the given marker."""
	var item_id := _extract_id(marker.name)
	var item_variant := _extract_variant(marker.name)

	# Find the appropriate scene
	var scene_path: String = scenes.get(item_id, scenes.get("default", ""))
	if scene_path.is_empty():
		push_warning("FabItemSpawner: No scene for item ID '%s'" % item_id)
		return null

	# Check if scene exists
	if not ResourceLoader.exists(scene_path):
		push_warning("FabItemSpawner: Scene not found: %s" % scene_path)
		return null

	var scene: PackedScene = load(scene_path)
	if scene == null:
		push_warning("FabItemSpawner: Failed to load scene: %s" % scene_path)
		return null

	var item := scene.instantiate()
	item.global_transform = marker.global_transform

	# Set metadata on item
	item.set_meta("fab_item_id", item_id)
	item.set_meta("fab_item_variant", item_variant)
	item.set_meta("fab_spawn_marker", marker.name)

	# Add item to group for easy querying
	item.add_to_group("fab_items")
	item.add_to_group("fab_item_%s" % item_id)

	# If the item has Cogito interactable setup methods, call them
	if item.has_method("set_item_id"):
		item.set_item_id(item_id)
	if item.has_method("set_interaction_text"):
		item.set_interaction_text("Pick up %s" % item_id)

	root.add_child(item)

	print("  Spawned item: %s at %s" % [item_id, marker.name])

	return item


static func _extract_id(name: String) -> String:
	"""Extract item ID from marker name."""
	# ITEM_SPAWN_book_01 -> book
	# OL_ITEM_SPAWN_key_master -> key
	var stripped := name.replace("OL_", "").replace("ITEM_SPAWN_", "")
	var parts := stripped.split("_")
	if parts.size() > 0 and not parts[0].is_empty():
		return parts[0].to_lower()
	return "default"


static func _extract_variant(name: String) -> String:
	"""Extract variant suffix from marker name."""
	# ITEM_SPAWN_book_01 -> "01"
	# ITEM_SPAWN_key_master -> "master"
	var stripped := name.replace("OL_", "").replace("ITEM_SPAWN_", "")
	var parts := stripped.split("_")
	if parts.size() > 1:
		return "_".join(parts.slice(1))
	return ""
