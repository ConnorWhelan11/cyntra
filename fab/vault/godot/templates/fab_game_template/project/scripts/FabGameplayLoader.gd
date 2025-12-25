extends Node
class_name FabGameplayLoader

## FabGameplayLoader - Loads and parses gameplay.json at runtime.
##
## This autoload provides access to gameplay configuration including:
## - Entity definitions (NPCs, items)
## - Interaction definitions
## - Trigger definitions
## - Audio zone definitions
## - Objectives/quests
## - Game rules

signal gameplay_loaded(config: Dictionary)
signal entity_configured(entity_id: String, config: Dictionary)
signal objective_updated(objective_id: String, status: String)

const GAMEPLAY_PATH := "res://assets/gameplay.json"

var config: Dictionary = {}
var entities: Dictionary = {}
var interactions: Dictionary = {}
var triggers: Dictionary = {}
var audio_zones: Dictionary = {}
var objectives: Array = []
var rules: Dictionary = {}
var player_config: Dictionary = {}

var _loaded := false


func _ready() -> void:
	_load_gameplay_config()


func _load_gameplay_config() -> void:
	if not FileAccess.file_exists(GAMEPLAY_PATH):
		push_warning("FabGameplayLoader: No gameplay.json found at %s" % GAMEPLAY_PATH)
		_loaded = false
		return

	var file := FileAccess.open(GAMEPLAY_PATH, FileAccess.READ)
	if file == null:
		push_error("FabGameplayLoader: Failed to open %s" % GAMEPLAY_PATH)
		return

	var json_text := file.get_as_text()
	file.close()

	var json := JSON.new()
	var error := json.parse(json_text)
	if error != OK:
		push_error("FabGameplayLoader: JSON parse error at line %d: %s" % [json.get_error_line(), json.get_error_message()])
		return

	config = json.data
	_parse_config()
	_loaded = true
	gameplay_loaded.emit(config)
	print("FabGameplayLoader: Loaded gameplay config for world '%s'" % config.get("world_id", "unknown"))


func _parse_config() -> void:
	player_config = config.get("player", {})
	entities = config.get("entities", {})
	interactions = config.get("interactions", {})
	triggers = config.get("triggers", {})
	audio_zones = config.get("audio_zones", {})
	objectives = config.get("objectives", [])
	rules = config.get("rules", {})


func is_loaded() -> bool:
	return _loaded


## Get entity configuration by ID (matches NPC_SPAWN_* or ITEM_SPAWN_* markers)
func get_entity(entity_id: String) -> Dictionary:
	return entities.get(entity_id, {})


## Get interaction configuration by ID (matches INTERACT_* markers)
func get_interaction(interaction_id: String) -> Dictionary:
	return interactions.get(interaction_id, {})


## Get trigger configuration by ID (matches TRIGGER_* markers)
func get_trigger(trigger_id: String) -> Dictionary:
	return triggers.get(trigger_id, {})


## Get audio zone configuration by ID (matches AUDIO_ZONE_* markers)
func get_audio_zone(zone_id: String) -> Dictionary:
	return audio_zones.get(zone_id, {})


## Get objective configuration by ID
func get_objective(objective_id: String) -> Dictionary:
	for obj in objectives:
		if obj.get("id") == objective_id:
			return obj
	return {}


## Get all NPC entities
func get_npc_entities() -> Dictionary:
	var npcs: Dictionary = {}
	for entity_id in entities:
		var entity: Dictionary = entities[entity_id]
		if entity.get("type") == "npc" or entity.has("behavior"):
			npcs[entity_id] = entity
	return npcs


## Get all item entities
func get_item_entities() -> Dictionary:
	var items: Dictionary = {}
	var item_types := ["key_item", "consumable", "equipment", "document", "currency"]
	for entity_id in entities:
		var entity: Dictionary = entities[entity_id]
		if entity.get("type") in item_types:
			items[entity_id] = entity
	return items


## Get player controller type
func get_player_controller() -> String:
	return player_config.get("controller", "first_person")


## Get player capabilities
func get_player_capabilities() -> Array:
	return player_config.get("capabilities", ["walk", "interact"])


## Get player settings
func get_player_settings() -> Dictionary:
	return player_config.get("settings", {})


## Check if a capability is enabled
func has_capability(capability: String) -> bool:
	return capability in get_player_capabilities()


## Get game rules
func get_rules() -> Dictionary:
	return rules


## Check if combat is enabled
func is_combat_enabled() -> bool:
	return rules.get("combat", {}).get("enabled", false)


## Get inventory rules
func get_inventory_rules() -> Dictionary:
	return rules.get("inventory", {})


## Get saving rules
func get_saving_rules() -> Dictionary:
	return rules.get("saving", {})


## Extract entity ID from marker name
## e.g., "NPC_SPAWN_librarian_01" -> "librarian"
## e.g., "ITEM_SPAWN_book_rare" -> "book_rare"
static func extract_entity_id_from_marker(marker_name: String) -> String:
	var name := marker_name.to_upper()

	# Remove OL_ prefix if present
	if name.begins_with("OL_"):
		name = name.substr(3)

	# Extract ID based on prefix
	if name.begins_with("NPC_SPAWN_"):
		var remainder := marker_name.substr(marker_name.find("NPC_SPAWN_") + 10)
		# Remove numeric suffix if present (e.g., "_01")
		var parts := remainder.split("_")
		if parts.size() > 1 and parts[-1].is_valid_int():
			parts.remove_at(parts.size() - 1)
		return "_".join(parts).to_lower()

	elif name.begins_with("ITEM_SPAWN_"):
		var remainder := marker_name.substr(marker_name.find("ITEM_SPAWN_") + 11)
		var parts := remainder.split("_")
		if parts.size() > 1 and parts[-1].is_valid_int():
			parts.remove_at(parts.size() - 1)
		return "_".join(parts).to_lower()

	return marker_name.to_lower()


## Extract trigger ID from marker name
## e.g., "TRIGGER_entrance" -> "entrance"
static func extract_trigger_id_from_marker(marker_name: String) -> String:
	var name := marker_name.to_upper()

	if name.begins_with("OL_"):
		name = name.substr(3)

	if name.begins_with("TRIGGER_"):
		return marker_name.substr(marker_name.find("TRIGGER_") + 8).to_lower()

	return marker_name.to_lower()


## Extract interaction ID from marker name
## e.g., "INTERACT_bookshelf_ancient" -> "bookshelf_ancient"
static func extract_interaction_id_from_marker(marker_name: String) -> String:
	var name := marker_name.to_upper()

	if name.begins_with("OL_"):
		name = name.substr(3)

	if name.begins_with("INTERACT_"):
		return marker_name.substr(marker_name.find("INTERACT_") + 9).to_lower()

	return marker_name.to_lower()


## Extract audio zone ID from marker name
## e.g., "AUDIO_ZONE_reading_room" -> "reading_room"
static func extract_audio_zone_id_from_marker(marker_name: String) -> String:
	var name := marker_name.to_upper()

	if name.begins_with("OL_"):
		name = name.substr(3)

	if name.begins_with("AUDIO_ZONE_"):
		return marker_name.substr(marker_name.find("AUDIO_ZONE_") + 11).to_lower()

	return marker_name.to_lower()
