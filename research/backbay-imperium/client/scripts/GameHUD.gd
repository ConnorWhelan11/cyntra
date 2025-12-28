extends CanvasLayer
class_name GameHUD

## Game HUD with turn indicator, timer, end turn button, player info, and tooltips.

signal end_turn_pressed()
signal menu_pressed()
signal city_panel_close_requested()
signal production_selected(item_type: String, item_id: int)
signal found_city_requested()
signal research_button_pressed()
signal diplomacy_button_pressed()
signal share_replay_pressed()
signal minimap_clicked(hex: Vector2i)
signal promise_selected(promise: Dictionary)
signal timeline_turn_selected(turn: int)
signal context_attack_pressed(attacker_id: int, defender_id: int)
signal context_why_pressed(kind: String, attacker_id: int, defender_id: int)
signal worker_automation_toggled(unit_id: int, enabled: bool)
signal fortify_requested(unit_id: int)

# References
@onready var turn_label: Label = $TopBar/TurnLabel
@onready var player_label: Label = $TopBar/PlayerLabel
@onready var timer_label: Label = $TopBar/TimerLabel
@onready var gold_label: Label = $TopBar/GoldLabel
@onready var research_label: Label = $TopBar/ResearchLabel
@onready var research_button: Button = $TopBar/ResearchButton
@onready var diplomacy_button: Button = $TopBar/DiplomacyButton
@onready var share_button: Button = $TopBar/ShareButton

@onready var end_turn_button: Button = $BottomBar/EndTurnButton
@onready var menu_button: Button = $BottomBar/MenuButton
@onready var unit_panel: PanelContainer = $UnitPanel
@onready var unit_info_label: Label = $UnitPanel/VBox/UnitInfo
@onready var _unit_actions: HBoxContainer = $UnitPanel/VBox/Actions
@onready var found_city_button: Button = $UnitPanel/VBox/Actions/FoundCityButton
@onready var fortify_button: Button = $UnitPanel/VBox/Actions/FortifyButton
@onready var automation_button: Button = $UnitPanel/VBox/Actions/AutomationButton

@onready var city_panel: PanelContainer = $CityPanel
@onready var city_name_label: Label = $CityPanel/VBox/CityName
@onready var city_info_label: Label = $CityPanel/VBox/CityInfo
@onready var production_list: ItemList = $CityPanel/VBox/ProductionList
@onready var city_close_button: Button = $CityPanel/VBox/CloseButton

@onready var tooltip_label: Label = $TooltipPanel/TooltipLabel
@onready var tooltip_panel: PanelContainer = $TooltipPanel

@onready var context_panel: PanelContainer = $ContextPanel
@onready var context_body: Label = $ContextPanel/VBox/Body
@onready var context_why_button: Button = $ContextPanel/VBox/Header/WhyButton
@onready var context_attack_button: Button = $ContextPanel/VBox/Header/AttackButton

@onready var why_panel: PanelContainer = $WhyPanel
@onready var why_title: Label = $WhyPanel/VBox/Header/Title
@onready var why_body: RichTextLabel = $WhyPanel/VBox/Body
@onready var why_close_button: Button = $WhyPanel/VBox/Header/CloseButton

@onready var promise_list: ItemList = $PromisePanel/VBox/PromiseList
@onready var timeline_list: ItemList = $TimelinePanel/VBox/TimelineList

@onready var message_label: Label = $MessagePanel/MessageLabel
@onready var minimap: Minimap = $Minimap

# State
var current_turn := 0
var current_player := 0
var my_player_id := 0
var timer_remaining_ms := 0
var is_my_turn := false

var _end_turn_blocked := false
var _end_turn_block_reason := ""

var selected_unit: Dictionary = {}
var selected_city: Dictionary = {}

var messages: Array[String] = []
const MAX_MESSAGES := 5

