extends PanelContainer
class_name ResearchPanel

## Research/Technology tree panel.
## Shows available techs and allows selection.

signal research_selected(tech_id: int)
signal panel_closed()

@onready var _title_label: Label = $VBox/TitleBar/Title
@onready var close_button: Button = $VBox/TitleBar/CloseButton
@onready var current_label: Label = $VBox/CurrentResearch
@onready var tech_grid: GridContainer = $VBox/ScrollContainer/TechGrid
@onready var tech_info_label: RichTextLabel = $VBox/TechInfo

## Tech entries are sourced from the engine rules (RulesCatalog) or from engine-provided options.
## Keys: tech_id (int) → {name,cost,era,prereqs,unlock_units,unlock_buildings}
var TECH_DATA: Dictionary = {}
var _unit_names: Dictionary = {}  # unit_type_id -> name
var _building_names: Dictionary = {}  # building_id -> name

# Era names
const ERA_NAMES := ["Ancient", "Classical", "Medieval", "Renaissance", "Industrial", "Modern"]

# State
var known_techs: Array[int] = []
var current_research: int = -1
var research_progress: int = 0
var research_required: int = 0
var hovered_tech: int = -1

var tech_buttons: Dictionary = {}  # tech_id -> Button


func _ready() -> void:
	close_button.pressed.connect(_on_close_pressed)
	_build_tech_grid()
	visible = false


func set_catalog(catalog: Variant) -> void:
	if typeof(catalog) == TYPE_DICTIONARY:
		set_rules_catalog(catalog)
		return
	if typeof(catalog) != TYPE_ARRAY:
		return

	# Accept Vec<UiTechOption> (engine-provided *available* techs) as a fallback.
	var tech_options: Array = catalog
	var next: Dictionary = {}
	for opt in tech_options:
		if typeof(opt) != TYPE_DICTIONARY:
			continue
		var o: Dictionary = opt

		var tech_id = _parse_runtime_id(o.get("id", -1))
		if tech_id < 0:
			continue

		var prereqs: Array = []
		var raw_prereqs = o.get("prerequisites", [])
		if typeof(raw_prereqs) == TYPE_ARRAY:
			for pr in raw_prereqs:
				var pr_id := _parse_runtime_id(pr)
				if pr_id >= 0:
					prereqs.append(pr_id)

		next[tech_id] = {
			"name": String(o.get("name", "Tech %d" % tech_id)),
			"cost": int(o.get("cost", 0)),
			"prereqs": prereqs,
			"era": int(o.get("era", 0)),
			"unlock_units": [],
			"unlock_buildings": [],
		}

	if next.is_empty():
		return

	TECH_DATA = next
	if is_inside_tree():
		_build_tech_grid()

func set_rules_catalog(rules_catalog: Dictionary) -> void:
	# RulesCatalog: {techs:[...], unit_types:[...], buildings:[...]}
	_unit_names.clear()
	var raw_units = rules_catalog.get("unit_types", [])
	if typeof(raw_units) == TYPE_ARRAY:
		for u in raw_units:
			if typeof(u) != TYPE_DICTIONARY:
				continue
			var ud: Dictionary = u
			var uid = int(ud.get("id", -1))
			if uid >= 0:
				_unit_names[uid] = String(ud.get("name", "Unit %d" % uid))

	_building_names.clear()
	var raw_buildings = rules_catalog.get("buildings", [])
	if typeof(raw_buildings) == TYPE_ARRAY:
		for b in raw_buildings:
			if typeof(b) != TYPE_DICTIONARY:
				continue
			var bd: Dictionary = b
			var bid = int(bd.get("id", -1))
			if bid >= 0:
				_building_names[bid] = String(bd.get("name", "Building %d" % bid))

	var next: Dictionary = {}
	var raw_techs = rules_catalog.get("techs", [])
	if typeof(raw_techs) != TYPE_ARRAY:
		return

	for t in raw_techs:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		var td: Dictionary = t
		var tech_id = int(td.get("id", -1))
		if tech_id < 0:
			continue

		var prereqs: Array = []
		var raw_prereqs = td.get("prerequisites", [])
		if typeof(raw_prereqs) == TYPE_ARRAY:
			for pr in raw_prereqs:
				var pr_id := int(pr)
				if pr_id >= 0:
					prereqs.append(pr_id)

		var unlock_units = td.get("unlock_units", [])
		if typeof(unlock_units) != TYPE_ARRAY:
			unlock_units = []

		var unlock_buildings = td.get("unlock_buildings", [])
		if typeof(unlock_buildings) != TYPE_ARRAY:
			unlock_buildings = []

		next[tech_id] = {
			"name": String(td.get("name", "Tech %d" % tech_id)),
			"cost": int(td.get("cost", 0)),
			"prereqs": prereqs,
			"era": int(td.get("era", 0)),
			"unlock_units": unlock_units,
			"unlock_buildings": unlock_buildings,
		}

	if next.is_empty():
		return

	TECH_DATA = next
	if is_inside_tree():
		_build_tech_grid()


