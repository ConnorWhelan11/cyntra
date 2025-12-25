extends Area3D

## FabTriggerArea - Enhanced trigger component for Fab-imported levels.
##
## Emits signals when bodies enter/exit the trigger volume.
## Supports one-shot triggers and player-only detection.
##
## Usage:
##   Connect to fab_trigger_entered/exited signals, or use the global event bus.

signal fab_trigger_entered(trigger_name: String, body: Node)
signal fab_trigger_exited(trigger_name: String, body: Node)

@export var trigger_name: String = ""
@export var one_shot: bool = false
@export var require_player: bool = true
@export var player_group: String = "player"
@export var emit_global_event: bool = true

var _triggered := false
var _bodies_inside: Array[Node] = []


func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

	# Try to get trigger name from metadata if not set
	if trigger_name.is_empty() and has_meta("fab_trigger_name"):
		trigger_name = get_meta("fab_trigger_name")


func _on_body_entered(body: Node) -> void:
	# Check if we require player and this isn't the player
	if require_player and not _is_player(body):
		return

	# Check one-shot
	if one_shot and _triggered:
		return

	_triggered = true
	_bodies_inside.append(body)

	# Emit local signal
	fab_trigger_entered.emit(trigger_name, body)

	# Emit global event if enabled
	if emit_global_event:
		_emit_global_enter(body)

	# Debug print
	print("Trigger entered: %s by %s" % [trigger_name, body.name])


func _on_body_exited(body: Node) -> void:
	# Check if we require player and this isn't the player
	if require_player and not _is_player(body):
		return

	# Check if body was tracked
	if not body in _bodies_inside:
		return

	_bodies_inside.erase(body)

	# Emit local signal
	fab_trigger_exited.emit(trigger_name, body)

	# Emit global event if enabled
	if emit_global_event:
		_emit_global_exit(body)

	# Debug print
	print("Trigger exited: %s by %s" % [trigger_name, body.name])


func _is_player(body: Node) -> bool:
	"""Check if body is the player."""
	# Check group membership
	if body.is_in_group(player_group):
		return true

	# Check if it's a CharacterBody3D (fallback)
	if body is CharacterBody3D:
		return true

	return false


func _emit_global_enter(body: Node) -> void:
	"""Emit trigger event on global event bus."""
	# Try FabEvents autoload
	if Engine.has_singleton("FabEvents"):
		var events = Engine.get_singleton("FabEvents")
		if events.has_method("trigger_entered"):
			events.trigger_entered(trigger_name, body)
		return

	# Try getting FabEvents from tree root
	var root := get_tree().root
	if root.has_node("FabEvents"):
		var events := root.get_node("FabEvents")
		if events.has_method("trigger_entered"):
			events.trigger_entered(trigger_name, body)


func _emit_global_exit(body: Node) -> void:
	"""Emit trigger event on global event bus."""
	# Try FabEvents autoload
	if Engine.has_singleton("FabEvents"):
		var events = Engine.get_singleton("FabEvents")
		if events.has_method("trigger_exited"):
			events.trigger_exited(trigger_name, body)
		return

	# Try getting FabEvents from tree root
	var root := get_tree().root
	if root.has_node("FabEvents"):
		var events := root.get_node("FabEvents")
		if events.has_method("trigger_exited"):
			events.trigger_exited(trigger_name, body)


func reset() -> void:
	"""Reset the trigger state (allows one-shot triggers to fire again)."""
	_triggered = false
	_bodies_inside.clear()


func is_body_inside(body: Node) -> bool:
	"""Check if a specific body is currently inside the trigger."""
	return body in _bodies_inside


func get_bodies_inside() -> Array[Node]:
	"""Get all bodies currently inside the trigger."""
	return _bodies_inside.duplicate()


func has_any_body() -> bool:
	"""Check if any body is currently inside the trigger."""
	return not _bodies_inside.is_empty()
