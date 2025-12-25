extends Node
class_name FabTriggerSystem

## FabTriggerSystem - Central event bus and action executor.
##
## Handles:
## - Global trigger events (fired by name)
## - Action execution (show_text, play_music, spawn_npc, etc.)
## - Cooldown management for triggers
## - One-shot trigger tracking
## - Requirement checking

signal trigger_fired(trigger_id: String)
signal action_executed(action: Dictionary)
signal text_displayed(text: String)
signal hint_displayed(hint: String)
signal music_changed(track: String)
signal npc_spawned(npc_id: String, position: Vector3)
signal item_spawned(item_id: String, position: Vector3)
signal flag_changed(flag: String, value: bool)
signal passage_changed(passage_id: String, enabled: bool)

# References to other systems (set by FabLevelLoader)
var gameplay_loader: FabGameplayLoader
var objective_tracker  # FabObjectiveTracker
var interaction_handler  # FabInteractionHandler
var inventory_system  # gloot integration if available

# State tracking
var _fired_one_shots: Dictionary = {}  # trigger_id -> true
var _cooldowns: Dictionary = {}  # trigger_id -> timestamp when available
var _flags: Dictionary = {}  # flag_name -> bool
var _activated_triggers: Array = []  # List of trigger IDs that have been activated


func _ready() -> void:
	# Find gameplay loader
	if has_node("/root/FabGameplayLoader"):
		gameplay_loader = get_node("/root/FabGameplayLoader")


## Fire a trigger by ID (from gameplay.yaml triggers section)
func fire_trigger(trigger_id: String) -> void:
	if not gameplay_loader or not gameplay_loader.is_loaded():
		push_warning("FabTriggerSystem: Cannot fire trigger '%s' - gameplay not loaded" % trigger_id)
		return

	var config := gameplay_loader.get_trigger(trigger_id)
	if config.is_empty():
		# Just record it was fired (for objective tracking)
		_activated_triggers.append(trigger_id)
		trigger_fired.emit(trigger_id)
		return

	# Check one-shot
	if config.get("one_shot", false) and _fired_one_shots.has(trigger_id):
		return

	# Check cooldown
	if _cooldowns.has(trigger_id):
		if Time.get_ticks_msec() < _cooldowns[trigger_id]:
			return

	# Check requirements
	if not _check_requirements(config.get("requires")):
		return

	# Mark as fired
	if config.get("one_shot", false):
		_fired_one_shots[trigger_id] = true

	# Set cooldown
	var cooldown_sec: float = config.get("cooldown_seconds", 0.0)
	if cooldown_sec > 0:
		_cooldowns[trigger_id] = Time.get_ticks_msec() + int(cooldown_sec * 1000)

	# Track activation
	if trigger_id not in _activated_triggers:
		_activated_triggers.append(trigger_id)

	# Emit signal
	trigger_fired.emit(trigger_id)

	print("FabTriggerSystem: Fired trigger '%s'" % trigger_id)


## Handle trigger zone enter event
func on_trigger_enter(trigger_id: String, body: Node) -> void:
	if not _is_player(body):
		return

	var config := gameplay_loader.get_trigger(trigger_id) if gameplay_loader else {}

	# Check requirements
	if not _check_requirements(config.get("requires")):
		return

	# Check one-shot
	if config.get("one_shot", false) and _fired_one_shots.has(trigger_id):
		return

	# Check cooldown
	if _cooldowns.has(trigger_id):
		if Time.get_ticks_msec() < _cooldowns[trigger_id]:
			return

	# Execute on_enter actions
	var actions: Array = config.get("on_enter", [])
	for action in actions:
		execute_action(action)

	# Mark one-shot and cooldown
	if config.get("one_shot", false):
		_fired_one_shots[trigger_id] = true

	var cooldown_sec: float = config.get("cooldown_seconds", 0.0)
	if cooldown_sec > 0:
		_cooldowns[trigger_id] = Time.get_ticks_msec() + int(cooldown_sec * 1000)

	# Track activation
	if trigger_id not in _activated_triggers:
		_activated_triggers.append(trigger_id)

	trigger_fired.emit(trigger_id)


## Handle trigger zone exit event
func on_trigger_exit(trigger_id: String, body: Node) -> void:
	if not _is_player(body):
		return

	var config := gameplay_loader.get_trigger(trigger_id) if gameplay_loader else {}

	# Execute on_exit actions (no requirement check for exit)
	var actions: Array = config.get("on_exit", [])
	for action in actions:
		execute_action(action)


