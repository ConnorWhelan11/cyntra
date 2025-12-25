extends Node
class_name FabInventoryIntegration

## FabInventoryIntegration - Bridges Fab gameplay system with gloot inventory addon.
##
## This integration:
## - Creates item definitions from gameplay.yaml entities
## - Manages player inventory via gloot
## - Handles item pickup, consumption, and requirements
## - Syncs inventory state with trigger system flags

signal item_added(item_id: String, quantity: int)
signal item_removed(item_id: String, quantity: int)
signal item_used(item_id: String)
signal inventory_full()

# References
var gameplay_loader: FabGameplayLoader
var trigger_system: FabTriggerSystem
var objective_tracker: FabObjectiveTracker

# Gloot components (if available)
var _inventory: Node  # Inventory node
var _item_protoset: Resource  # ItemProtoset resource
var _has_gloot: bool = false

# Fallback inventory (when gloot not available)
var _fallback_inventory: Dictionary = {}  # item_id -> quantity
var _fallback_max_slots: int = 12


func _ready() -> void:
	_find_references()
	_detect_gloot()
	_setup_inventory()


func _find_references() -> void:
	if has_node("/root/FabGameplayLoader"):
		gameplay_loader = get_node("/root/FabGameplayLoader")
		gameplay_loader.gameplay_loaded.connect(_on_gameplay_loaded)

	if has_node("/root/FabTriggerSystem"):
		trigger_system = get_node("/root/FabTriggerSystem")

	if has_node("/root/FabObjectiveTracker"):
		objective_tracker = get_node("/root/FabObjectiveTracker")


func _detect_gloot() -> void:
	# Check if gloot addon is available
	if ClassDB.class_exists("Inventory") and ClassDB.class_exists("ItemProtoset"):
		_has_gloot = true
		print("FabInventoryIntegration: Using gloot addon")
	else:
		_has_gloot = false
		print("FabInventoryIntegration: gloot not found, using fallback inventory")


func _setup_inventory() -> void:
	if _has_gloot:
		_setup_gloot_inventory()
	else:
		_setup_fallback_inventory()


func _on_gameplay_loaded(config: Dictionary) -> void:
	# Get inventory settings from rules
	var rules: Dictionary = config.get("rules", {})
	var inv_rules: Dictionary = rules.get("inventory", {})

	_fallback_max_slots = inv_rules.get("max_slots", 12)

	# Register item definitions
	var entities: Dictionary = config.get("entities", {})
	for entity_id in entities:
		var entity: Dictionary = entities[entity_id]
		var entity_type: String = entity.get("type", "")

		# Only register item types
		if entity_type in ["key_item", "consumable", "equipment", "document"]:
			_register_item_definition(entity_id, entity)


# =============================================================================
# PUBLIC API
# =============================================================================

## Add an item to inventory
func add_item(item_id: String, quantity: int = 1) -> bool:
	if _has_gloot:
		return _gloot_add_item(item_id, quantity)
	else:
		return _fallback_add_item(item_id, quantity)


## Remove an item from inventory
func remove_item(item_id: String, quantity: int = 1) -> bool:
	if _has_gloot:
		return _gloot_remove_item(item_id, quantity)
	else:
		return _fallback_remove_item(item_id, quantity)


## Check if player has item
func has_item(item_id: String, quantity: int = 1) -> bool:
	if _has_gloot:
		return _gloot_has_item(item_id, quantity)
	else:
		return _fallback_has_item(item_id, quantity)


## Get quantity of an item
func get_item_count(item_id: String) -> int:
	if _has_gloot:
		return _gloot_get_item_count(item_id)
	else:
		return _fallback_inventory.get(item_id, 0)


## Use a consumable item
func use_item(item_id: String) -> bool:
	if not has_item(item_id):
		return false

	var entity := _get_entity(item_id)
	var item_type: String = entity.get("type", "")

	if item_type != "consumable":
		push_warning("FabInventoryIntegration: Cannot use non-consumable item '%s'" % item_id)
		return false

	# Apply effect
	var effect: Dictionary = entity.get("effect", {})
	_apply_item_effect(effect)

	# Remove item
	remove_item(item_id, 1)

	item_used.emit(item_id)
	return true


## Get all items in inventory
func get_all_items() -> Dictionary:
	if _has_gloot:
		return _gloot_get_all_items()
	else:
		return _fallback_inventory.duplicate()


## Get display info for an item
func get_item_display(item_id: String) -> Dictionary:
	var entity := _get_entity(item_id)
	return {
		"id": item_id,
		"name": entity.get("display_name", item_id.capitalize()),
		"type": entity.get("type", "item"),
		"description": entity.get("description", ""),
		"quantity": get_item_count(item_id)
	}


## Check if inventory is full
func is_full() -> bool:
	if _has_gloot:
		return _gloot_is_full()
	else:
		return _fallback_inventory.size() >= _fallback_max_slots


## Clear all items
func clear() -> void:
	if _has_gloot:
		_gloot_clear()
	else:
		_fallback_inventory.clear()
		_sync_all_flags_to_trigger_system()


# =============================================================================
# GLOOT IMPLEMENTATION
# =============================================================================

func _setup_gloot_inventory() -> void:
	# Find or create inventory in scene
	var player := _find_player()
	if player:
		_inventory = player.find_child("Inventory", true, false)

	if _inventory == null:
		# Create inventory node
		# Note: Actual gloot setup depends on gloot version
		print("FabInventoryIntegration: No Inventory node found on player")


func _register_item_definition(item_id: String, entity: Dictionary) -> void:
	if not _has_gloot or not _item_protoset:
		return

	# In gloot, items are defined in ItemProtoset resources
	# This would need to be done at design time, not runtime
	# Here we just validate the item exists
	pass


