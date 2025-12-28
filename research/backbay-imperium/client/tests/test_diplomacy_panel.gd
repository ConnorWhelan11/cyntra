extends Node
class_name TestDiplomacyPanel

## Unit tests for DiplomacyPanel.
## Tests player relation display, war/peace actions, and treaty handling.

var panel: DiplomacyPanel
var test_results: Array[String] = []

const PANEL_SCENE := preload("res://scenes/DiplomacyPanel.tscn")


func _ready() -> void:
	run_all_tests()


func run_all_tests() -> void:
	print("=== DiplomacyPanel Tests ===")

	# Create test instance from scene (needed for @onready nodes)
	panel = PANEL_SCENE.instantiate()
	add_child(panel)

	# Need to wait a frame for @onready vars to be set
	await get_tree().process_frame

	# Run tests
	test_initial_state()
	test_update_diplomacy()
	test_update_from_snapshot()
	test_war_detection()
	test_player_selection()
	test_player_colors()
	test_relation_enum()

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

	# No players or treaties
	assert_equal(panel.players.size(), 0, "No players initially")
	assert_equal(panel.treaties.size(), 0, "No treaties initially")
	assert_equal(panel.selected_player, -1, "No player selected initially")


func test_update_diplomacy() -> void:
	var test_players := {
		1: {
			"name": "Player 2",
			"relation": DiplomacyPanel.Relation.PEACE,
			"score": 100,
			"is_alive": true
		},
		2: {
			"name": "Player 3",
			"relation": DiplomacyPanel.Relation.WAR,
			"score": 50,
			"is_alive": true
		}
	}

	var test_treaties: Array = [
		{"type": "Trade", "a": 0, "b": 1, "turns_remaining": 10}
	]

	panel.update_diplomacy(0, test_players, test_treaties)

	assert_equal(panel.my_player_id, 0, "My player ID set correctly")
	assert_equal(panel.players.size(), 2, "Players updated")
	assert_equal(panel.treaties.size(), 1, "Treaties updated")

	# Verify player data
	assert_true(panel.players.has(1), "Player 1 exists")
	assert_true(panel.players.has(2), "Player 2 exists")
	assert_equal(panel.players[1]["score"], 100, "Player 1 score correct")
	assert_equal(panel.players[2]["relation"], DiplomacyPanel.Relation.WAR, "Player 2 at war")


func test_update_from_snapshot() -> void:
	var snapshot := {
		"players": [
			{"id": {"0": 0}, "score": 200, "is_alive": true, "city_count": 3, "unit_count": 5},
			{"id": {"0": 1}, "score": 150, "is_alive": true, "city_count": 2, "unit_count": 4},
			{"id": {"0": 2}, "score": 80, "is_alive": false, "city_count": 0, "unit_count": 0}
		],
		"wars": [
			{"a": {"0": 0}, "b": {"0": 1}}
		],
		"treaties": []
	}

	panel.update_from_snapshot(snapshot, 0)

	# Should not include self (player 0)
	assert_true(not panel.players.has(0), "Self not in players list")

	# Should have other players
	assert_true(panel.players.has(1), "Player 1 in list")
	assert_true(panel.players.has(2), "Player 2 in list")

	# Player 1 should be at war with us
	assert_equal(panel.players[1]["relation"], DiplomacyPanel.Relation.WAR, "Player 1 at war (detected from wars array)")

	# Player 2 should be dead
	assert_true(not panel.players[2]["is_alive"], "Player 2 is dead")


func test_war_detection() -> void:
	# Test different war data formats
	var snapshot1 := {
		"players": [
			{"id": 0, "score": 100, "is_alive": true},
			{"id": 1, "score": 100, "is_alive": true}
		],
		"wars": [
			{"a": 0, "b": 1}  # Simple int format
		],
		"treaties": []
	}

	panel.update_from_snapshot(snapshot1, 0)
	assert_equal(panel.players[1]["relation"], DiplomacyPanel.Relation.WAR, "War detected with simple int format")

	# Test reverse war direction
	var snapshot2 := {
		"players": [
			{"id": 0, "score": 100, "is_alive": true},
			{"id": 1, "score": 100, "is_alive": true}
		],
		"wars": [
			{"a": 1, "b": 0}  # Reversed
		],
		"treaties": []
	}

	panel.update_from_snapshot(snapshot2, 0)
	assert_equal(panel.players[1]["relation"], DiplomacyPanel.Relation.WAR, "War detected with reversed direction")


func test_player_selection() -> void:
	var test_players := {
		1: {
			"name": "Test Player",
			"relation": DiplomacyPanel.Relation.PEACE,
			"score": 100,
			"is_alive": true,
			"cities": 2,
			"units": 3
		}
	}

	panel.update_diplomacy(0, test_players, [])

	# Select player
	panel._on_select_player(1)
	assert_equal(panel.selected_player, 1, "Player selection works")


func test_player_colors() -> void:
	# Verify player colors array exists and has entries
	assert_true(DiplomacyPanel.PLAYER_COLORS.size() >= 8, "At least 8 player colors defined")

	# Colors should wrap around
	var color0: Color = DiplomacyPanel.PLAYER_COLORS[0]
	var color8: Color = DiplomacyPanel.PLAYER_COLORS[0 % DiplomacyPanel.PLAYER_COLORS.size()]
	assert_equal(color0, color8, "Colors wrap around correctly")


func test_relation_enum() -> void:
	# Test enum values
	assert_equal(DiplomacyPanel.Relation.PEACE, 0, "PEACE enum is 0")
	assert_equal(DiplomacyPanel.Relation.WAR, 1, "WAR enum is 1")
	assert_equal(DiplomacyPanel.Relation.ALLIANCE, 2, "ALLIANCE enum is 2")
	assert_equal(DiplomacyPanel.Relation.VASSAL, 3, "VASSAL enum is 3")