## Execute a single action from gameplay config
func execute_action(action) -> void:
	action_executed.emit(action if action is Dictionary else {"type": action})

	# Handle string action (simple actions like "add_to_inventory")
	if action is String:
		match action:
			"add_to_inventory":
				# Handled by interaction/pickup context
				pass
			_:
				print("FabTriggerSystem: Unknown string action '%s'" % action)
		return

	# Handle dictionary action
	if not (action is Dictionary):
		push_warning("FabTriggerSystem: Invalid action type")
		return

	# Execute based on action key
	for key in action:
		var value = action[key]
		match key:
			"trigger":
				# Fire another trigger
				fire_trigger(value)

			"show_text":
				_show_text(value)

			"show_hint":
				_show_hint(value)

			"play_sound":
				_play_sound(value)

			"play_music":
				_play_music(value)

			"fade_music":
				_fade_music(value)

			"stop_music":
				_stop_music()

			"play_animation":
				_play_animation(value)

			"spawn_npc":
				_spawn_npc(value)

			"despawn_npc":
				_despawn_npc(value)

			"spawn_item":
				_spawn_item(value)

			"consume_item":
				_consume_item(value)

			"give_item":
				_give_item(value)

			"remove_item":
				_remove_item(value)

			"enable_passage":
				_enable_passage(value)

			"disable_passage":
				_disable_passage(value)

			"complete_objective":
				_complete_objective(value)

			"fail_objective":
				_fail_objective(value)

			"set_flag":
				set_flag(value, true)

			"clear_flag":
				set_flag(value, false)

			"teleport_player":
				_teleport_player(value)

			"damage_player":
				_damage_player(value)

			"heal_player":
				_heal_player(value)

			"wait_seconds":
				await get_tree().create_timer(value).timeout

			"camera_shake":
				_camera_shake(value)

			"fade_out":
				_fade_out(value)

			"fade_in":
				_fade_in(value)

			"start_dialogue":
				_start_dialogue(value)

			"open_interface":
				_open_interface(value)

			"close_interface":
				_close_interface(value)

			"end_game":
				_end_game(value)

			_:
				print("FabTriggerSystem: Unknown action key '%s'" % key)


## Check if requirements are met
func _check_requirements(requires) -> bool:
	if requires == null or requires is bool:
		return true

	if not (requires is Dictionary):
		return true

	# Check item requirement
	if requires.has("item"):
		var item_id: String = requires["item"]
		if not _player_has_item(item_id):
			return false

	# Check objective completion requirement
	if requires.has("objective_complete"):
		var obj_id: String = requires["objective_complete"]
		if objective_tracker and not objective_tracker.is_complete(obj_id):
			return false

	# Check flag requirement
	if requires.has("flag"):
		var flag_name: String = requires["flag"]
		if not get_flag(flag_name):
			return false

	return true


## Check if a trigger has been activated
func is_trigger_activated(trigger_id: String) -> bool:
	return trigger_id in _activated_triggers


## Get list of all activated triggers
func get_activated_triggers() -> Array:
	return _activated_triggers.duplicate()


## Set a gameplay flag
func set_flag(flag_name: String, value: bool) -> void:
	_flags[flag_name] = value
	flag_changed.emit(flag_name, value)
	print("FabTriggerSystem: Flag '%s' = %s" % [flag_name, value])


## Get a gameplay flag
func get_flag(flag_name: String) -> bool:
	return _flags.get(flag_name, false)


## Reset all trigger state (for restarting)
func reset() -> void:
	_fired_one_shots.clear()
	_cooldowns.clear()
	_flags.clear()
	_activated_triggers.clear()


# =============================================================================
# PRIVATE ACTION IMPLEMENTATIONS
# =============================================================================

func _is_player(body: Node) -> bool:
	return body.is_in_group("player") or body.name == "Player"


func _player_has_item(item_id: String) -> bool:
	# Check inventory system if available
	if inventory_system and inventory_system.has_method("has_item"):
		return inventory_system.has_item(item_id)
	# Fallback to flags
	return get_flag("has_item_" + item_id)


func _show_text(text: String) -> void:
	text_displayed.emit(text)
	print("[TEXT] %s" % text)
	# TODO: Connect to UI system


func _show_hint(hint: String) -> void:
	hint_displayed.emit(hint)
	print("[HINT] %s" % hint)
	# TODO: Connect to UI hint system