var _rules_names: Dictionary = {}
var _rules_catalog: Dictionary = {}
var _unit_rules_by_id: Dictionary = {}     # unit_type_id -> RulesCatalogUnitType dict
var _building_rules_by_id: Dictionary = {} # building_id -> RulesCatalogBuilding dict
var _improvement_rules_by_id: Dictionary = {} # improvement_id -> RulesCatalogImprovement dict
var _promises: Array = []

var _timeline_entries: Array = [] # Display-ordered ChronicleEntry dicts.
var _timeline_interactive := false
var _timeline_city_names: Dictionary = {}   # city_id -> name
var _timeline_player_names: Dictionary = {} # player_id -> name

var _context_kind := ""
var _context_attacker_id := -1
var _context_defender_id := -1


func _ready() -> void:
	end_turn_button.pressed.connect(_on_end_turn_pressed)
	menu_button.pressed.connect(_on_menu_pressed)
	city_close_button.pressed.connect(_on_city_close_pressed)
	found_city_button.pressed.connect(_on_found_city_pressed)
	fortify_button.pressed.connect(_on_fortify_pressed)
	automation_button.pressed.connect(_on_automation_pressed)
	production_list.item_selected.connect(_on_production_selected)
	research_button.pressed.connect(_on_research_button_pressed)
	diplomacy_button.pressed.connect(_on_diplomacy_button_pressed)
	share_button.pressed.connect(_on_share_pressed)
	minimap.minimap_clicked.connect(_on_minimap_clicked)
	promise_list.item_selected.connect(_on_promise_selected)
	timeline_list.item_selected.connect(_on_timeline_item_selected)
	context_why_button.pressed.connect(_on_context_why_pressed)
	context_attack_button.pressed.connect(_on_context_attack_pressed)
	why_close_button.pressed.connect(_on_why_close_pressed)

	unit_panel.visible = false
	city_panel.visible = false
	tooltip_panel.visible = false
	context_panel.visible = false
	why_panel.visible = false

	_update_display()


func set_chronicle_entries(
	entries: Array,
	city_names: Dictionary,
	player_names: Dictionary,
	interactive: bool
) -> void:
	_timeline_entries.clear()
	_timeline_interactive = interactive
	_timeline_city_names = city_names
	_timeline_player_names = player_names

	timeline_list.clear()
	if typeof(entries) != TYPE_ARRAY:
		return

	# Newest first.
	for i in range(entries.size() - 1, -1, -1):
		var entry = entries[i]
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var ed: Dictionary = entry
		_timeline_entries.append(ed)
		timeline_list.add_item(_format_chronicle_entry(ed))

func set_rules_names(names: Dictionary) -> void:
	_rules_names = names

func set_rules_catalog(catalog: Dictionary) -> void:
	_rules_catalog = catalog
	_unit_rules_by_id.clear()
	_building_rules_by_id.clear()
	_improvement_rules_by_id.clear()

	var unit_types = _rules_catalog.get("unit_types", [])
	if typeof(unit_types) == TYPE_ARRAY:
		for u in unit_types:
			if typeof(u) != TYPE_DICTIONARY:
				continue
			var ud: Dictionary = u
			var id = int(ud.get("id", -1))
			if id >= 0:
				_unit_rules_by_id[id] = ud

	var buildings = _rules_catalog.get("buildings", [])
	if typeof(buildings) == TYPE_ARRAY:
		for b in buildings:
			if typeof(b) != TYPE_DICTIONARY:
				continue
			var bd: Dictionary = b
			var id = int(bd.get("id", -1))
			if id >= 0:
				_building_rules_by_id[id] = bd

	var improvements = _rules_catalog.get("improvements", [])
	if typeof(improvements) == TYPE_ARRAY:
		for i in improvements:
			if typeof(i) != TYPE_DICTIONARY:
				continue
			var id = int(i.get("id", -1))
			if id >= 0:
				_improvement_rules_by_id[id] = i

