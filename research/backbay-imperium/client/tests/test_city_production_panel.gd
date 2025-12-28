extends Node
class_name TestCityProductionPanel

## Unit tests for CityProductionPanel.
## Tests production queue management, item display, and reordering.

var panel: CityProductionPanel
var test_results: Array[String] = []

const PANEL_SCENE := preload("res://scenes/CityProductionPanel.tscn")


func _ready() -> void:
	run_all_tests()


func run_all_tests() -> void:
	print("=== CityProductionPanel Tests ===")

	# Create test instance from scene (needed for @onready nodes)
	panel = PANEL_SCENE.instantiate()
	add_child(panel)

	# Need to wait a frame for @onready vars to be set
	await get_tree().process_frame

	# Run tests
	test_initial_state()
	test_open_for_city()
	test_production_queue_extraction()
	test_extract_entity_id()
	test_queue_management()
	test_turns_calculation()

	# Cleanup
	panel.queue_free()

	# Print summary
	print("\n=== Test Summary ===")
	for result in test_results:
		print(result)
	print("===================\n")


func assert_true(condition: bool, test_name: String) -> void:
	if condition:
		test_results.append("[PASS] " + test_name)
		print("[PASS] " + test_name)
	else:
		test_results.append("[FAIL] " + test_name)
		print("[FAIL] " + test_name)


func assert_equal(actual, expected, test_name: String) -> void:
	if actual == expected:
		test_results.append("[PASS] " + test_name)
		print("[PASS] " + test_name)
	else:
		test_results.append("[FAIL] %s: expected %s, got %s" % [test_name, str(expected), str(actual)])
		print("[FAIL] %s: expected %s, got %s" % [test_name, str(expected), str(actual)])


func test_initial_state() -> void:
	# Panel should be hidden initially
	assert_true(not panel.visible, "Panel hidden initially")

	# Empty queues
	assert_equal(panel.production_queue.size(), 0, "No production queue initially")
	assert_equal(panel.available_production.size(), 0, "No available production initially")
	assert_equal(panel.city_id, -1, "No city selected initially")


func test_open_for_city() -> void:
	var test_city := {
		"id": {"raw": 42},
		"name": "Test City",
		"population": 5,
		"production": 10,
		"production_queue": [
			{"name": "Warrior", "cost": 20, "progress": 5, "type": "unit", "id": 1},
			{"name": "Granary", "cost": 40, "progress": 0, "type": "building", "id": 2}
		]
	}

	var test_available: Array = [
		{"name": "Settler", "cost": 100, "type": "unit", "id": 3},
		{"name": "Library", "cost": 80, "type": "building", "id": 4}
	]

	panel.open_for_city(test_city, test_available)

	assert_equal(panel.city_id, 42, "City ID extracted correctly")
	assert_equal(panel.city_name, "Test City", "City name set")
	assert_equal(panel.city_population, 5, "Population set")
	assert_equal(panel.production_per_turn, 10, "Production rate set")
	assert_equal(panel.production_queue.size(), 2, "Queue loaded")
	assert_equal(panel.available_production.size(), 2, "Available items loaded")
	assert_true(panel.visible, "Panel opened")


func test_production_queue_extraction() -> void:
	# Test with array queue
	var city1 := {
		"id": 1,
		"name": "City",
		"production_queue": [
			{"name": "Item 1", "cost": 10},
			{"name": "Item 2", "cost": 20}
		]
	}

	panel.open_for_city(city1, [])
	assert_equal(panel.production_queue.size(), 2, "Queue extracted from array")

	# Test with empty queue
	var city2 := {
		"id": 2,
		"name": "City",
		"production_queue": []
	}

	panel.open_for_city(city2, [])
	assert_equal(panel.production_queue.size(), 0, "Empty queue handled")

	# Test with missing queue
	var city3 := {
		"id": 3,
		"name": "City"
	}

	panel.open_for_city(city3, [])
	assert_equal(panel.production_queue.size(), 0, "Missing queue handled")


func test_extract_entity_id() -> void:
	# Test dictionary format
	var dict_id := {"raw": 123}
	assert_equal(panel._extract_entity_id(dict_id), 123, "Dictionary ID extraction")

	# Test plain int
	assert_equal(panel._extract_entity_id(456), 456, "Plain int ID extraction")

	# Test string conversion
	assert_equal(panel._extract_entity_id("789"), 789, "String ID conversion")


func test_queue_management() -> void:
	# Setup city with queue
	var city := {
		"id": 1,
		"name": "Test",
		"production": 10,
		"production_queue": [
			{"name": "A", "cost": 10, "progress": 0},
			{"name": "B", "cost": 20, "progress": 0},
			{"name": "C", "cost": 30, "progress": 0}
		]
	}

	panel.open_for_city(city, [])
	assert_equal(panel.production_queue.size(), 3, "Initial queue size")

	# Test local queue modification (simulating remove)
	panel.production_queue.remove_at(1)  # Remove "B"
	assert_equal(panel.production_queue.size(), 2, "Queue after remove")
	assert_equal(panel.production_queue[0]["name"], "A", "First item unchanged")
	assert_equal(panel.production_queue[1]["name"], "C", "Last item moved up")

	# Test reorder (swap first two)
	var temp = panel.production_queue[0]
	panel.production_queue[0] = panel.production_queue[1]
	panel.production_queue[1] = temp
	assert_equal(panel.production_queue[0]["name"], "C", "Items swapped - C first")
	assert_equal(panel.production_queue[1]["name"], "A", "Items swapped - A second")


func test_turns_calculation() -> void:
	# Verify turn calculation logic
	# turns = ceil(remaining / production_per_turn)

	# Test: 10 production, 25 cost = 3 turns
	var production := 10
	var cost := 25
	var turns := ceili(float(cost) / production)
	assert_equal(turns, 3, "Turn calculation: 25/10 = 3 turns")

	# Test: 10 production, 20 cost = 2 turns
	turns = ceili(float(20) / 10)
	assert_equal(turns, 2, "Turn calculation: 20/10 = 2 turns")

	# Test: 10 production, 21 cost = 3 turns
	turns = ceili(float(21) / 10)
	assert_equal(turns, 3, "Turn calculation: 21/10 = 3 turns")

	# Test remaining with progress
	var remaining := cost - 5  # 25 - 5 = 20
	turns = ceili(float(remaining) / production)
	assert_equal(turns, 2, "Turn calculation with progress: (25-5)/10 = 2 turns")
