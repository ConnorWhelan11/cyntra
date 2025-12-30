extends Node

## Visual QA Capture Script
## Captures deterministic screenshots of game rendering for regression testing.
## Run with: godot --headless --path . -s res://tests/visual_qa_capture.gd
## Optional flags:
##   --mode=basic|terrain|all
##   --seed=42424242
##   --output=res://tests/visual_qa_captures/
##   --size=1280x720
##   --tag=baseline
##
## Supports two capture modes:
## - Basic captures: Default camera positions for regression testing
## - Terrain captures: Target specific terrain types for quality evaluation

const OUTPUT_DIR := "user://visual_qa/"
const CAPTURE_DELAY_FRAMES := 10  # Wait for rendering to stabilize
const MAP_READY_POLL_SEC := 0.1
const MAP_READY_TIMEOUT_SEC := 10.0

const VISUAL_QA_SEED := 42424242  # Default seed for deterministic map + capture selection

# Terrain type IDs (must match server-side terrain definitions)
enum TerrainType {
	PLAINS = 0,
	GRASSLAND = 1,
	HILLS = 2,
	MOUNTAINS = 3,
	COAST = 4,
	OCEAN = 5,
	FOREST = 6,
	DESERT = 7,
	TUNDRA = 8,
	JUNGLE = 9,
	MARSH = 10,
}

# Terrain names for lookup
const TERRAIN_NAMES := {
	TerrainType.PLAINS: "plains",
	TerrainType.GRASSLAND: "grassland",
	TerrainType.HILLS: "hills",
	TerrainType.MOUNTAINS: "mountains",
	TerrainType.COAST: "coast",
	TerrainType.OCEAN: "ocean",
	TerrainType.FOREST: "forest",
	TerrainType.DESERT: "desert",
	TerrainType.TUNDRA: "tundra",
	TerrainType.JUNGLE: "jungle",
	TerrainType.MARSH: "marsh",
}

# Basic capture configurations: name -> camera settings
const CAPTURES: Array = [
	{
		"name": "terrain_overview",
		"description": "Full map terrain view from default camera",
		"zoom": 1.0,
		"offset": Vector2.ZERO,
	},
	{
		"name": "terrain_zoomed",
		"description": "Zoomed terrain detail",
		"zoom": 2.0,
		"offset": Vector2.ZERO,
	},
	{
		"name": "terrain_corner_nw",
		"description": "Northwest corner of map",
		"zoom": 1.5,
		"offset": Vector2(-500, -500),
	},
	{
		"name": "units_spawn",
		"description": "Starting units at spawn location",
		"zoom": 2.5,
		"offset": Vector2.ZERO,  # Will be set to player start position
	},
]

# Terrain-specific capture configurations for quality evaluation
# These target specific terrain types and biome boundaries
const TERRAIN_CAPTURES: Array = [
	{
		"name": "terrain_water_clarity",
		"description": "Ocean and coast tiles for water rendering quality",
		"zoom": 2.5,
		"target_terrain": [TerrainType.OCEAN, TerrainType.COAST],
		"prefer_boundary": true,  # Prefer tiles adjacent to land
		"category": "water",
	},
	{
		"name": "terrain_coastline_blend",
		"description": "Coast-to-land transition for blend quality",
		"zoom": 3.0,
		"target_terrain": [TerrainType.COAST],
		"require_adjacent": [TerrainType.PLAINS, TerrainType.GRASSLAND, TerrainType.DESERT],
		"category": "water",
	},
	{
		"name": "terrain_forest_detail",
		"description": "Forest tiles for vegetation rendering",
		"zoom": 2.5,
		"target_terrain": [TerrainType.FOREST, TerrainType.JUNGLE],
		"category": "vegetation",
	},
	{
		"name": "terrain_mountain_elevation",
		"description": "Mountains and hills for elevation rendering",
		"zoom": 2.0,
		"target_terrain": [TerrainType.MOUNTAINS, TerrainType.HILLS],
		"prefer_boundary": true,
		"category": "elevation",
	},
	{
		"name": "terrain_desert_arid",
		"description": "Desert tiles for arid terrain quality",
		"zoom": 2.5,
		"target_terrain": [TerrainType.DESERT],
		"category": "arid",
	},
	{
		"name": "terrain_grassland_plains",
		"description": "Grassland and plains for temperate terrain",
		"zoom": 2.5,
		"target_terrain": [TerrainType.GRASSLAND, TerrainType.PLAINS],
		"category": "temperate",
	},
	{
		"name": "terrain_tundra_cold",
		"description": "Tundra tiles for cold biome rendering",
		"zoom": 2.5,
		"target_terrain": [TerrainType.TUNDRA],
		"category": "cold",
	},
	{
		"name": "terrain_biome_boundary",
		"description": "Multi-biome boundary for transition quality",
		"zoom": 1.8,
		"target_terrain": [TerrainType.GRASSLAND, TerrainType.FOREST, TerrainType.PLAINS],
		"require_diverse_neighbors": true,  # Must have 3+ different adjacent terrain types
		"category": "transition",
	},
	{
		"name": "terrain_marsh_wetland",
		"description": "Marsh tiles for wetland rendering",
		"zoom": 2.5,
		"target_terrain": [TerrainType.MARSH],
		"category": "wetland",
	},
]