func set_promises(promises: Array) -> void:
	_promises = promises
	promise_list.clear()
	for p in _promises:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		promise_list.add_item(_format_promise_item(p))


func set_combat_context(attacker_id: int, defender_id: int, text: String) -> void:
	_context_kind = "Combat"
	_context_attacker_id = attacker_id
	_context_defender_id = defender_id
	context_body.text = text
	context_why_button.disabled = false
	context_attack_button.disabled = false
	context_attack_button.visible = true
	context_panel.visible = true


func set_city_context(city_id: int, text: String) -> void:
	_context_kind = "CityMaintenance"
	_context_attacker_id = city_id
	_context_defender_id = -1
	context_body.text = text
	context_why_button.disabled = false
	context_attack_button.visible = false
	context_panel.visible = true


func clear_context() -> void:
	_context_kind = ""
	_context_attacker_id = -1
	_context_defender_id = -1
	context_body.text = ""
	context_panel.visible = false


func show_why_panel(panel: Dictionary) -> void:
	why_title.text = String(panel.get("title", "Why"))
	var summary = String(panel.get("summary", ""))
	var lines = panel.get("lines", [])
	var body_lines: Array[String] = []
	if not summary.is_empty():
		body_lines.append("[i]%s[/i]" % summary)
		body_lines.append("")
	if typeof(lines) == TYPE_ARRAY:
		for raw in lines:
			if typeof(raw) != TYPE_DICTIONARY:
				continue
			var l: Dictionary = raw
			body_lines.append("[b]%s:[/b] %s" % [String(l.get("label", "")), String(l.get("value", ""))])
	why_body.text = "\n".join(body_lines)
	why_panel.visible = true


func hide_why_panel() -> void:
	why_panel.visible = false


func _process(delta: float) -> void:
	# Update timer countdown
	if timer_remaining_ms > 0:
		timer_remaining_ms -= int(delta * 1000)
		if timer_remaining_ms < 0:
			timer_remaining_ms = 0
		_update_timer_display()


func set_turn_info(turn: int, player: int, my_pid: int, time_ms: int) -> void:
	current_turn = turn
	current_player = player
	my_player_id = my_pid
	timer_remaining_ms = time_ms
	is_my_turn = (player == my_pid)
	_update_display()

func set_end_turn_blocked(blocked: bool, reason: String = "") -> void:
	_end_turn_blocked = blocked
	_end_turn_block_reason = reason
	_update_display()


func set_player_resources(gold: int, research_name: String, research_progress: int, research_total: int) -> void:
	gold_label.text = "Gold: %d" % gold
	if research_name.is_empty():
		research_label.text = "Research: None"
	else:
		research_label.text = "Research: %s (%d/%d)" % [research_name, research_progress, research_total]


func show_unit_panel(unit: Dictionary) -> void:
	selected_unit = unit
	city_panel.visible = false
	unit_panel.visible = true

	var type_id := 0
	var type_data = unit.get("type_id", {})
	if typeof(type_data) == TYPE_DICTIONARY:
		type_id = int(type_data.get("raw", 0))
	else:
		type_id = int(type_data)

	var unit_name := _unit_type_name(type_id)
	var hp: int = int(unit.get("hp", 100))
	var moves: int = int(unit.get("moves_left", 0))

	var attack := 0
	var defense := 0
	var moves_base: int = moves
	var supply_cost := 0

	var rules = _unit_rules_by_id.get(type_id, {})
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		attack = int(rules.get("attack", 0))
		defense = int(rules.get("defense", 0))
		moves_base = int(rules.get("moves", moves_base))
		supply_cost = int(rules.get("supply_cost", 0))

	unit_info_label.text = "%s\nHP: %d/100\nMoves: %d/%d\nATK/DEF: %d/%d  Supply: %d" % [
		unit_name,
		hp,
		moves,
		moves_base,
		attack,
		defense,
		supply_cost,
	]

	# Show/hide actions based on unit type
	var can_found_city := false
	var can_fortify := true
	var is_worker := false
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		can_found_city = bool(rules.get("can_found_city", false))
		can_fortify = bool(rules.get("can_fortify", can_fortify))
		is_worker = bool(rules.get("is_worker", false))

	found_city_button.visible = can_found_city
	fortify_button.visible = can_fortify
	automation_button.visible = is_worker
	if automation_button.visible:
		var enabled = bool(unit.get("automated", false))
		automation_button.text = "Auto: " + ("ON" if enabled else "OFF")
	else:
		automation_button.text = "Auto"


