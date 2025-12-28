extends Node

## Main test runner that executes all unit tests.
## Run this scene to execute all tests in the tests directory.

const TEST_CLASSES: Array = [
	"res://tests/test_map_view_multiplayer.gd",
	"res://tests/test_diplomacy_panel.gd",
	"res://tests/test_city_production_panel.gd"
]

var total_pass := 0
var total_fail := 0


func _ready() -> void:
	print("\n")
	print("========================================")
	print("       BACKBAY IMPERIUM TEST SUITE     ")
	print("========================================")
	print("\n")

	for test_path in TEST_CLASSES:
		await run_test_script(test_path)

	print_final_summary()

	# Exit with appropriate code
	if total_fail > 0:
		get_tree().quit(1)
	else:
		get_tree().quit(0)


func run_test_script(script_path: String) -> void:
	var script = load(script_path)
	if script == null:
		print("[ERROR] Failed to load: " + script_path)
		total_fail += 1
		return

	var instance = script.new()
	add_child(instance)

	# Wait for tests to complete (they run in _ready)
	await get_tree().process_frame
	await get_tree().process_frame

	# Count results from instance if available
	if instance.has_method("get") and instance.get("test_results") != null:
		var results: Array = instance.test_results
		for result in results:
			if result.begins_with("[PASS]"):
				total_pass += 1
			elif result.begins_with("[FAIL]"):
				total_fail += 1

	instance.queue_free()
	await get_tree().process_frame


func print_final_summary() -> void:
	print("\n")
	print("========================================")
	print("           FINAL TEST SUMMARY          ")
	print("========================================")
	print("  PASSED: %d" % total_pass)
	print("  FAILED: %d" % total_fail)
	print("  TOTAL:  %d" % (total_pass + total_fail))
	print("========================================")

	if total_fail == 0:
		print("  ALL TESTS PASSED!")
	else:
		print("  SOME TESTS FAILED!")

	print("========================================\n")