var _game_scene: Node = null
var _capture_index := 0
var _frames_waited := 0
var _captures_completed: Array = []
var _output_dir := OUTPUT_DIR
var _output_path := ""
var _start_position := Vector2.ZERO
var _capture_seed := VISUAL_QA_SEED
var _capture_tag := ""
var _requested_size := Vector2i.ZERO
var _hex_size := 36.0
var _rng := RandomNumberGenerator.new()
var _finish_started := false

# Capture mode: "basic" for regression tests, "terrain" for quality evaluation, "all" for both
var _capture_mode := "all"
var _active_captures: Array = []  # Combined list based on mode
var _map_view: MapViewMultiplayer = null
var _terrain_positions: Dictionary = {}  # Cached terrain type -> Array of hex positions


func _ready() -> void:
	print("\n")
	print("========================================")
	print("     VISUAL QA CAPTURE SYSTEM          ")
	print("========================================")
	print("\n")

	# Parse command line arguments for capture mode
	_parse_args()

	_rng.seed = _capture_seed
	_apply_window_size()

	# Build active captures list based on mode
	_build_capture_list()

	print("[VisualQA] Mode: %s (%d captures)" % [_capture_mode, _active_captures.size()])

	# Create output directory
	_output_path = _resolve_output_path()
	if _output_path.is_empty():
		print("[ERROR] Invalid output directory")
		get_tree().quit(1)
		return
	var dir_err := DirAccess.make_dir_recursive_absolute(_output_path)
	if dir_err != OK:
		if _output_dir.begins_with("res://"):
			print("[VisualQA] Output directory not writable, falling back to user://")
			_output_dir = OUTPUT_DIR
			_output_path = _resolve_output_path()
			dir_err = DirAccess.make_dir_recursive_absolute(_output_path)
		if dir_err != OK:
			print("[ERROR] Failed to create output directory: %s (error=%d)" % [_output_path, dir_err])
			get_tree().quit(1)
			return
	print("[VisualQA] Output directory: %s" % _output_path)

	# Load the game scene
	_load_game_scene()


func _parse_args() -> void:
	## Parse command line arguments for capture mode selection
	var args := OS.get_cmdline_args()
	for arg in args:
		if arg.begins_with("--mode="):
			var mode := arg.substr(7)
			if mode in ["basic", "terrain", "all"]:
				_capture_mode = mode
			else:
				print("[VisualQA] Unknown mode '%s', using 'all'" % mode)
		elif arg.begins_with("--seed="):
			var seed_str := arg.substr(7)
			if seed_str.is_valid_int():
				var seed_val := int(seed_str)
				if seed_val < 0:
					print("[VisualQA] Seed must be >= 0, using default")
				else:
					_capture_seed = seed_val
			else:
				print("[VisualQA] Invalid seed '%s', using default" % seed_str)
		elif arg.begins_with("--output="):
			_output_dir = arg.substr(9)
		elif arg.begins_with("--tag="):
			_capture_tag = arg.substr(6)
		elif arg.begins_with("--size="):
			var size_str := arg.substr(7).replace("X", "x")
			var parts := size_str.split("x")
			if parts.size() == 2 and parts[0].is_valid_int() and parts[1].is_valid_int():
				_requested_size = Vector2i(int(parts[0]), int(parts[1]))
			else:
				print("[VisualQA] Invalid size '%s', ignoring" % size_str)


