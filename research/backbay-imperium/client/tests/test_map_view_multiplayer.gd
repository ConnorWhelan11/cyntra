extends Node
class_name TestMapViewMultiplayer

## Unit tests for MapViewMultiplayer.
## Tests unit animation, fog of war, and visibility calculations.

var map_view: MapViewMultiplayer
var test_results: Array[String] = []


func _ready() -> void:
	run_all_tests()


func run_all_tests() -> void:
	print("=== MapViewMultiplayer Tests ===")

	# Create test instance
	map_view = MapViewMultiplayer.new()
	add_child(map_view)

	# Run tests
	test_fog_of_war_initialization()
	test_visibility_calculation()
	test_visibility_toggle()
	test_unit_animation_tracking()
	test_explored_tiles_persistence()
	test_remembered_units()
	test_horizontal_wrap()
	test_city_sight_range()
	test_multiple_units_visibility()
	test_edge_positions()

	# Cleanup
	map_view.queue_free()

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


func test_fog_of_war_initialization() -> void:
	# Fog should be enabled by default
	assert_true(map_view.fog_enabled, "Fog of war enabled by default")

	# Explored and visible tiles should be empty initially
	assert_equal(map_view.explored_tiles.size(), 0, "No explored tiles initially")
	assert_equal(map_view.visible_tiles.size(), 0, "No visible tiles initially")


func test_visibility_calculation() -> void:
	# Setup test map
	map_view.map_width = 10
	map_view.map_height = 10
	map_view.wrap_horizontal = false
	map_view.my_player_id = 0

	# Create a test unit at position (5, 5)
	var test_unit := {
		"id": 1,
		"owner": {"0": 0},
		"pos": {"q": 5, "r": 5},
		"type_id": {"raw": 1}
	}
	map_view.units[1] = test_unit

	# Call fog of war update
	map_view._update_fog_of_war()

	# Unit position should be visible
	assert_true(map_view.visible_tiles.has(Vector2i(5, 5)), "Unit position is visible")

	# Adjacent tiles should also be visible (sight range = 2)
	assert_true(map_view.visible_tiles.has(Vector2i(5, 4)), "North tile visible")
	assert_true(map_view.visible_tiles.has(Vector2i(5, 6)), "South tile visible")
	assert_true(map_view.visible_tiles.has(Vector2i(4, 5)), "West tile visible")
	assert_true(map_view.visible_tiles.has(Vector2i(6, 5)), "East tile visible")

	# Tiles far away should not be visible
	assert_true(not map_view.visible_tiles.has(Vector2i(0, 0)), "Far corner not visible")

	# Cleanup
	map_view.units.clear()


func test_visibility_toggle() -> void:
	# Toggle fog off
	map_view.fog_enabled = false
	assert_true(not map_view.fog_enabled, "Fog can be disabled")

	# Toggle fog on
	map_view.fog_enabled = true
	assert_true(map_view.fog_enabled, "Fog can be re-enabled")


func test_unit_animation_tracking() -> void:
	# Initially no animations
	assert_equal(map_view._unit_anim_offsets.size(), 0, "No animation offsets initially")
	assert_equal(map_view._unit_tweens.size(), 0, "No tweens initially")
	assert_equal(map_view._unit_prev_positions.size(), 0, "No previous positions initially")


func test_explored_tiles_persistence() -> void:
	# Setup
	map_view.map_width = 10
	map_view.map_height = 10
	map_view.wrap_horizontal = false
	map_view.my_player_id = 0

	# Clear state
	map_view.explored_tiles.clear()
	map_view.visible_tiles.clear()

	# Add unit and update visibility
	var test_unit := {
		"id": 1,
		"owner": {"0": 0},
		"pos": {"q": 5, "r": 5},
		"type_id": {"raw": 1}
	}
	map_view.units[1] = test_unit
	map_view._update_fog_of_war()

	var explored_count: int = map_view.explored_tiles.size()
	assert_true(explored_count > 0, "Tiles get explored")

	# Move unit to new position
	test_unit["pos"] = {"q": 2, "r": 2}
	map_view.units[1] = test_unit
	map_view._update_fog_of_war()

	# Old explored tiles should still be explored
	assert_true(map_view.explored_tiles.has(Vector2i(5, 5)), "Original position remains explored")

	# New position should also be explored
	assert_true(map_view.explored_tiles.has(Vector2i(2, 2)), "New position is explored")

	# Total explored should be greater than before
	assert_true(map_view.explored_tiles.size() >= explored_count, "Explored tiles only grow")

	# Cleanup
	map_view.units.clear()


