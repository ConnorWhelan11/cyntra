# gdlint:ignore = class-definitions-order
## City production panel with queue management.
## Allows viewing, adding, reordering, and removing production items.
extends PanelContainer
class_name CityProductionPanel

signal production_queued(item_type: String, item_id: int)
signal production_removed(queue_index: int)
signal production_moved(from_index: int, to_index: int)
signal panel_closed()

var available_production: Array = []
var production_queue: Array = []
var city_id: int = -1
var city_name: String = ""
var city_population: int = 1
var production_per_turn: int = 0

@onready var title_label: Label = $VBox/TitleBar/Title
@onready var close_button: Button = $VBox/TitleBar/CloseButton
@onready var city_info: Label = $VBox/CityInfo
@onready var queue_list: ItemList = $VBox/QueueSection/QueueList
@onready var available_list: ItemList = $VBox/AvailableSection/AvailableList
@onready var remove_button: Button = $VBox/QueueSection/QueueButtons/RemoveButton
@onready var move_up_button: Button = $VBox/QueueSection/QueueButtons/MoveUpButton
@onready var move_down_button: Button = $VBox/QueueSection/QueueButtons/MoveDownButton


func _ready() -> void:
	close_button.pressed.connect(_on_close_pressed)
	remove_button.pressed.connect(_on_remove_pressed)
	move_up_button.pressed.connect(_on_move_up_pressed)
	move_down_button.pressed.connect(_on_move_down_pressed)
	queue_list.item_selected.connect(_on_queue_item_selected)
	available_list.item_activated.connect(_on_available_item_activated)
	visible = false


func open_for_city(city: Dictionary, available: Array) -> void:
	city_id = _extract_entity_id(city.get("id", 0))
	city_name = city.get("name", "City")
	city_population = int(city.get("population", 1))
	production_per_turn = int(city.get("production_per_turn", city.get("production", 0)))

	# Prefer explicit production queues when provided.
	production_queue.clear()
	var raw_queue = city.get("production_queue", null)
	if typeof(raw_queue) == TYPE_ARRAY:
		for entry in raw_queue:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var item: Dictionary = entry

			var name := String(item.get("name", "Unknown"))
			var cost := int(item.get("cost", 0))
			var progress := int(item.get("progress", 0))

			# ProductionItem fallback: {"Unit": <id>} or {"Building": <id>}
			if name == "Unknown" and cost == 0 and item.size() == 1:
				var match = _match_available_item(item, available)
				if typeof(match) == TYPE_DICTIONARY and not match.is_empty():
					name = String(match.get("name", name))
					cost = int(match.get("cost", cost))

			var queue_item: Dictionary = {
				"name": name,
				"cost": cost,
				"progress": progress,
			}
			if item.has("type"):
				queue_item["type"] = item.get("type")
			if item.has("id"):
				queue_item["id"] = item.get("id")
			production_queue.append(queue_item)
	else:
		# Server doesn't support production queues yet; show current production as a 1-item "queue".
		var producing = city.get("producing", null)
		if producing != null:
			var progress = int(city.get("production_stockpile", 0))

			# Prefer rules-driven name/cost from the available list (if present).
			var name := "Unknown"
			var cost := 0
			var match = _match_available_item(producing, available)
			if typeof(match) == TYPE_DICTIONARY and not match.is_empty():
				name = String(match.get("name", name))
				cost = int(match.get("cost", cost))

			production_queue.append({
				"name": name,
				"cost": cost,
				"progress": progress,
			})

	# Store available production
	available_production = available

	_update_display()
	visible = true
	AudioManager.play("ui_open")


func _update_display() -> void:
	title_label.text = city_name

	# City info
	if production_per_turn > 0:
		city_info.text = "Population: %d | Production: %d/turn" % [city_population, production_per_turn]
	else:
		city_info.text = "Population: %d | Production: ?/turn" % city_population

	# Update queue list
	queue_list.clear()
	remove_button.disabled = true
	move_up_button.disabled = true
	move_down_button.disabled = true

	var total_turns := 0
	for i in range(production_queue.size()):
		var item: Dictionary = production_queue[i]
		var name: String = item.get("name", "Unknown")
		var cost: int = item.get("cost", 0)
		var progress: int = item.get("progress", 0)

		var remaining := cost - progress
		var turns := -1
		if production_per_turn > 0:
			turns = ceili(float(remaining) / production_per_turn)
			total_turns += turns

		var label := "%d. %s" % [i + 1, name]
		if i == 0 and progress > 0:
			label += " (%d/%d)" % [progress, cost]
		else:
			if turns >= 0:
				label += " (%dt)" % turns
			else:
				label += " (?)"

		queue_list.add_item(label)
		queue_list.set_item_metadata(i, item)

		# Color first item differently
		if i == 0:
			queue_list.set_item_custom_fg_color(i, Color(0.3, 0.8, 1.0))

	# Update available list
	available_list.clear()
	for item in available_production:
		if typeof(item) != TYPE_DICTIONARY:
			continue
		var name: String = item.get("name", "Unknown")
		var cost: int = item.get("cost", 0)
		var turns := -1
		if production_per_turn > 0:
			turns = ceili(float(cost) / production_per_turn)
		if turns >= 0:
			available_list.add_item("%s (%dt)" % [name, turns])
		else:
			available_list.add_item("%s (?)" % name)
		available_list.set_item_metadata(available_list.item_count - 1, item)

	_update_button_states()


func _update_button_states() -> void:
	# Queue management is not wired server-side yet.
	remove_button.disabled = true
	move_up_button.disabled = true
	move_down_button.disabled = true


func _on_queue_item_selected(_index: int) -> void:
	_update_button_states()


func _on_available_item_activated(index: int) -> void:
	var meta = available_list.get_item_metadata(index)
	if typeof(meta) != TYPE_DICTIONARY:
		return

	var item_type: String = meta.get("type", "unit")
	var item_id: int = meta.get("id", 0)

	AudioManager.play("ui_click")
	production_queued.emit(item_type, item_id)

	# Add to local queue for immediate feedback
	var new_item: Dictionary = meta.duplicate()
	new_item["progress"] = 0
	production_queue.append(new_item)
	_update_display()


func _on_remove_pressed() -> void:
	return


func _on_move_up_pressed() -> void:
	return


func _on_move_down_pressed() -> void:
	return


func _on_close_pressed() -> void:
	AudioManager.play("ui_close")
	visible = false
	panel_closed.emit()


func _extract_entity_id(data) -> int:
	if typeof(data) == TYPE_DICTIONARY:
		return int(data.get("raw", 0))
	return int(data)


func _match_available_item(producing: Variant, available: Array) -> Dictionary:
	# producing is a ProductionItem: {"Unit": <id>} or {"Building": <id>}
	if typeof(producing) != TYPE_DICTIONARY:
		return {}
	var item: Dictionary = producing
	var keys: Array = item.keys()
	if keys.is_empty():
		return {}

	var kind := String(keys[0])
	var id = _parse_runtime_id(item.get(kind, -1))

	var desired_type := kind.to_lower()
	for a in available:
		if typeof(a) != TYPE_DICTIONARY:
			continue
		var d: Dictionary = a
		if String(d.get("type", "")) == desired_type and int(d.get("id", -1)) == id:
			return d
	return {}


func _parse_runtime_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
	return int(value)
