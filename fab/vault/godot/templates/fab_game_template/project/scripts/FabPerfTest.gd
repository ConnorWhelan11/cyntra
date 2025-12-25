extends Node

## FabPerfTest - Performance testing script for Fab pipeline validation.
##
## This script collects frame timing and memory metrics during a test run,
## then writes results to a JSON file for the performance gate to evaluate.
##
## Usage:
##   1. Attach this script to a node in your test scene
##   2. Run Godot with --headless flag
##   3. Script will auto-quit after duration and write results

@export var duration_seconds: float = 10.0
@export var output_path: String = "user://perf_results.json"
@export var auto_quit: bool = true

var _frame_times: Array[float] = []
var _start_time_ms: float = 0.0
var _startup_time_ms: float = 0.0
var _draw_calls: Array[int] = []


func _ready() -> void:
	# Parse command line args for custom duration/output
	_parse_args()

	# Record startup time (time from process start to _ready)
	_startup_time_ms = Time.get_ticks_msec()

	# Start timing from now
	_start_time_ms = Time.get_ticks_msec()

	print("FabPerfTest: Starting %0.1f second performance test" % duration_seconds)
	print("FabPerfTest: Output will be written to: %s" % output_path)


func _process(delta: float) -> void:
	# Record frame time in milliseconds
	_frame_times.append(delta * 1000.0)

	# Try to get draw call count (renderer stats)
	var vp := get_viewport()
	if vp:
		var render_info := vp.get_render_info(Viewport.RENDER_INFO_TYPE_VISIBLE, Viewport.RENDER_INFO_DRAW_CALLS_IN_FRAME)
		_draw_calls.append(render_info)

	# Check if test duration elapsed
	var elapsed := (Time.get_ticks_msec() - _start_time_ms) / 1000.0
	if elapsed >= duration_seconds:
		_finish_test()


func _parse_args() -> void:
	var args := OS.get_cmdline_args()

	for i in range(args.size()):
		var arg := args[i]

		if arg == "--duration" and i + 1 < args.size():
			var val := args[i + 1]
			if val.is_valid_float():
				duration_seconds = val.to_float()

		elif arg == "--output" and i + 1 < args.size():
			output_path = args[i + 1]

		elif arg == "--no-quit":
			auto_quit = false


func _finish_test() -> void:
	print("FabPerfTest: Test complete, analyzing results...")

	var results := _calculate_results()
	_write_results(results)
	_print_summary(results)

	if auto_quit:
		print("FabPerfTest: Exiting...")
		get_tree().quit(0)


func _calculate_results() -> Dictionary:
	var total_frames := _frame_times.size()

	if total_frames == 0:
		return {
			"success": false,
			"error": "No frames recorded",
		}

	# Calculate frame time statistics
	var sum := 0.0
	var min_time := _frame_times[0]
	var max_time := _frame_times[0]

	for t in _frame_times:
		sum += t
		if t < min_time:
			min_time = t
		if t > max_time:
			max_time = t

	var avg_frame_time := sum / total_frames
	var avg_fps := 1000.0 / avg_frame_time if avg_frame_time > 0 else 0.0

	# Calculate percentiles
	var sorted_times := _frame_times.duplicate()
	sorted_times.sort()
	var p99_index := int(total_frames * 0.99)
	var p95_index := int(total_frames * 0.95)
	var p99_frame_time := sorted_times[min(p99_index, total_frames - 1)]
	var p95_frame_time := sorted_times[min(p95_index, total_frames - 1)]

	# Calculate draw call average
	var avg_draw_calls := 0.0
	if _draw_calls.size() > 0:
		var draw_sum := 0
		for dc in _draw_calls:
			draw_sum += dc
		avg_draw_calls = float(draw_sum) / _draw_calls.size()

	# Memory stats
	var memory_peak_mb := OS.get_static_memory_peak_usage() / 1048576.0
	var memory_current_mb := OS.get_static_memory_usage() / 1048576.0

	return {
		"success": true,
		"test_version": "1.0",
		"timestamp": Time.get_datetime_string_from_system(),

		# Timing
		"duration_seconds": duration_seconds,
		"startup_time_ms": _startup_time_ms,

		# Frame metrics
		"frames_rendered": total_frames,
		"avg_fps": avg_fps,
		"min_fps": 1000.0 / max_time if max_time > 0 else 0.0,
		"max_fps": 1000.0 / min_time if min_time > 0 else 0.0,

		# Frame time metrics
		"avg_frame_time_ms": avg_frame_time,
		"min_frame_time_ms": min_time,
		"max_frame_time_ms": max_time,
		"p95_frame_time_ms": p95_frame_time,
		"p99_frame_time_ms": p99_frame_time,

		# Memory metrics
		"memory_peak_mb": memory_peak_mb,
		"memory_current_mb": memory_current_mb,

		# Render metrics
		"draw_calls_avg": avg_draw_calls,

		# Raw data (for detailed analysis)
		"frame_times_ms": _frame_times,
	}


func _write_results(results: Dictionary) -> void:
	# Determine output path
	var path := output_path
	if path.begins_with("user://"):
		path = OS.get_user_data_dir().path_join(path.replace("user://", ""))

	# Also check for absolute path from command line
	for arg in OS.get_cmdline_args():
		if arg.begins_with("--perf-output="):
			path = arg.replace("--perf-output=", "")

	# Write JSON
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		push_error("FabPerfTest: Failed to open output file: %s (error: %d)" % [path, FileAccess.get_open_error()])
		# Try fallback to working directory
		path = "perf_results.json"
		file = FileAccess.open(path, FileAccess.WRITE)
		if file == null:
			push_error("FabPerfTest: Fallback also failed")
			return

	var json_str := JSON.stringify(results, "\t")
	file.store_string(json_str)
	file.close()

	print("FabPerfTest: Results written to: %s" % path)


func _print_summary(results: Dictionary) -> void:
	print("")
	print("=== Performance Test Results ===")
	print("Duration: %0.1f seconds" % results.get("duration_seconds", 0))
	print("Frames: %d" % results.get("frames_rendered", 0))
	print("")
	print("FPS: %0.1f avg / %0.1f min / %0.1f max" % [
		results.get("avg_fps", 0),
		results.get("min_fps", 0),
		results.get("max_fps", 0),
	])
	print("Frame time: %0.2f ms avg / %0.2f ms max" % [
		results.get("avg_frame_time_ms", 0),
		results.get("max_frame_time_ms", 0),
	])
	print("Memory: %0.1f MB peak" % results.get("memory_peak_mb", 0))
	print("Draw calls: %0.0f avg" % results.get("draw_calls_avg", 0))
	print("================================")
	print("")

	# Print warnings
	var avg_fps: float = results.get("avg_fps", 0)
	var max_frame_time: float = results.get("max_frame_time_ms", 0)
	var memory_peak: float = results.get("memory_peak_mb", 0)

	if avg_fps < 30:
		push_warning("FabPerfTest: FPS below target (30)")
	if max_frame_time > 100:
		push_warning("FabPerfTest: Frame spike detected (>100ms)")
	if memory_peak > 512:
		push_warning("FabPerfTest: Memory exceeds budget (512MB)")