func test_remembered_units() -> void:
	# Setup
	map_view.map_width = 10
	map_view.map_height = 10
	map_view.wrap_horizontal = false
	map_view.my_player_id = 0

	# Clear state
	map_view.explored_tiles.clear()
	map_view.visible_tiles.clear()
	map_view.remembered_units.clear()

	# Add our unit to see enemy
	var my_unit := {
		"id": 1,
		"owner": {"0": 0},
		"pos": {"q": 5, "r": 5},
		"type_id": {"raw": 1}
	}
	map_view.units[1] = my_unit

	# Add enemy unit in visible range
	var enemy_unit := {
		"id": 2,
		"owner": {"0": 1},
		"pos": {"q": 6, "r": 5},
		"type_id": {"raw": 1}
	}
	map_view.units[2] = enemy_unit

	# Update visibility - enemy should be remembered
	map_view._update_fog_of_war()

	var enemy_pos := Vector2i(6, 5)
	assert_true(map_view.visible_tiles.has(enemy_pos), "Enemy position is visible")
	assert_true(map_view.remembered_units.has(enemy_pos), "Enemy is remembered")

	# Move our unit away
	my_unit["pos"] = {"q": 0, "r": 0}
	map_view.units[1] = my_unit
	map_view._update_fog_of_war()

	# Enemy position should no longer be visible but should still be remembered
	assert_true(not map_view.visible_tiles.has(enemy_pos), "Enemy position no longer visible")
	assert_true(map_view.remembered_units.has(enemy_pos), "Enemy still remembered after leaving sight")

	# Cleanup
	map_view.units.clear()


func test_horizontal_wrap() -> void:
	# Setup with wrapping enabled
	map_view.map_width = 10
	map_view.map_height = 10
	map_view.wrap_horizontal = true
	map_view.my_player_id = 0

	# Clear state
	map_view.explored_tiles.clear()
	map_view.visible_tiles.clear()

	# Place unit at left edge
	var test_unit := {
		"id": 1,
		"owner": {"0": 0},
		"pos": {"q": 0, "r": 5},
		"type_id": {"raw": 1}
	}
	map_view.units[1] = test_unit
	map_view._update_fog_of_war()

	# Unit position should be visible
	assert_true(map_view.visible_tiles.has(Vector2i(0, 5)), "Unit at edge is visible")

	# With wrap, should see tiles on both sides
	assert_true(map_view.visible_tiles.has(Vector2i(1, 5)), "Right neighbor visible")

	# Cleanup
	map_view.units.clear()


func test_city_sight_range() -> void:
	# Setup
	map_view.map_width = 10
	map_view.map_height = 10
	map_view.wrap_horizontal = false
	map_view.my_player_id = 0

	# Clear state
	map_view.explored_tiles.clear()
	map_view.visible_tiles.clear()

	# Add a city
	var test_city := {
		"id": 1,
		"owner": {"0": 0},
		"pos": {"q": 5, "r": 5},
		"name": "Test City"
	}
	map_view.cities[1] = test_city
	map_view._update_fog_of_war()

	# City position should be visible
	assert_true(map_view.visible_tiles.has(Vector2i(5, 5)), "City position is visible")

	# Cities have larger sight range (3 vs 2 for units)
	# Check if a tile at distance 3 is visible
	assert_true(map_view.visible_tiles.has(Vector2i(5, 2)), "City sees further than units")

	# Cleanup
	map_view.cities.clear()


func test_multiple_units_visibility() -> void:
	# Setup
	map_view.map_width = 20
	map_view.map_height = 20
	map_view.wrap_horizontal = false
	map_view.my_player_id = 0

	# Clear state
	map_view.explored_tiles.clear()
	map_view.visible_tiles.clear()

	# Add multiple units at different positions
	var unit1 := {
		"id": 1,
		"owner": {"0": 0},
		"pos": {"q": 3, "r": 3},
		"type_id": {"raw": 1}
	}
	var unit2 := {
		"id": 2,
		"owner": {"0": 0},
		"pos": {"q": 15, "r": 15},
		"type_id": {"raw": 1}
	}
	map_view.units[1] = unit1
	map_view.units[2] = unit2
	map_view._update_fog_of_war()

	# Both unit positions should be visible
	assert_true(map_view.visible_tiles.has(Vector2i(3, 3)), "First unit position visible")
	assert_true(map_view.visible_tiles.has(Vector2i(15, 15)), "Second unit position visible")

	# Their sight ranges should combine
	assert_true(map_view.visible_tiles.has(Vector2i(3, 4)), "First unit sight range works")
	assert_true(map_view.visible_tiles.has(Vector2i(15, 14)), "Second unit sight range works")

	# Cleanup
	map_view.units.clear()


func test_edge_positions() -> void:
	# Setup
	map_view.map_width = 10
	map_view.map_height = 10
	map_view.wrap_horizontal = false
	map_view.my_player_id = 0

	# Clear state
	map_view.explored_tiles.clear()
	map_view.visible_tiles.clear()

	# Place unit at corner (0, 0)
	var test_unit := {
		"id": 1,
		"owner": {"0": 0},
		"pos": {"q": 0, "r": 0},
		"type_id": {"raw": 1}
	}
	map_view.units[1] = test_unit
	map_view._update_fog_of_war()

	# Corner position should be visible
	assert_true(map_view.visible_tiles.has(Vector2i(0, 0)), "Corner position visible")

	# Should not crash when visibility extends past map edge
	assert_true(map_view.visible_tiles.has(Vector2i(1, 0)), "Adjacent tile visible")
	assert_true(map_view.visible_tiles.has(Vector2i(0, 1)), "Adjacent tile visible")

	# Negative coordinates should not be in visible (no wrap)
	assert_true(not map_view.visible_tiles.has(Vector2i(-1, 0)), "Negative coords not visible without wrap")

	# Cleanup
	map_view.units.clear()