func hide_unit_panel() -> void:
	unit_panel.visible = false
	selected_unit = {}


func show_city_panel(city: Dictionary, available_production: Array) -> void:
	selected_city = city
	unit_panel.visible = false
	city_panel.visible = true

	city_name_label.text = city.get("name", "City")

	var pop = int(city.get("population", 1))

	var yields: Dictionary = city.get("yields", {})
	var food_y = int(yields.get("food", 0)) if typeof(yields) == TYPE_DICTIONARY else 0
	var prod_y = int(yields.get("production", 0)) if typeof(yields) == TYPE_DICTIONARY else 0
	var gold_y = int(yields.get("gold", 0)) if typeof(yields) == TYPE_DICTIONARY else 0
	var sci_y = int(yields.get("science", 0)) if typeof(yields) == TYPE_DICTIONARY else 0
	var cul_y = int(yields.get("culture", 0)) if typeof(yields) == TYPE_DICTIONARY else 0

	var food_stock = int(city.get("food_stockpile", 0))
	var food_needed = int(city.get("food_needed", 0))
	var food_surplus = int(city.get("food_surplus", 0))
	var turns_growth = city.get("turns_to_growth", null)
	var surplus_str := str(food_surplus)
	if food_surplus > 0:
		surplus_str = "+" + surplus_str

	var prod_stock = int(city.get("production_stockpile", 0))
	var prod_cost = null
	var prod_name: String = "None"
	var producing = city.get("producing", null)
	if typeof(producing) == TYPE_DICTIONARY:
		var item: Dictionary = producing
		var keys: Array = item.keys()
		if not keys.is_empty():
			var kind := String(keys[0])
			var item_id = _parse_runtime_id(item.get(kind, -1))
			match kind:
				"Unit":
					prod_name = _unit_type_name(item_id)
					var c := _unit_cost(item_id)
					if c >= 0:
						prod_cost = c
				"Building":
					prod_name = _building_name(item_id)
					var c := _building_cost(item_id)
					if c >= 0:
						prod_cost = c
				_:
					prod_name = kind

	var turns_complete = city.get("turns_to_complete", null)

	var growth_line := "Growth: stalled"
	if turns_growth != null:
		growth_line = "Growth: %d turns" % int(turns_growth)

	var prod_line := "Production: none"
	if producing != null:
		var cost_str := "?"
		if prod_cost != null:
			cost_str = str(int(prod_cost))
		prod_line = "Production: %d/%s (%s, %s)" % [
			prod_stock,
			cost_str,
			String(prod_name),
			("%d turns" % int(turns_complete)) if turns_complete != null else "stalled"
		]

	city_info_label.text = "Pop: %d\nYields: F%d P%d G%d S%d C%d\nFood: %d/%d (%s) | %s\n%s" % [
		pop,
		food_y,
		prod_y,
		gold_y,
		sci_y,
		cul_y,
		food_stock,
		food_needed,
		surplus_str,
		growth_line,
		prod_line,
	]

	# Populate production list
	production_list.clear()
	for item in available_production:
		if typeof(item) != TYPE_DICTIONARY:
			continue
		var name: String = item.get("name", "Unknown")
		var cost: int = item.get("cost", 0)
		var item_type: String = item.get("type", "unit")
		var item_id: int = item.get("id", 0)
		production_list.add_item("%s (%d)" % [name, cost])
		production_list.set_item_metadata(production_list.item_count - 1, {"type": item_type, "id": item_id})


