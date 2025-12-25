extends Node
class_name FabDialogueIntegration

## FabDialogueIntegration - Bridges Fab gameplay system with dialogue_manager addon.
##
## This integration:
## - Loads dialogue files from the world's dialogue/ folder
## - Starts dialogues when triggered by gameplay events
## - Reports dialogue completion for objective tracking
## - Passes gameplay flags to dialogue conditions

signal dialogue_started(dialogue_id: String)
signal dialogue_completed(dialogue_id: String)
signal dialogue_line(character: String, text: String)

# References
var gameplay_loader: FabGameplayLoader
var trigger_system: FabTriggerSystem
var objective_tracker: FabObjectiveTracker

# State
var _current_dialogue: String = ""
var _dialogue_balloon: Node  # Reference to the dialogue UI


func _ready() -> void:
	_find_references()
	_setup_dialogue_manager()


func _find_references() -> void:
	if has_node("/root/FabGameplayLoader"):
		gameplay_loader = get_node("/root/FabGameplayLoader")
	if has_node("/root/FabTriggerSystem"):
		trigger_system = get_node("/root/FabTriggerSystem")
		trigger_system.action_executed.connect(_on_action_executed)
	if has_node("/root/FabObjectiveTracker"):
		objective_tracker = get_node("/root/FabObjectiveTracker")


func _setup_dialogue_manager() -> void:
	# Check if dialogue_manager addon is available
	if not has_node("/root/DialogueManager"):
		push_warning("FabDialogueIntegration: dialogue_manager addon not found")
		return

	var dm := get_node("/root/DialogueManager")

	# Connect to dialogue_manager signals if available
	if dm.has_signal("dialogue_ended"):
		dm.dialogue_ended.connect(_on_dialogue_ended)


## Start a dialogue by resource path
func start_dialogue(dialogue_path: String, start_title: String = "") -> void:
	if not has_node("/root/DialogueManager"):
		push_warning("FabDialogueIntegration: Cannot start dialogue - addon not available")
		_simulate_dialogue(dialogue_path, start_title)
		return

	var dm := get_node("/root/DialogueManager")

	# Load dialogue resource
	var resource_path := _resolve_dialogue_path(dialogue_path)
	var dialogue_resource = load(resource_path)

	if dialogue_resource == null:
		push_error("FabDialogueIntegration: Failed to load dialogue: %s" % resource_path)
		return

	_current_dialogue = dialogue_path
	dialogue_started.emit(dialogue_path)

	# Get the starting title (first ~ block if not specified)
	var title := start_title if not start_title.is_empty() else _get_default_title(dialogue_path)

	# Show dialogue balloon
	# The exact call depends on how you've set up dialogue_manager
	if dm.has_method("show_dialogue_balloon"):
		dm.show_dialogue_balloon(dialogue_resource, title)
	elif dm.has_method("show_example_dialogue_balloon"):
		dm.show_example_dialogue_balloon(dialogue_resource, title)
	else:
		# Fallback: Try to show using the standard method
		var balloon_scene := load("res://addons/dialogue_manager/dialogue_balloon.tscn")
		if balloon_scene:
			_dialogue_balloon = balloon_scene.instantiate()
			get_tree().current_scene.add_child(_dialogue_balloon)
			_dialogue_balloon.start(dialogue_resource, title)


## Start dialogue for an NPC entity
func start_npc_dialogue(npc_id: String) -> void:
	if not gameplay_loader or not gameplay_loader.is_loaded():
		return

	var entity := gameplay_loader.get_entity(npc_id)
	if entity.is_empty():
		push_warning("FabDialogueIntegration: No entity config for NPC '%s'" % npc_id)
		return

	var dialogue_path: String = entity.get("dialogue", "")
	if dialogue_path.is_empty():
		push_warning("FabDialogueIntegration: NPC '%s' has no dialogue defined" % npc_id)
		return

	# Determine starting title (e.g., "librarian_intro" for first meeting)
	var start_title := _get_npc_start_title(npc_id, entity)

	start_dialogue(dialogue_path, start_title)


## Get gameplay state for dialogue conditions
func get_dialogue_state() -> Dictionary:
	var state: Dictionary = {}

	# Add flags from trigger system
	if trigger_system:
		# This would need to expose flags properly
		pass

	# Add objective states
	if objective_tracker:
		for obj in objective_tracker.get_completed_objectives():
			state["completed_" + obj.get("id", "")] = true

	# Add item possession flags
	if trigger_system:
		# Check common items
		var common_items := ["library_key", "ancient_tome", "archive_pass"]
		for item_id in common_items:
			state["has_" + item_id] = trigger_system.get_flag("has_item_" + item_id)

	return state


func _on_action_executed(action: Dictionary) -> void:
	if action.has("start_dialogue"):
		var dialogue_id: String = action["start_dialogue"]
		start_dialogue(dialogue_id)


func _on_dialogue_ended(dialogue_resource) -> void:
	if _current_dialogue.is_empty():
		return

	var completed_dialogue := _current_dialogue
	_current_dialogue = ""

	dialogue_completed.emit(completed_dialogue)
	print("FabDialogueIntegration: Completed dialogue '%s'" % completed_dialogue)

	# Report to objective tracker
	if objective_tracker:
		# Extract dialogue ID without extension
		var dialogue_id := completed_dialogue.get_file().get_basename()
		objective_tracker.record_dialogue_complete(dialogue_id)


func _resolve_dialogue_path(dialogue_path: String) -> String:
	# If it's already a full path, use it
	if dialogue_path.begins_with("res://"):
		return dialogue_path

	# Otherwise, look in assets/dialogue/
	if dialogue_path.ends_with(".dialogue"):
		return "res://assets/dialogue/" + dialogue_path
	else:
		return "res://assets/dialogue/" + dialogue_path + ".dialogue"


func _get_default_title(dialogue_path: String) -> String:
	# Extract NPC name from dialogue path and use as default title
	var filename := dialogue_path.get_file().get_basename()
	return filename + "_intro"


func _get_npc_start_title(npc_id: String, entity: Dictionary) -> String:
	# Check if we've talked to this NPC before
	var met_flag := "met_" + npc_id
	if trigger_system and trigger_system.get_flag(met_flag):
		return npc_id + "_return"
	else:
		# Mark as met
		if trigger_system:
			trigger_system.set_flag(met_flag, true)
		return npc_id + "_intro"


func _simulate_dialogue(dialogue_path: String, start_title: String) -> void:
	# Fallback simulation when addon not available
	print("FabDialogueIntegration: [SIMULATED] Starting dialogue '%s' at '%s'" % [dialogue_path, start_title])

	_current_dialogue = dialogue_path
	dialogue_started.emit(dialogue_path)

	# Auto-complete after a short delay
	await get_tree().create_timer(0.5).timeout

	_current_dialogue = ""
	dialogue_completed.emit(dialogue_path)

	if objective_tracker:
		var dialogue_id := dialogue_path.get_file().get_basename()
		objective_tracker.record_dialogue_complete(dialogue_id)