func _play_sound(sound_name: String) -> void:
	print("FabTriggerSystem: Play sound '%s'" % sound_name)
	# TODO: Connect to audio system


func _play_music(track: String) -> void:
	music_changed.emit(track)
	print("FabTriggerSystem: Play music '%s'" % track)
	# TODO: Connect to music system


func _fade_music(duration: float) -> void:
	print("FabTriggerSystem: Fade music over %.1fs" % duration)
	# TODO: Implement music fade


func _stop_music() -> void:
	music_changed.emit("")
	print("FabTriggerSystem: Stop music")
	# TODO: Connect to music system


func _play_animation(anim_name: String) -> void:
	print("FabTriggerSystem: Play animation '%s'" % anim_name)
	# TODO: Find target and play animation


func _spawn_npc(npc_id: String) -> void:
	print("FabTriggerSystem: Spawn NPC '%s'" % npc_id)
	npc_spawned.emit(npc_id, Vector3.ZERO)
	# TODO: Implement NPC spawning


func _despawn_npc(npc_id: String) -> void:
	print("FabTriggerSystem: Despawn NPC '%s'" % npc_id)
	# TODO: Implement NPC despawning


func _spawn_item(item_id: String) -> void:
	print("FabTriggerSystem: Spawn item '%s'" % item_id)
	item_spawned.emit(item_id, Vector3.ZERO)
	# TODO: Implement item spawning


func _consume_item(item_id: String) -> void:
	print("FabTriggerSystem: Consume item '%s'" % item_id)
	set_flag("has_item_" + item_id, false)
	# TODO: Connect to inventory system


func _give_item(item_id: String) -> void:
	print("FabTriggerSystem: Give item '%s'" % item_id)
	set_flag("has_item_" + item_id, true)
	# TODO: Connect to inventory system


func _remove_item(item_id: String) -> void:
	print("FabTriggerSystem: Remove item '%s'" % item_id)
	set_flag("has_item_" + item_id, false)
	# TODO: Connect to inventory system


func _enable_passage(passage_id: String) -> void:
	print("FabTriggerSystem: Enable passage '%s'" % passage_id)
	passage_changed.emit(passage_id, true)
	# TODO: Find and enable collider/door


func _disable_passage(passage_id: String) -> void:
	print("FabTriggerSystem: Disable passage '%s'" % passage_id)
	passage_changed.emit(passage_id, false)
	# TODO: Find and disable collider/door


func _complete_objective(objective_id: String) -> void:
	if objective_tracker:
		objective_tracker.complete(objective_id)
	else:
		print("FabTriggerSystem: Complete objective '%s'" % objective_id)


func _fail_objective(objective_id: String) -> void:
	if objective_tracker:
		objective_tracker.fail(objective_id)
	else:
		print("FabTriggerSystem: Fail objective '%s'" % objective_id)


func _teleport_player(marker_name: String) -> void:
	print("FabTriggerSystem: Teleport player to '%s'" % marker_name)
	# TODO: Find marker and teleport player


func _damage_player(amount: float) -> void:
	print("FabTriggerSystem: Damage player by %.1f" % amount)
	# TODO: Connect to health system


func _heal_player(amount: float) -> void:
	print("FabTriggerSystem: Heal player by %.1f" % amount)
	# TODO: Connect to health system


func _camera_shake(intensity: float) -> void:
	print("FabTriggerSystem: Camera shake intensity %.1f" % intensity)
	# TODO: Connect to camera system


func _fade_out(duration: float) -> void:
	print("FabTriggerSystem: Fade out over %.1fs" % duration)
	# TODO: Connect to transition system


func _fade_in(duration: float) -> void:
	print("FabTriggerSystem: Fade in over %.1fs" % duration)
	# TODO: Connect to transition system


func _start_dialogue(dialogue_id: String) -> void:
	print("FabTriggerSystem: Start dialogue '%s'" % dialogue_id)
	# TODO: Connect to dialogue_manager addon


func _open_interface(interface_name: String) -> void:
	print("FabTriggerSystem: Open interface '%s'" % interface_name)
	# TODO: Connect to UI system


func _close_interface(interface_name: String) -> void:
	print("FabTriggerSystem: Close interface '%s'" % interface_name)
	# TODO: Connect to UI system


func _end_game(result: String) -> void:
	print("FabTriggerSystem: End game with result '%s'" % result)
	# TODO: Show end screen, save, etc.