func hide_city_panel() -> void:
	city_panel.visible = false
	selected_city = {}


func show_tooltip(text: String, pos: Vector2) -> void:
	tooltip_label.text = text
	tooltip_panel.position = pos + Vector2(15, 15)
	tooltip_panel.visible = true


func hide_tooltip() -> void:
	tooltip_panel.visible = false


func add_message(text: String) -> void:
	messages.append(text)
	while messages.size() > MAX_MESSAGES:
		messages.pop_front()
	_update_messages()


func clear_messages() -> void:
	messages.clear()
	_update_messages()


func _update_display() -> void:
	turn_label.text = "Turn %d" % current_turn

	if is_my_turn:
		player_label.text = "Your Turn"
		player_label.add_theme_color_override("font_color", Color.GREEN)
		end_turn_button.disabled = false
		if _end_turn_blocked:
			end_turn_button.text = _end_turn_block_reason if not _end_turn_block_reason.is_empty() else "Needs Attention"
			end_turn_button.add_theme_color_override("font_color", Color(1.0, 0.45, 0.45, 1.0))
		else:
			end_turn_button.text = "End Turn"
			end_turn_button.add_theme_color_override("font_color", Color(0.2, 1.0, 0.3, 1.0))
	else:
		player_label.text = "Player %d's Turn" % current_player
		player_label.add_theme_color_override("font_color", Color.YELLOW)
		end_turn_button.disabled = true
		end_turn_button.text = "End Turn"
		end_turn_button.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7, 1.0))

	_update_timer_display()


func _update_timer_display() -> void:
	if timer_remaining_ms <= 0:
		timer_label.text = ""
		return

	var seconds := timer_remaining_ms / 1000
	var minutes := seconds / 60
	seconds = seconds % 60

	timer_label.text = "%d:%02d" % [minutes, seconds]

	if timer_remaining_ms < 10000:
		timer_label.add_theme_color_override("font_color", Color.RED)
	elif timer_remaining_ms < 30000:
		timer_label.add_theme_color_override("font_color", Color.YELLOW)
	else:
		timer_label.remove_theme_color_override("font_color")


func _update_messages() -> void:
	message_label.text = "\n".join(messages)


func _unit_type_name(type_id: int) -> String:
	var names = _rules_names.get("unit_types", [])
	if typeof(names) == TYPE_ARRAY and type_id >= 0 and type_id < names.size():
		return String(names[type_id])

	return "Unit %d" % type_id

func _building_name(building_id: int) -> String:
	var names = _rules_names.get("buildings", [])
	if typeof(names) == TYPE_ARRAY and building_id >= 0 and building_id < names.size():
		return String(names[building_id])
	return "Building %d" % building_id

func _tech_name(tech_id: int) -> String:
	var names = _rules_names.get("techs", [])
	if typeof(names) == TYPE_ARRAY and tech_id >= 0 and tech_id < names.size():
		return String(names[tech_id])
	return "Tech %d" % tech_id

func _policy_name(policy_id: int) -> String:
	var names = _rules_names.get("policies", [])
	if typeof(names) == TYPE_ARRAY and policy_id >= 0 and policy_id < names.size():
		return String(names[policy_id])
	return "Policy %d" % policy_id

func _government_name(government_id: int) -> String:
	var names = _rules_names.get("governments", [])
	if typeof(names) == TYPE_ARRAY and government_id >= 0 and government_id < names.size():
		return String(names[government_id])
	return "Government %d" % government_id

func _improvement_name(improvement_id: int) -> String:
	var names = _rules_names.get("improvements", [])
	if typeof(names) == TYPE_ARRAY and improvement_id >= 0 and improvement_id < names.size():
		return String(names[improvement_id])
	return "Improvement %d" % improvement_id

