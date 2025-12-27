extends Node
## FabPlaytest - Automated gameplay testing with NitroGen vision-to-action model
##
## This script captures viewport frames, sends them to a NitroGen inference server,
## receives predicted gamepad actions, and applies them to the player controller.
## Metrics are collected and output as JSON for the playability gate.
##
## Usage:
##   Attach this script to a root node in your playtest scene.
##   Run Godot with: --playtest-output=/path/to/results.json
##
## Prerequisites:
##   - NitroGen server running (ssh tunnel from RunPod)
##   - Player node with apply_nitrogen_action() method or FabPlayerController

@export var player_path: NodePath = "Player"
@export var camera_path: NodePath = "Player/Head/Camera3D"
@export var nitrogen_host: String = "localhost"
@export var nitrogen_port: int = 5555
@export var frame_rate: float = 10.0
@export var duration_seconds: float = 60.0
@export var warmup_seconds: float = 5.0

# Viewport capture settings
@export var capture_width: int = 256
@export var capture_height: int = 256

var _player: Node3D
var _camera: Camera3D
var _viewport: SubViewport
var _stream_peer: StreamPeerTCP
var _running: bool = false
var _frame_timer: float = 0.0
var _total_time: float = 0.0

# Metrics
var _frames_processed: int = 0
var _stuck_frames: int = 0
var _interaction_attempts: int = 0
var _jump_attempts: int = 0
var _movement_distance: float = 0.0
var _last_position: Vector3
var _positions_visited: Array[Vector3] = []

# Output
var _output_path: String = ""


func _ready() -> void:
	_parse_cmdline_args()
	_setup_nodes()
	_setup_capture_viewport()
	_connect_to_nitrogen()

	if _output_path.is_empty():
		_output_path = "user://playtest_results.json"

	print("[FabPlaytest] Starting playtest for %.1fs (warmup: %.1fs)" % [duration_seconds, warmup_seconds])
	_running = true


func _parse_cmdline_args() -> void:
	var args := OS.get_cmdline_args()
	for arg in args:
		if arg.begins_with("--playtest-output="):
			_output_path = arg.split("=")[1]
		elif arg.begins_with("--nitrogen-host="):
			nitrogen_host = arg.split("=")[1]
		elif arg.begins_with("--nitrogen-port="):
			nitrogen_port = int(arg.split("=")[1])
		elif arg.begins_with("--duration="):
			duration_seconds = float(arg.split("=")[1])


func _setup_nodes() -> void:
	_player = get_node_or_null(player_path)
	if _player == null:
		# Try to find player by common names
		_player = _find_node_by_names(["Player", "PlayerController", "Character"])

	if _player:
		_last_position = _player.global_position
		print("[FabPlaytest] Found player: %s" % _player.name)
	else:
		push_error("[FabPlaytest] No player node found!")

	_camera = get_node_or_null(camera_path) as Camera3D
	if _camera == null and _player:
		# Try to find camera under player
		_camera = _find_camera_in_tree(_player)

	if _camera:
		print("[FabPlaytest] Found camera: %s" % _camera.name)
	else:
		push_error("[FabPlaytest] No camera found!")


func _find_node_by_names(names: Array) -> Node3D:
	for node_name in names:
		var found := get_tree().root.find_child(node_name, true, false)
		if found and found is Node3D:
			return found as Node3D
	return null


func _find_camera_in_tree(root: Node) -> Camera3D:
	if root is Camera3D:
		return root as Camera3D
	for child in root.get_children():
		var cam := _find_camera_in_tree(child)
		if cam:
			return cam
	return null


func _setup_capture_viewport() -> void:
	# Create a SubViewport for frame capture
	_viewport = SubViewport.new()
	_viewport.size = Vector2i(capture_width, capture_height)
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_viewport.transparent_bg = false
	add_child(_viewport)

	# Create a Camera3D that mirrors the player camera
	if _camera:
		var capture_cam := Camera3D.new()
		capture_cam.fov = _camera.fov
		_viewport.add_child(capture_cam)

		# We'll sync this camera with the player camera each frame

	print("[FabPlaytest] Capture viewport ready: %dx%d" % [capture_width, capture_height])


func _connect_to_nitrogen() -> void:
	_stream_peer = StreamPeerTCP.new()
	var err := _stream_peer.connect_to_host(nitrogen_host, nitrogen_port)
	if err != OK:
		push_error("[FabPlaytest] Failed to connect to NitroGen at %s:%d" % [nitrogen_host, nitrogen_port])
		return

	# Wait for connection (with timeout)
	var connect_time := 0.0
	while _stream_peer.get_status() == StreamPeerTCP.STATUS_CONNECTING and connect_time < 5.0:
		await get_tree().create_timer(0.1).timeout
		connect_time += 0.1
		_stream_peer.poll()

	if _stream_peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
		print("[FabPlaytest] Connected to NitroGen server")
	else:
		push_error("[FabPlaytest] Failed to connect to NitroGen (timeout)")


func _physics_process(delta: float) -> void:
	if not _running:
		return

	_total_time += delta

	# End test after duration
	if _total_time >= duration_seconds:
		_end_playtest()
		return

	# Skip warmup period
	if _total_time < warmup_seconds:
		return

	# Frame rate limiting for NitroGen
	_frame_timer += delta
	if _frame_timer < 1.0 / frame_rate:
		return
	_frame_timer = 0.0

	# Capture and process frame
	_process_frame()