func _gloot_add_item(item_id: String, quantity: int) -> bool:
	if not _inventory:
		return _fallback_add_item(item_id, quantity)

	# Gloot API depends on version, this is a common pattern
	if _inventory.has_method("add_item"):
		var result = _inventory.add_item(item_id, quantity)
		if result:
			_on_item_added(item_id, quantity)
			return true
		else:
			inventory_full.emit()
			return false

	return false


func _gloot_remove_item(item_id: String, quantity: int) -> bool:
	if not _inventory:
		return _fallback_remove_item(item_id, quantity)

	if _inventory.has_method("remove_item"):
		var result = _inventory.remove_item(item_id, quantity)
		if result:
			_on_item_removed(item_id, quantity)
			return true

	return false


func _gloot_has_item(item_id: String, quantity: int) -> bool:
	if not _inventory:
		return _fallback_has_item(item_id, quantity)

	if _inventory.has_method("has_item"):
		return _inventory.has_item(item_id, quantity)

	return false


func _gloot_get_item_count(item_id: String) -> int:
	if not _inventory:
		return _fallback_inventory.get(item_id, 0)

	if _inventory.has_method("get_item_count"):
		return _inventory.get_item_count(item_id)

	return 0


func _gloot_get_all_items() -> Dictionary:
	if not _inventory:
		return _fallback_inventory.duplicate()

	var items: Dictionary = {}
	if _inventory.has_method("get_items"):
		var item_list = _inventory.get_items()
		for item in item_list:
			var id: String = item.get("id", "")
			var qty: int = item.get("quantity", 1)
			items[id] = qty

	return items


func _gloot_is_full() -> bool:
	if not _inventory:
		return _fallback_inventory.size() >= _fallback_max_slots

	if _inventory.has_method("is_full"):
		return _inventory.is_full()

	return false


func _gloot_clear() -> void:
	if not _inventory:
		_fallback_inventory.clear()
		return

	if _inventory.has_method("clear"):
		_inventory.clear()
	_sync_all_flags_to_trigger_system()


# =============================================================================
# FALLBACK IMPLEMENTATION
# =============================================================================

func _setup_fallback_inventory() -> void:
	_fallback_inventory = {}


func _fallback_add_item(item_id: String, quantity: int) -> bool:
	# Check slot limit for new items
	if not _fallback_inventory.has(item_id):
		if _fallback_inventory.size() >= _fallback_max_slots:
			inventory_full.emit()
			return false

	var current: int = _fallback_inventory.get(item_id, 0)
	_fallback_inventory[item_id] = current + quantity

	_on_item_added(item_id, quantity)
	return true


func _fallback_remove_item(item_id: String, quantity: int) -> bool:
	if not _fallback_inventory.has(item_id):
		return false

	var current: int = _fallback_inventory[item_id]
	if current < quantity:
		return false

	var new_qty: int = current - quantity
	if new_qty <= 0:
		_fallback_inventory.erase(item_id)
	else:
		_fallback_inventory[item_id] = new_qty

	_on_item_removed(item_id, quantity)
	return true


func _fallback_has_item(item_id: String, quantity: int) -> bool:
	return _fallback_inventory.get(item_id, 0) >= quantity


# =============================================================================
# CALLBACKS & HELPERS
# =============================================================================

func _on_item_added(item_id: String, quantity: int) -> void:
	item_added.emit(item_id, quantity)

	# Sync to trigger system flags
	if trigger_system:
		trigger_system.set_flag("has_item_" + item_id, true)

	# Report to objective tracker
	if objective_tracker:
		objective_tracker.record_item_acquired(item_id)

	print("FabInventoryIntegration: Added %d x '%s'" % [quantity, item_id])


func _on_item_removed(item_id: String, quantity: int) -> void:
	item_removed.emit(item_id, quantity)

	# Update trigger system flag if item fully removed
	if not has_item(item_id):
		if trigger_system:
			trigger_system.set_flag("has_item_" + item_id, false)

	print("FabInventoryIntegration: Removed %d x '%s'" % [quantity, item_id])


func _apply_item_effect(effect: Dictionary) -> void:
	# Apply consumable effects
	for key in effect:
		var value = effect[key]
		match key:
			"restore_health":
				if trigger_system:
					trigger_system.execute_action({"heal_player": value})
			"restore_stamina":
				# Would connect to stamina system
				print("FabInventoryIntegration: Restore stamina by %s" % value)
			"buff":
				# Would apply buff
				print("FabInventoryIntegration: Apply buff '%s'" % value)
			_:
				print("FabInventoryIntegration: Unknown effect '%s'" % key)


func _sync_all_flags_to_trigger_system() -> void:
	if not trigger_system:
		return

	# Clear all item flags
	var all_items := get_all_items()
	for item_id in all_items:
		trigger_system.set_flag("has_item_" + item_id, all_items[item_id] > 0)


func _get_entity(item_id: String) -> Dictionary:
	if gameplay_loader and gameplay_loader.is_loaded():
		return gameplay_loader.get_entity(item_id)
	return {}


func _find_player() -> Node3D:
	var players := get_tree().get_nodes_in_group("player")
	if players.size() > 0:
		return players[0] as Node3D
	return null


# =============================================================================
# SERIALIZATION
# =============================================================================

## Serialize inventory for save games
func serialize() -> Dictionary:
	return {
		"items": get_all_items()
	}


## Deserialize inventory from save data
func deserialize(data: Dictionary) -> void:
	clear()
	var items: Dictionary = data.get("items", {})
	for item_id in items:
		add_item(item_id, items[item_id])