func _city_name(city_id: int) -> String:
	if _timeline_city_names.has(city_id):
		return String(_timeline_city_names[city_id])
	return "City %s" % str(city_id)

func _player_name(pid: int) -> String:
	if pid == my_player_id:
		return "You"
	if _timeline_player_names.has(pid):
		return String(_timeline_player_names[pid])
	return "P%d" % pid

func _hex_str(hex_data: Variant) -> String:
	if typeof(hex_data) != TYPE_DICTIONARY:
		return ""
	var d: Dictionary = hex_data
	return "(%d,%d)" % [int(d.get("q", 0)), int(d.get("r", 0))]

func _format_chronicle_entry(entry: Dictionary) -> String:
	var turn := int(entry.get("turn", 0))
	var ev = entry.get("event", {})
	if typeof(ev) != TYPE_DICTIONARY:
		return "T%d: (unknown)" % turn
	var e: Dictionary = ev
	var t := String(e.get("type", ""))

	match t:
		"CityFounded":
			return "T%d: %s founded (%s)" % [turn, String(e.get("name", "City")), _player_name(_parse_player_id(e.get("owner", -1)))]
		"CityConquered":
			return "T%d: %s conquered (%s→%s)" % [
				turn,
				String(e.get("name", "City")),
				_player_name(_parse_player_id(e.get("old_owner", -1))),
				_player_name(_parse_player_id(e.get("new_owner", -1))),
			]
		"CityGrew":
			return "T%d: %s grew to %d" % [turn, String(e.get("name", "City")), int(e.get("new_pop", 0))]
		"BorderExpanded":
			var city_id := _extract_entity_id(e.get("city", -1))
			return "T%d: Borders expanded (%s)" % [turn, _city_name(city_id)]
		"WonderCompleted":
			var city_id := _extract_entity_id(e.get("city", -1))
			var building_id := _parse_runtime_id(e.get("building", -1))
			return "T%d: Wonder: %s (%s)" % [turn, _building_name(building_id), _city_name(city_id)]
		"UnitTrained":
			var city_id := _extract_entity_id(e.get("city", -1))
			var unit_type_id := _parse_runtime_id(e.get("unit_type", -1))
			return "T%d: Trained %s (%s)" % [turn, _unit_type_name(unit_type_id), _city_name(city_id)]
		"BuildingConstructed":
			var city_id := _extract_entity_id(e.get("city", -1))
			var building_id := _parse_runtime_id(e.get("building", -1))
			return "T%d: Built %s (%s)" % [turn, _building_name(building_id), _city_name(city_id)]
		"TechResearched":
			var tech_id := _parse_runtime_id(e.get("tech", -1))
			return "T%d: Tech: %s" % [turn, _tech_name(tech_id)]
		"PolicyAdopted":
			var policy_id := _parse_runtime_id(e.get("policy", -1))
			return "T%d: Policy: %s" % [turn, _policy_name(policy_id)]
		"GovernmentReformed":
			var gov_id := _parse_runtime_id(e.get("new", -1))
			return "T%d: Government: %s" % [turn, _government_name(gov_id)]
		"ImprovementBuilt":
			var impr_id := _parse_runtime_id(e.get("improvement", -1))
			var tier := int(e.get("tier", 1))
			return "T%d: %s built (T%d) @ %s" % [turn, _improvement_name(impr_id), tier, _hex_str(e.get("at", {}))]
		"ImprovementMatured":
			var impr_id := _parse_runtime_id(e.get("improvement", -1))
			var tier := int(e.get("new_tier", 1))
			return "T%d: %s matured (T%d) @ %s" % [turn, _improvement_name(impr_id), tier, _hex_str(e.get("at", {}))]
		"ImprovementPillaged":
			var impr_id := _parse_runtime_id(e.get("improvement", -1))
			var tier := int(e.get("new_tier", 1))
			return "T%d: %s pillaged (T%d) @ %s" % [turn, _improvement_name(impr_id), tier, _hex_str(e.get("at", {}))]
		"ImprovementRepaired":
			var impr_id := _parse_runtime_id(e.get("improvement", -1))
			var tier := int(e.get("tier", 1))
			return "T%d: %s repaired (T%d) @ %s" % [turn, _improvement_name(impr_id), tier, _hex_str(e.get("at", {}))]
		"TradeRouteEstablished":
			var from_city := _extract_entity_id(e.get("from", -1))
			var to_city := _extract_entity_id(e.get("to", -1))
			var external := bool(e.get("is_external", false))
			var suffix := " (external)" if external else ""
			return "T%d: Trade route %s → %s%s" % [turn, _city_name(from_city), _city_name(to_city), suffix]
		"TradeRoutePillaged":
			return "T%d: Trade route pillaged @ %s" % [turn, _hex_str(e.get("at", {}))]
		"WarDeclared":
			return "T%d: War declared (%s→%s)" % [turn, _player_name(_parse_player_id(e.get("aggressor", -1))), _player_name(_parse_player_id(e.get("target", -1)))]
		"PeaceDeclared":
			return "T%d: Peace (%s↔%s)" % [turn, _player_name(_parse_player_id(e.get("a", -1))), _player_name(_parse_player_id(e.get("b", -1)))]
		"BattleEnded":
			return "T%d: Battle @ %s (%s wins)" % [
				turn,
				_hex_str(e.get("at", {})),
				_player_name(_parse_player_id(e.get("winner", -1))),
			]
		"UnitPromoted":
			var unit_type_id := _parse_runtime_id(e.get("unit_type", -1))
			var level := int(e.get("new_level", 0))
			return "T%d: Promoted %s (L%d)" % [turn, _unit_type_name(unit_type_id), level]
		_:
			return "T%d: %s" % [turn, t]