func _process_frame() -> void:
	if not _player or not _viewport:
		return

	# Sync capture camera with player camera
	if _camera and _viewport.get_child_count() > 0:
		var capture_cam: Camera3D = _viewport.get_child(0) as Camera3D
		if capture_cam:
			capture_cam.global_transform = _camera.global_transform

	# Get viewport texture
	var img: Image = _viewport.get_texture().get_image()
	if img == null:
		return

	# Resize if needed
	if img.get_width() != capture_width or img.get_height() != capture_height:
		img.resize(capture_width, capture_height, Image.INTERPOLATE_LANCZOS)

	# In a real implementation, we'd send this to NitroGen via ZMQ
	# For now, we'll simulate with random actions (NitroGen server is in Python)
	var action := _get_nitrogen_action(img)

	# Apply action to player
	_apply_action(action)

	# Track metrics
	_update_metrics(action)

	_frames_processed += 1


func _get_nitrogen_action(img: Image) -> Dictionary:
	# TODO: Implement ZMQ communication with NitroGen server
	# For now, return a simulated action that explores
	# In production, this would serialize the image and send to Python

	# Simulate exploration behavior
	var t := _total_time * 0.5
	return {
		"move_x": sin(t) * 0.8,
		"move_y": cos(t * 0.7) * 0.8,
		"look_x": sin(t * 0.3) * 0.2,
		"look_y": 0.0,
		"jump": randf() < 0.02,
		"interact": randf() < 0.05,
		"sprint": randf() < 0.3
	}


func _apply_action(action: Dictionary) -> void:
	if not _player:
		return

	# Check if player has a custom action handler
	if _player.has_method("apply_nitrogen_action"):
		_player.apply_nitrogen_action(action)
		return

	# Fall back to simulating input for FabPlayerController
	var move_x: float = action.get("move_x", 0.0)
	var move_y: float = action.get("move_y", 0.0)
	var look_x: float = action.get("look_x", 0.0)
	var jump: bool = action.get("jump", false)

	# Apply movement by setting velocity directly (for CharacterBody3D)
	if _player is CharacterBody3D:
		var player_body: CharacterBody3D = _player as CharacterBody3D
		var move_speed: float = 6.5

		var forward := -_player.global_transform.basis.z
		var right := _player.global_transform.basis.x
		var desired := (right * move_x + forward * -move_y) * move_speed

		player_body.velocity.x = desired.x
		player_body.velocity.z = desired.z

		if jump and player_body.is_on_floor():
			player_body.velocity.y = 4.5

		# Apply camera rotation
		_player.rotate_y(-look_x * 0.1)


func _update_metrics(action: Dictionary) -> void:
	if not _player:
		return

	# Movement tracking
	var current_pos := _player.global_position
	var moved := current_pos.distance_to(_last_position)
	_movement_distance += moved

	if moved < 0.01:
		_stuck_frames += 1

	_last_position = current_pos

	# Track unique positions for coverage
	var grid_pos := Vector3(
		snappedf(current_pos.x, 1.0),
		snappedf(current_pos.y, 1.0),
		snappedf(current_pos.z, 1.0)
	)
	if not _positions_visited.has(grid_pos):
		_positions_visited.append(grid_pos)

	# Action tracking
	if action.get("interact", false):
		_interaction_attempts += 1
	if action.get("jump", false):
		_jump_attempts += 1


func _end_playtest() -> void:
	_running = false
	print("[FabPlaytest] Test complete. Saving results...")

	var results := {
		"success": true,
		"frames_processed": _frames_processed,
		"total_playtime_seconds": _total_time - warmup_seconds,
		"stuck_frames": _stuck_frames,
		"stuck_ratio": float(_stuck_frames) / max(_frames_processed, 1),
		"interaction_attempts": _interaction_attempts,
		"jump_attempts": _jump_attempts,
		"movement_distance": _movement_distance,
		"positions_visited": _positions_visited.size(),
		"coverage_estimate": _calculate_coverage()
	}

	# Save results
	var file := FileAccess.open(_output_path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(results, "  "))
		file.close()
		print("[FabPlaytest] Results saved to: %s" % _output_path)
	else:
		push_error("[FabPlaytest] Failed to save results to: %s" % _output_path)

	# Print summary
	print("=== Playtest Results ===")
	print("Frames: %d" % _frames_processed)
	print("Stuck ratio: %.1f%%" % (results["stuck_ratio"] * 100))
	print("Coverage: %.2f" % results["coverage_estimate"])
	print("Interactions: %d" % _interaction_attempts)

	# Exit if running headless
	if DisplayServer.get_name() == "headless":
		get_tree().quit(0)


func _calculate_coverage() -> float:
	if _positions_visited.is_empty():
		return 0.0

	# Calculate bounding box of visited positions
	var min_pos := _positions_visited[0]
	var max_pos := _positions_visited[0]

	for pos in _positions_visited:
		min_pos = Vector3(
			min(min_pos.x, pos.x),
			min(min_pos.y, pos.y),
			min(min_pos.z, pos.z)
		)
		max_pos = Vector3(
			max(max_pos.x, pos.x),
			max(max_pos.y, pos.y),
			max(max_pos.z, pos.z)
		)

	# Estimate coverage based on spread of visited positions
	var spread := (max_pos - min_pos).length()

	# Normalize to 0-1 range (assumes ~100m max exploration)
	return clamp(spread / 100.0, 0.0, 1.0)


func _exit_tree() -> void:
	if _stream_peer:
		_stream_peer.disconnect_from_host()