func _parse_runtime_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
	return int(value)


func _tech_name(tech_id: int) -> String:
	var tech: Dictionary = TECH_DATA.get(tech_id, {})
	var name = tech.get("name", null)
	if typeof(name) == TYPE_STRING and not String(name).is_empty():
		return String(name)
	return "Tech %d" % tech_id

func tech_name(tech_id: int) -> String:
	return _tech_name(tech_id)


func _build_tech_grid() -> void:
	# Clear existing
	for child in tech_grid.get_children():
		child.queue_free()
	tech_buttons.clear()

	# Sort techs by era then id
	var sorted_techs: Array = TECH_DATA.keys()
	sorted_techs.sort_custom(func(a, b):
		var era_a = TECH_DATA[a].get("era", 0)
		var era_b = TECH_DATA[b].get("era", 0)
		if era_a != era_b:
			return era_a < era_b
		return a < b
	)

	# Create buttons for each tech
	for tech_id in sorted_techs:
		var tech: Dictionary = TECH_DATA[tech_id]
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(140, 50)
		btn.text = tech.get("name", "Tech %d" % tech_id)
		btn.tooltip_text = _format_tech_tooltip(tech_id)

		btn.add_theme_color_override("font_color", Color.WHITE)

		# Connect signals
		btn.pressed.connect(_on_tech_pressed.bind(tech_id))
		btn.mouse_entered.connect(_on_tech_hovered.bind(tech_id))
		btn.mouse_exited.connect(_on_tech_unhovered)

		tech_grid.add_child(btn)
		tech_buttons[tech_id] = btn

	_update_tech_buttons()


func _format_tech_tooltip(tech_id: int) -> String:
	var tech: Dictionary = TECH_DATA.get(tech_id, {})
	var lines: Array[String] = []
	lines.append(_tech_name(tech_id))
	lines.append("Cost: %d" % tech.get("cost", 0))

	var prereqs: Array = tech.get("prereqs", [])
	if not prereqs.is_empty():
		var prereq_names: Array[String] = []
		for pid in prereqs:
			prereq_names.append(_tech_name(int(pid)))
		lines.append("Requires: " + ", ".join(prereq_names))

	var unlocks: Array[String] = []
	var unlock_units = tech.get("unlock_units", [])
	if typeof(unlock_units) == TYPE_ARRAY:
		for uid in unlock_units:
			var unit_id := int(uid)
			unlocks.append(String(_unit_names.get(unit_id, "Unit %d" % unit_id)))

	var unlock_buildings = tech.get("unlock_buildings", [])
	if typeof(unlock_buildings) == TYPE_ARRAY:
		for bid in unlock_buildings:
			var building_id := int(bid)
			unlocks.append(String(_building_names.get(building_id, "Building %d" % building_id)))

	if not unlocks.is_empty():
		lines.append("Unlocks: " + ", ".join(unlocks))

	return "\n".join(lines)


func update_state(p_known_techs: Array, p_current: int, p_progress: int, p_required: int) -> void:
	known_techs.clear()
	for t in p_known_techs:
		known_techs.append(int(t))

	current_research = p_current
	research_progress = p_progress
	research_required = p_required

	_update_display()