func _production_item_name(item: Variant) -> String:
	if typeof(item) != TYPE_DICTIONARY:
		return "Production"
	var d: Dictionary = item
	var keys: Array = d.keys()
	if keys.is_empty():
		return "Production"
	var kind := String(keys[0])
	var item_id = int(d.get(kind, -1))
	match kind:
		"Unit":
			return _unit_type_name(item_id)
		"Building":
			return _building_name(item_id)
		_:
			return kind

func _parse_runtime_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("raw"):
			return int(d.get("raw", -1))
	return int(value)

func _parse_player_id(value: Variant) -> int:
	if typeof(value) == TYPE_DICTIONARY:
		var d: Dictionary = value
		if d.has("0"):
			return int(d.get("0", -1))
	return int(value)

func _unit_cost(type_id: int) -> int:
	var rules = _unit_rules_by_id.get(type_id, {})
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		return int(rules.get("cost", -1))
	return -1

func _building_cost(building_id: int) -> int:
	var rules = _building_rules_by_id.get(building_id, {})
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		return int(rules.get("cost", -1))
	return -1

func _format_promise_item(promise: Dictionary) -> String:
	var t = String(promise.get("type", ""))
	match t:
		"TechPickRequired":
			return "Choose research"
		"CityProductionPickRequired":
			var city_name = String(promise.get("city_name", "City"))
			return "%s: choose production" % city_name
		"ResearchComplete":
			return "Research: %s in %d" % [_tech_name(int(promise.get("tech", -1))), int(promise.get("turns", 0))]
		"CityProduction":
			var city_name = String(promise.get("city_name", "City"))
			return "%s: %s in %d" % [city_name, _production_item_name(promise.get("item", {})), int(promise.get("turns", 0))]
		"CityGrowth":
			var city_name = String(promise.get("city_name", "City"))
			return "%s grows in %d" % [city_name, int(promise.get("turns", 0))]
		"BorderExpansion":
			var city_name = String(promise.get("city_name", "City"))
			return "%s expands in %d" % [city_name, int(promise.get("turns", 0))]
		"PolicyPickAvailable":
			return "Policy pick available (%d)" % int(promise.get("picks", 0))
		"IdleWorker":
			return "Idle worker"
		_:
			if promise.has("turns"):
				return "%s in %d" % [t, int(promise.get("turns", 0))]
			return t