func _build_capture_list() -> void:
	## Build the list of captures based on the selected mode
	_active_captures = []

	if _capture_mode == "basic" or _capture_mode == "all":
		_active_captures.append_array(CAPTURES)

	if _capture_mode == "terrain" or _capture_mode == "all":
		_active_captures.append_array(TERRAIN_CAPTURES)


func _get_output_path() -> String:
	# Use project directory for easier access
	var base := ProjectSettings.globalize_path("res://")
	return base + "tests/visual_qa_captures/"

func _resolve_output_path() -> String:
	var dir := _output_dir.strip_edges()
	if dir.is_empty():
		dir = OUTPUT_DIR

	if dir.begins_with("res://") or dir.begins_with("user://"):
		dir = ProjectSettings.globalize_path(dir)
	elif dir.begins_with("/"):
		pass
	else:
		var base := ProjectSettings.globalize_path("res://")
		dir = _join_path(base, dir)

	if not _capture_tag.is_empty():
		dir = _join_path(dir, _capture_tag)

	return _ensure_trailing_slash(dir)

func _join_path(base: String, segment: String) -> String:
	var out := _ensure_trailing_slash(base)
	return out + segment

func _ensure_trailing_slash(path: String) -> String:
	if path.ends_with("/"):
		return path
	return path + "/"

func _apply_window_size() -> void:
	if _requested_size.x <= 0 or _requested_size.y <= 0:
		return
	DisplayServer.window_set_size(_requested_size)
	print("[VisualQA] Requested window size: %s" % _requested_size)

func _configure_game_scene(scene: Node) -> void:
	if scene == null:
		return
	var stack: Array = [scene]
	while not stack.is_empty():
		var node: Node = stack.pop_back()
		if node is LocalGame:
			node.map_seed = _capture_seed
			print("[VisualQA] Using map seed: %d" % _capture_seed)
		for child in node.get_children():
			stack.append(child)

func _load_game_scene() -> void:
	print("[VisualQA] Loading game scene...")

	var game_scene_res := load("res://scenes/Game.tscn")
	if game_scene_res == null:
		print("[ERROR] Failed to load Game.tscn")
		get_tree().quit(1)
		return

	_game_scene = game_scene_res.instantiate()
	_configure_game_scene(_game_scene)
	add_child(_game_scene)

	# Wait for game to initialize fully
	await get_tree().create_timer(2.0).timeout

	# Find the LocalGame node and get player start position
	var local_game := _find_local_game()
	if local_game == null:
		print("[ERROR] LocalGame not found in scene")
		get_tree().quit(1)
		return

	_map_view = _find_map_view(local_game)
	if _map_view == null:
		print("[ERROR] MapView not found in scene")
		get_tree().quit(1)
		return

	if not await _wait_for_map_ready(_map_view):
		print("[ERROR] MapView tiles not ready before timeout")
		get_tree().quit(1)
		return

	_hex_size = _map_view.HEX_SIZE if _map_view else _hex_size
	_start_position = _get_player_start_position(_map_view)
	print("[VisualQA] Player start position: %s" % _start_position)

	_cache_terrain_positions()

	# Start capture sequence
	_start_captures()


func _find_local_game() -> Node:
	# The Game scene contains a LocalGame
	if _game_scene == null:
		return null
	var stack: Array = [_game_scene]
	while not stack.is_empty():
		var node: Node = stack.pop_back()
		if node is LocalGame:
			return node
		for child in node.get_children():
			stack.append(child)
	return null


func _find_map_view(root: Node) -> MapViewMultiplayer:
	if root == null:
		return null
	var stack: Array = [root]
	while not stack.is_empty():
		var node: Node = stack.pop_back()
		if node is MapViewMultiplayer:
			return node
		for child in node.get_children():
			stack.append(child)
	return null


