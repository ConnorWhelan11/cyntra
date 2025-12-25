extends Node
class_name FabObjectiveTracker

## FabObjectiveTracker - Tracks quest/objective progress.
##
## Manages objective states: locked -> active -> completed/failed
## Listens for completion conditions and updates state accordingly.

signal objective_unlocked(objective_id: String)
signal objective_active(objective_id: String)
signal objective_completed(objective_id: String)
signal objective_failed(objective_id: String)
signal objective_progress(objective_id: String, current: int, total: int)
signal all_objectives_complete()

enum ObjectiveState { LOCKED, ACTIVE, COMPLETED, FAILED }

# References
var gameplay_loader: FabGameplayLoader
var trigger_system: FabTriggerSystem

# State
var _objectives: Array = []  # Parsed from gameplay
var _states: Dictionary = {}  # objective_id -> ObjectiveState
var _progress: Dictionary = {}  # objective_id -> { current: int, total: int }
var _collected_items: Dictionary = {}  # item_id -> count


func _ready() -> void:
	# Find references
	if has_node("/root/FabGameplayLoader"):
		gameplay_loader = get_node("/root/FabGameplayLoader")
		gameplay_loader.gameplay_loaded.connect(_on_gameplay_loaded)

	if has_node("/root/FabTriggerSystem"):
		trigger_system = get_node("/root/FabTriggerSystem")
		trigger_system.trigger_fired.connect(_on_trigger_fired)
		trigger_system.flag_changed.connect(_on_flag_changed)


func _on_gameplay_loaded(config: Dictionary) -> void:
	_objectives = config.get("objectives", [])
	_initialize_objectives()


func _initialize_objectives() -> void:
	_states.clear()
	_progress.clear()

	for obj in _objectives:
		var obj_id: String = obj.get("id", "")
		var requires: Array = obj.get("requires", [])

		# Check if objective starts unlocked
		if requires.is_empty():
			_states[obj_id] = ObjectiveState.ACTIVE
			objective_active.emit(obj_id)
			print("FabObjectiveTracker: Objective '%s' is active" % obj_id)
		else:
			_states[obj_id] = ObjectiveState.LOCKED

		# Initialize progress for collection objectives
		var complete_when: Dictionary = obj.get("complete_when", {})
		if complete_when.has("items_collected"):
			var items_req: Dictionary = complete_when["items_collected"]
			_progress[obj_id] = {
				"current": 0,
				"total": items_req.get("count", 1)
			}


## Get current state of an objective
func get_state(objective_id: String) -> ObjectiveState:
	return _states.get(objective_id, ObjectiveState.LOCKED)


## Check if objective is complete
func is_complete(objective_id: String) -> bool:
	return get_state(objective_id) == ObjectiveState.COMPLETED


## Check if objective is active (unlocked but not complete)
func is_active(objective_id: String) -> bool:
	return get_state(objective_id) == ObjectiveState.ACTIVE


## Check if objective is locked
func is_locked(objective_id: String) -> bool:
	return get_state(objective_id) == ObjectiveState.LOCKED


## Get all active objectives
func get_active_objectives() -> Array:
	var active: Array = []
	for obj in _objectives:
		var obj_id: String = obj.get("id", "")
		if is_active(obj_id):
			active.append(obj)
	return active


## Get all completed objectives
func get_completed_objectives() -> Array:
	var completed: Array = []
	for obj in _objectives:
		var obj_id: String = obj.get("id", "")
		if is_complete(obj_id):
			completed.append(obj)
	return completed


## Get objective config by ID
func get_objective(objective_id: String) -> Dictionary:
	for obj in _objectives:
		if obj.get("id") == objective_id:
			return obj
	return {}


## Get objective progress (for collection objectives)
func get_progress(objective_id: String) -> Dictionary:
	return _progress.get(objective_id, {"current": 0, "total": 1})


## Manually complete an objective
func complete(objective_id: String) -> void:
	if not _states.has(objective_id):
		push_warning("FabObjectiveTracker: Unknown objective '%s'" % objective_id)
		return

	if _states[objective_id] == ObjectiveState.COMPLETED:
		return

	_states[objective_id] = ObjectiveState.COMPLETED
	objective_completed.emit(objective_id)
	print("FabObjectiveTracker: Completed objective '%s'" % objective_id)

	# Get objective config
	var obj := get_objective(objective_id)

	# Execute on_complete actions
	var on_complete: Array = obj.get("on_complete", [])
	for action in on_complete:
		if trigger_system:
			trigger_system.execute_action(action)

	# Unlock dependent objectives
	_check_unlock_dependents(objective_id)

	# Check if all objectives complete
	_check_all_complete()


## Manually fail an objective
func fail(objective_id: String) -> void:
	if not _states.has(objective_id):
		return

	_states[objective_id] = ObjectiveState.FAILED
	objective_failed.emit(objective_id)
	print("FabObjectiveTracker: Failed objective '%s'" % objective_id)