func _update_display() -> void:
	# Update current research label
	if current_research >= 0:
		var percent := 0
		if research_required > 0:
			percent = int((research_progress * 100) / research_required)
		current_label.text = "Researching: %s (%d%%)" % [_tech_name(current_research), percent]
	else:
		current_label.text = "Researching: None"

	_update_tech_buttons()


func _update_tech_buttons() -> void:
	for raw_id in tech_buttons.keys():
		var tech_id: int = int(raw_id)
		var btn: Button = tech_buttons[raw_id]
		var is_known: bool = known_techs.has(tech_id)
		var can_research: bool = _can_research(tech_id)
		var is_current: bool = (tech_id == current_research)

		# Update button appearance
		if is_known:
			# Already researched
			btn.disabled = true
			btn.modulate = Color(0.5, 0.8, 0.5, 1.0)  # Green tint
			btn.text = _tech_name(tech_id) + " [Done]"
		elif is_current:
			# Currently researching
			btn.disabled = false
			btn.modulate = Color(0.8, 0.8, 1.0, 1.0)  # Blue tint
			var percent: int = 0
			if research_required > 0:
				percent = int((research_progress * 100) / research_required)
			btn.text = _tech_name(tech_id) + " [%d%%]" % percent
		elif can_research:
			# Available to research
			btn.disabled = false
			btn.modulate = Color(1.0, 1.0, 1.0, 1.0)
			btn.text = _tech_name(tech_id)
		else:
			# Prereqs not met
			btn.disabled = true
			btn.modulate = Color(0.5, 0.5, 0.5, 0.7)
			btn.text = _tech_name(tech_id)


func _can_research(tech_id: int) -> bool:
	if known_techs.has(tech_id):
		return false

	var tech: Dictionary = TECH_DATA.get(tech_id, {})
	var prereqs: Array = tech.get("prereqs", [])

	for prereq in prereqs:
		if not known_techs.has(int(prereq)):
			return false

	return true


func _on_tech_pressed(tech_id: int) -> void:
	if not _can_research(tech_id):
		AudioManager.play("ui_error")
		return

	AudioManager.play("ui_click")
	research_selected.emit(tech_id)


func _on_tech_hovered(tech_id: int) -> void:
	hovered_tech = tech_id
	_update_tech_info()


func _on_tech_unhovered() -> void:
	hovered_tech = -1
	_update_tech_info()


func _update_tech_info() -> void:
	if hovered_tech < 0:
		tech_info_label.text = ""
		return

	var tech: Dictionary = TECH_DATA.get(hovered_tech, {})
	var lines: Array[String] = []
	lines.append("[b]%s[/b]" % _tech_name(hovered_tech))
	lines.append("Era: %s" % ERA_NAMES[int(tech.get("era", 0)) % ERA_NAMES.size()])
	lines.append("Cost: %d science" % tech.get("cost", 0))

	var prereqs: Array = tech.get("prereqs", [])
	if not prereqs.is_empty():
		var prereq_names: Array[String] = []
		for pid in prereqs:
			var name := _tech_name(int(pid))
			if known_techs.has(int(pid)):
				prereq_names.append("[color=green]%s[/color]" % name)
			else:
				prereq_names.append("[color=red]%s[/color]" % name)
		lines.append("")
		lines.append("Requires: " + ", ".join(prereq_names))

	var unlocks: Array[String] = []
	var unlock_units = tech.get("unlock_units", [])
	if typeof(unlock_units) == TYPE_ARRAY:
		for uid in unlock_units:
			var unit_id := int(uid)
			unlocks.append(String(_unit_names.get(unit_id, "Unit %d" % unit_id)))

	var unlock_buildings = tech.get("unlock_buildings", [])
	if typeof(unlock_buildings) == TYPE_ARRAY:
		for bid in unlock_buildings:
			var building_id := int(bid)
			unlocks.append(String(_building_names.get(building_id, "Building %d" % building_id)))

	if not unlocks.is_empty():
		lines.append("")
		lines.append("Unlocks: " + ", ".join(unlocks))

	tech_info_label.text = "\n".join(lines)


func _on_close_pressed() -> void:
	AudioManager.play("ui_close")
	visible = false
	panel_closed.emit()


func open() -> void:
	AudioManager.play("ui_open")
	_update_display()
	visible = true