func _get_player_start_position(map_view: MapViewMultiplayer) -> Vector2:
	# Try to find the first unit's position
	if map_view and map_view.has_method("get_camera_offset"):
		return map_view.get_camera_offset()
	return Vector2.ZERO


func _wait_for_map_ready(map_view: MapViewMultiplayer) -> bool:
	var elapsed := 0.0
	while elapsed < MAP_READY_TIMEOUT_SEC:
		if map_view.map_width > 0 and map_view.map_height > 0:
			var total := map_view.map_width * map_view.map_height
			if map_view.tiles.size() >= total:
				return true
		await get_tree().create_timer(MAP_READY_POLL_SEC).timeout
		elapsed += MAP_READY_POLL_SEC
	return false


func _cache_terrain_positions() -> void:
	## Build a cache of terrain type -> list of hex positions for fast lookup
	if _map_view == null:
		return

	_terrain_positions.clear()

	# Initialize arrays for each terrain type
	for terrain_id in TERRAIN_NAMES.keys():
		_terrain_positions[terrain_id] = []

	# Iterate through all tiles and categorize by terrain type
	var width: int = _map_view.map_width
	var height: int = _map_view.map_height
	var tiles: Array = _map_view.tiles

	for y in range(height):
		for x in range(width):
			var idx: int = y * width + x
			if idx >= tiles.size():
				continue

			var terrain_id := _tile_terrain_id(tiles[idx])

			if terrain_id >= 0 and terrain_id in _terrain_positions:
				_terrain_positions[terrain_id].append(Vector2i(x, y))

	# Log terrain distribution
	print("[VisualQA] Terrain distribution:")
	for terrain_id in _terrain_positions.keys():
		var count: int = _terrain_positions[terrain_id].size()
		if count > 0:
			var name: String = TERRAIN_NAMES.get(terrain_id, "unknown")
			print("  %s: %d tiles" % [name, count])


func _find_terrain_position(config: Dictionary) -> Vector2:
	## Find a suitable position for a terrain-specific capture
	## Returns the pixel offset to center the camera on
	if _map_view == null:
		return Vector2.ZERO

	var target_terrains: Array = config.get("target_terrain", [])
	var prefer_boundary: bool = config.get("prefer_boundary", false)
	var require_adjacent: Array = config.get("require_adjacent", [])
	var require_diverse: bool = config.get("require_diverse_neighbors", false)

	# Collect all candidate positions
	var candidates: Array = []
	for terrain_id in target_terrains:
		if terrain_id in _terrain_positions:
			candidates.append_array(_terrain_positions[terrain_id])

	if candidates.is_empty():
		print("[VisualQA] No tiles found for target terrains")
		return Vector2.ZERO

	# Filter candidates based on requirements
	var filtered: Array = []
	for hex in candidates:
		var neighbors := _get_hex_neighbors(hex)
		var neighbor_terrains := _get_terrain_types_at(neighbors)

		# Check require_adjacent
		if not require_adjacent.is_empty():
			var has_required := false
			for adj_terrain in require_adjacent:
				if adj_terrain in neighbor_terrains:
					has_required = true
					break
			if not has_required:
				continue

		# Check require_diverse_neighbors
		if require_diverse:
			var unique_terrains := {}
			for t in neighbor_terrains:
				unique_terrains[t] = true
			if unique_terrains.size() < 3:
				continue

		# Score for boundary preference
		var score := 0
		if prefer_boundary:
			# Higher score for tiles with diverse neighbors
			var unique := {}
			for t in neighbor_terrains:
				unique[t] = true
			score = unique.size()

		filtered.append({"hex": hex, "score": score})

	# If no candidates after filtering, fall back to all candidates
	if filtered.is_empty():
		for hex in candidates:
			filtered.append({"hex": hex, "score": 0})

	# Sort by score (descending), then deterministic position
	filtered.sort_custom(func(a, b):
		if a["score"] == b["score"]:
			var ha: Vector2i = a["hex"]
			var hb: Vector2i = b["hex"]
			if ha.y == hb.y:
				return ha.x < hb.x
			return ha.y < hb.y
		return a["score"] > b["score"]
	)

	# Pick from top candidates (with some randomization for variety)
	var top_count := mini(5, filtered.size())
	var selected: Dictionary = filtered[_rng.randi_range(0, top_count - 1)]
	var selected_hex: Vector2i = selected["hex"]

	# Convert hex to pixel position
	return _hex_to_pixel(selected_hex)