## Record item collection (for collection objectives)
func record_item_collected(item_id: String) -> void:
	_collected_items[item_id] = _collected_items.get(item_id, 0) + 1

	# Check collection objectives
	for obj in _objectives:
		var obj_id: String = obj.get("id", "")
		if not is_active(obj_id):
			continue

		var complete_when: Dictionary = obj.get("complete_when", {})
		if complete_when.has("items_collected"):
			var req: Dictionary = complete_when["items_collected"]
			var req_item: String = req.get("item", "")
			var req_count: int = req.get("count", 1)

			if req_item == item_id:
				var current: int = _collected_items.get(item_id, 0)
				_progress[obj_id] = {"current": current, "total": req_count}
				objective_progress.emit(obj_id, current, req_count)

				if current >= req_count:
					complete(obj_id)


## Record item acquisition (for item_acquired objectives)
func record_item_acquired(item_id: String) -> void:
	# Also record for collection
	record_item_collected(item_id)

	# Check item_acquired objectives
	for obj in _objectives:
		var obj_id: String = obj.get("id", "")
		if not is_active(obj_id):
			continue

		var complete_when: Dictionary = obj.get("complete_when", {})
		if complete_when.get("item_acquired") == item_id:
			complete(obj_id)


## Record dialogue completion
func record_dialogue_complete(dialogue_id: String) -> void:
	for obj in _objectives:
		var obj_id: String = obj.get("id", "")
		if not is_active(obj_id):
			continue

		var complete_when: Dictionary = obj.get("complete_when", {})
		if complete_when.get("dialogue_complete") == dialogue_id:
			complete(obj_id)


## Reset all objective state
func reset() -> void:
	_states.clear()
	_progress.clear()
	_collected_items.clear()
	_initialize_objectives()


func _on_trigger_fired(trigger_id: String) -> void:
	# Check trigger-based objectives
	for obj in _objectives:
		var obj_id: String = obj.get("id", "")
		if not is_active(obj_id):
			continue

		var complete_when: Dictionary = obj.get("complete_when", {})

		# Single trigger condition
		if complete_when.get("trigger") == trigger_id:
			complete(obj_id)

		# Multiple triggers condition
		if complete_when.has("triggers_activated"):
			var required_triggers: Array = complete_when["triggers_activated"]
			var all_activated := true

			for req_trigger in required_triggers:
				if not trigger_system.is_trigger_activated(req_trigger):
					all_activated = false
					break

			if all_activated:
				complete(obj_id)


func _on_flag_changed(flag: String, value: bool) -> void:
	# Some objectives might depend on flags
	pass


func _check_unlock_dependents(completed_id: String) -> void:
	for obj in _objectives:
		var obj_id: String = obj.get("id", "")
		if _states.get(obj_id) != ObjectiveState.LOCKED:
			continue

		var requires: Array = obj.get("requires", [])
		if requires.is_empty():
			continue

		# Check if all requirements are now complete
		var all_complete := true
		for req_id in requires:
			if not is_complete(req_id):
				all_complete = false
				break

		if all_complete:
			_states[obj_id] = ObjectiveState.ACTIVE
			objective_unlocked.emit(obj_id)
			objective_active.emit(obj_id)
			print("FabObjectiveTracker: Unlocked objective '%s'" % obj_id)


func _check_all_complete() -> void:
	# Check if all main/final objectives are complete
	for obj in _objectives:
		var obj_type: String = obj.get("type", "main")
		if obj_type in ["main", "final"]:
			var obj_id: String = obj.get("id", "")
			if not is_complete(obj_id):
				return

	all_objectives_complete.emit()
	print("FabObjectiveTracker: All main objectives complete!")


## Get formatted objective text for UI
func get_objective_display_text(objective_id: String) -> String:
	var obj := get_objective(objective_id)
	if obj.is_empty():
		return ""

	var description: String = obj.get("description", "")

	# Add progress for collection objectives
	if _progress.has(objective_id):
		var prog: Dictionary = _progress[objective_id]
		description = description.replace(
			"(0/%d)" % prog["total"],
			"(%d/%d)" % [prog["current"], prog["total"]]
		)

	return description


## Get hint for objective if available
func get_objective_hint(objective_id: String) -> String:
	var obj := get_objective(objective_id)
	return obj.get("hint", "")


## Serialize state for saving
func serialize() -> Dictionary:
	return {
		"states": _states.duplicate(),
		"progress": _progress.duplicate(),
		"collected_items": _collected_items.duplicate()
	}


## Deserialize state for loading
func deserialize(data: Dictionary) -> void:
	_states = data.get("states", {}).duplicate()
	_progress = data.get("progress", {}).duplicate()
	_collected_items = data.get("collected_items", {}).duplicate()