func _on_end_turn_pressed() -> void:
	AudioManager.play("ui_click")
	end_turn_pressed.emit()


func _on_menu_pressed() -> void:
	AudioManager.play("ui_click")
	menu_pressed.emit()


func _on_city_close_pressed() -> void:
	AudioManager.play("ui_close")
	hide_city_panel()
	city_panel_close_requested.emit()


func _on_found_city_pressed() -> void:
	AudioManager.play("ui_click")
	found_city_requested.emit()


func _on_fortify_pressed() -> void:
	var unit_id = _extract_entity_id(selected_unit.get("id", -1))
	if unit_id < 0:
		return
	AudioManager.play("ui_click")
	fortify_requested.emit(unit_id)


func _on_automation_pressed() -> void:
	var unit_id = _extract_entity_id(selected_unit.get("id", -1))
	if unit_id < 0:
		return
	var enabled = bool(selected_unit.get("automated", false))
	var next_enabled: bool = not enabled
	selected_unit["automated"] = next_enabled
	automation_button.text = "Auto: " + ("ON" if next_enabled else "OFF")
	worker_automation_toggled.emit(unit_id, next_enabled)


func _on_production_selected(index: int) -> void:
	var meta = production_list.get_item_metadata(index)
	if typeof(meta) != TYPE_DICTIONARY:
		return
	AudioManager.play("ui_click")
	production_selected.emit(meta.get("type", "unit"), meta.get("id", 0))

func _on_promise_selected(index: int) -> void:
	if index < 0 or index >= _promises.size():
		return
	var p = _promises[index]
	if typeof(p) != TYPE_DICTIONARY:
		return
	AudioManager.play("ui_click")
	promise_selected.emit(p)
	promise_list.deselect_all()

func _on_timeline_item_selected(index: int) -> void:
	if index < 0 or index >= _timeline_entries.size():
		return
	var entry = _timeline_entries[index]
	if typeof(entry) != TYPE_DICTIONARY:
		return
	var d: Dictionary = entry
	var turn := int(d.get("turn", 0))

	AudioManager.play("ui_click")
	if not _timeline_interactive:
		add_message("Timeline scrub requires replay (host-only until game over)")
		timeline_list.deselect_all()
		return

	timeline_turn_selected.emit(turn)
	timeline_list.deselect_all()

func _on_context_why_pressed() -> void:
	AudioManager.play("ui_click")
	context_why_pressed.emit(_context_kind, _context_attacker_id, _context_defender_id)


func _on_context_attack_pressed() -> void:
	AudioManager.play("ui_click")
	if _context_kind != "Combat":
		return
	context_attack_pressed.emit(_context_attacker_id, _context_defender_id)


func _on_why_close_pressed() -> void:
	AudioManager.play("ui_close")
	hide_why_panel()


func _on_research_button_pressed() -> void:
	AudioManager.play("ui_click")
	research_button_pressed.emit()


func _on_diplomacy_button_pressed() -> void:
	AudioManager.play("ui_click")
	diplomacy_button_pressed.emit()

func _on_share_pressed() -> void:
	AudioManager.play("ui_click")
	share_replay_pressed.emit()


func _on_minimap_clicked(hex: Vector2i) -> void:
	minimap_clicked.emit(hex)


func update_minimap(snapshot: Dictionary, player_id: int) -> void:
	minimap.set_my_player_id(player_id)
	minimap.update_from_snapshot(snapshot)


func update_minimap_viewport(bounds: Rect2) -> void:
	minimap.set_viewport_bounds(bounds)


func _extract_entity_id(data) -> int:
	if typeof(data) == TYPE_DICTIONARY:
		return int(data.get("raw", 0))
	return int(data)