func _get_hex_neighbors(hex: Vector2i) -> Array:
	## Get the 6 neighboring hex positions (pointy-top hex grid)
	var neighbors: Array = []
	var offsets_even := [
		Vector2i(1, 0), Vector2i(0, -1), Vector2i(-1, -1),
		Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1)
	]
	var offsets_odd := [
		Vector2i(1, 0), Vector2i(1, -1), Vector2i(0, -1),
		Vector2i(-1, 0), Vector2i(0, 1), Vector2i(1, 1)
	]

	var offsets := offsets_even if hex.y % 2 == 0 else offsets_odd
	for offset: Vector2i in offsets:
		var neighbor: Vector2i = hex + offset
		# Handle horizontal wrapping
		if _map_view.wrap_horizontal:
			if neighbor.x < 0:
				neighbor.x = _map_view.map_width - 1
			elif neighbor.x >= _map_view.map_width:
				neighbor.x = 0
		neighbors.append(neighbor)

	return neighbors


func _get_terrain_types_at(hexes: Array) -> Array:
	## Get terrain types for a list of hex positions
	if _map_view == null:
		return []

	var terrains: Array = []
	var width: int = _map_view.map_width
	var tiles: Array = _map_view.tiles

	for hex: Vector2i in hexes:
		if hex.x < 0 or hex.x >= _map_view.map_width:
			continue
		if hex.y < 0 or hex.y >= _map_view.map_height:
			continue

		var idx: int = hex.y * width + hex.x
		if idx < tiles.size():
			var terrain_id := _tile_terrain_id(tiles[idx])
			terrains.append(terrain_id)

	return terrains


func _hex_to_pixel(hex: Vector2i) -> Vector2:
	## Convert hex coordinates to pixel offset for camera positioning
	var x_offset := 0.0
	if hex.y % 2 == 1:
		x_offset = _hex_size * 0.866  # sqrt(3)/2

	var px := hex.x * _hex_size * 1.732 + x_offset  # sqrt(3) * size
	var py := hex.y * _hex_size * 1.5

	# Return negative offset (camera offset is inverted)
	return -Vector2(px, py)


func _start_captures() -> void:
	print("[VisualQA] Starting capture sequence (%d captures)" % _active_captures.size())
	_capture_index = 0
	_frames_waited = 0
	_captures_completed.clear()
	_finish_started = false


func _process(_delta: float) -> void:
	if _game_scene == null:
		return

	if _capture_index >= _active_captures.size():
		# All captures complete
		if not _finish_started:
			_finish_started = true
			set_process(false)
			_finish()
		return

	_frames_waited += 1

	if _frames_waited == 1:
		# Set up camera for this capture
		_setup_capture(_active_captures[_capture_index])
	elif _frames_waited >= CAPTURE_DELAY_FRAMES:
		# Take the screenshot
		_take_capture(_active_captures[_capture_index])
		_capture_index += 1
		_frames_waited = 0


func _setup_capture(config: Dictionary) -> void:
	var local_game := _find_local_game()
	if local_game == null:
		return

	var map_view: MapViewMultiplayer = null
	if local_game.has_node("MapView"):
		map_view = local_game.get_node("MapView")

	if map_view == null:
		print("[VisualQA] Warning: MapView not found")
		return

	# Apply camera settings
	var zoom: float = config.get("zoom", 1.0)
	var offset: Vector2 = config.get("offset", Vector2.ZERO)
	var capture_name: String = config.get("name", "unknown")

	# Determine offset based on capture type
	if config.has("target_terrain"):
		# Terrain-specific capture: find a suitable position
		offset = _find_terrain_position(config)
		if offset == Vector2.ZERO:
			print("[VisualQA] Warning: Could not find terrain for %s, using center" % capture_name)
	elif capture_name == "units_spawn":
		# Center on player start position
		offset = _start_position

	if map_view.has_method("set_zoom_level"):
		map_view.set_zoom_level(zoom)
	if map_view.has_method("set_camera_offset"):
		map_view.set_camera_offset(offset)

	var category: String = config.get("category", "general")
	print("[VisualQA] Setup: %s [%s] (zoom=%.1f, offset=%s)" % [capture_name, category, zoom, offset])


func _take_capture(config: Dictionary) -> void:
	var capture_name: String = config.get("name", "unknown")
	var filename := "%s.png" % capture_name
	var filepath := _output_path + filename

	# Get the viewport image
	var viewport := get_viewport()
	if viewport == null:
		print("[ERROR] No viewport available for capture")
		return

	# Wait for frame to render
	var image := viewport.get_texture().get_image()
	if image == null:
		print("[ERROR] Failed to get viewport image")
		return

	# Save the image
	var error := image.save_png(filepath)
	if error != OK:
		print("[ERROR] Failed to save capture: %s (error=%d)" % [filepath, error])
		return

	var category: String = config.get("category", "general")
	print("[CAPTURE] %s [%s] -> %s" % [capture_name, category, filepath])

	# Build capture metadata
	var capture_meta := {
		"name": capture_name,
		"path": filepath,
		"description": config.get("description", ""),
		"category": category,
		"zoom": config.get("zoom", 1.0),
	}

	# Add terrain-specific metadata if applicable
	if config.has("target_terrain"):
		var terrain_names: Array = []
		for terrain_id in config.get("target_terrain", []):
			if terrain_id in TERRAIN_NAMES:
				terrain_names.append(TERRAIN_NAMES[terrain_id])
		capture_meta["target_terrain"] = terrain_names
		capture_meta["is_terrain_capture"] = true

	_captures_completed.append(capture_meta)


func _tile_terrain_id(tile: Variant) -> int:
	if typeof(tile) != TYPE_DICTIONARY:
		return -1
	var data = tile.get("terrain", {})
	if typeof(data) == TYPE_DICTIONARY:
		return int(data.get("raw", -1))
	if typeof(data) == TYPE_INT or typeof(data) == TYPE_FLOAT:
		return int(data)
	return -1


func _finish() -> void:
	print("\n")
	print("========================================")
	print("     CAPTURE COMPLETE                  ")
	print("========================================")
	print("  Captures: %d" % _captures_completed.size())
	print("  Output: %s" % _output_path)
	print("========================================")

	# Write manifest
	_write_manifest()

	# Exit
	await get_tree().create_timer(0.5).timeout
	get_tree().quit(0)


func _write_manifest() -> void:
	# Build terrain distribution summary
	var terrain_summary := {}
	for terrain_id in _terrain_positions.keys():
		var count: int = _terrain_positions[terrain_id].size()
		if count > 0:
			var name: String = TERRAIN_NAMES.get(terrain_id, "unknown")
			terrain_summary[name] = count

	# Categorize captures
	var basic_captures: Array = []
	var terrain_captures: Array = []
	for capture in _captures_completed:
		if capture.get("is_terrain_capture", false):
			terrain_captures.append(capture)
		else:
			basic_captures.append(capture)

	var manifest := {
		"schema_version": "visual_qa.manifest.v2",
		"timestamp": Time.get_datetime_string_from_system(),
		"mode": _capture_mode,
		"seed": _capture_seed,
		"tag": _capture_tag,
		"output_dir": _output_path,
		"total_captures": _captures_completed.size(),
		"basic_captures": basic_captures.size(),
		"terrain_captures": terrain_captures.size(),
		"terrain_distribution": terrain_summary,
		"map_width": _map_view.map_width if _map_view else 0,
		"map_height": _map_view.map_height if _map_view else 0,
		"wrap_horizontal": _map_view.wrap_horizontal if _map_view else false,
		"hex_size": _hex_size,
		"viewport_size": get_viewport().get_visible_rect().size,
		"window_size": DisplayServer.window_get_size(),
		"captures": _captures_completed,
	}

	var manifest_path := _output_path + "manifest.json"
	var file := FileAccess.open(manifest_path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(manifest, "\t"))
		file.close()
		print("[VisualQA] Manifest written: %s" % manifest_path)
	else:
		print("[ERROR] Failed to write manifest: %s" % manifest_path)
