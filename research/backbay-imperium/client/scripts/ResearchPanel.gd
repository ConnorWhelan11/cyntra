extends PanelContainer
class_name ResearchPanel

const UiTheme = preload("res://scripts/UiTheme.gd")

## Research/Technology tree panel.
## Shows available techs and allows selection.

signal research_selected(tech_id: int)
signal panel_closed()

@onready var _title_label: Label = $VBox/TitleBar/Title
@onready var close_button: Button = $VBox/TitleBar/CloseButton
@onready var current_label: Label = $VBox/CurrentResearch
@onready var era_filter: OptionButton = $VBox/FilterBar/EraFilter
@onready var tier_filter: OptionButton = $VBox/FilterBar/TierFilter
@onready var available_only: CheckBox = $VBox/FilterBar/AvailableOnly
@onready var search_filter: LineEdit = $VBox/FilterBar/SearchFilter
@onready var clear_filters: Button = $VBox/FilterBar/ClearFilters
@onready var tech_tree: TechTreeView = $VBox/TechTreeView
@onready var tech_info_label: RichTextLabel = $VBox/TechInfo

## Tech entries are sourced from the engine rules (RulesCatalog) or from engine-provided options.
## Keys: tech_id (int) → {name,cost,era,prereqs,unlock_units,unlock_buildings}
var TECH_DATA: Dictionary = {}
var _unit_names: Dictionary = {}  # unit_type_id -> name
var _building_names: Dictionary = {}  # building_id -> name
var _revealed_resources_by_tech: Dictionary = {}  # tech_id -> Array[String] resource names

# Era names
const ERA_NAMES := ["Ancient", "Classical", "Medieval", "Renaissance", "Industrial", "Modern"]

# State
var known_techs: Array[int] = []
var current_research: int = -1
var research_progress: int = 0
var research_required: int = 0
var hovered_tech: int = -1
var _ui_fonts: Dictionary = {}
var _icon_loader: TextureLoader = TextureLoader.new()
var _tech_icon_textures: Dictionary = {}
var _revealed_resource_ids_by_tech: Dictionary = {}
var _icon_cache: Dictionary = {}
var _filter_era := -1
var _filter_tier := -1
var _filter_search := ""
var _filter_available_only := false

const DEFAULT_ICON_PATH := "res://assets/resources/resource_wheat.png"
const TECH_ICON_FALLBACKS := {
	"archery": "res://assets/units/archer.png",
	"mining": "res://assets/improvements/mine.png",
	"animal": "res://assets/improvements/pasture.png",
	"pottery": "res://assets/buildings/granary.png",
	"sailing": "res://assets/units/galley.png",
	"calendar": "res://assets/resources/resource_wheat.png",
	"masonry": "res://assets/buildings/walls.png",
	"wheel": "res://assets/buildings/workshop.png",
	"writing": "res://assets/buildings/library.png",
	"bronze": "res://assets/resources/resource_iron.png",
	"iron": "res://assets/resources/resource_iron.png",
	"horse": "res://assets/resources/resource_horses.png",
	"currency": "res://assets/resources/resource_gold.png",
	"construction": "res://assets/buildings/workshop.png",
	"philosophy": "res://assets/buildings/temple.png",
	"mathematics": "res://assets/buildings/university.png",
	"engineering": "res://assets/buildings/aqueduct.png",
	"optics": "res://assets/resources/resource_pearls.png",
}


func _ready() -> void:
	close_button.pressed.connect(_on_close_pressed)
	tech_tree.tech_selected.connect(_on_tech_pressed)
	tech_tree.tech_hovered.connect(_on_tech_hovered)
	tech_tree.tech_unhovered.connect(_on_tech_unhovered)
	era_filter.item_selected.connect(_on_era_filter_changed)
	tier_filter.item_selected.connect(_on_tier_filter_changed)
	available_only.toggled.connect(_on_available_only_toggled)
	search_filter.text_changed.connect(_on_search_filter_changed)
	clear_filters.pressed.connect(_on_clear_filters)
	_apply_holo_theme()
	visible = false
	if not TECH_DATA.is_empty():
		_build_tech_icons()
		tech_tree.set_tech_data(TECH_DATA, _tech_icon_textures)
		_refresh_filters()


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
		_build_tech_icons()
		tech_tree.set_tech_data(TECH_DATA, _tech_icon_textures)
		_refresh_filters()

func set_rules_catalog(rules_catalog: Dictionary) -> void:
	# RulesCatalog: {techs:[...], unit_types:[...], buildings:[...]}
	_unit_names.clear()
	_revealed_resources_by_tech.clear()
	_revealed_resource_ids_by_tech.clear()
	_icon_loader.apply_rules_catalog(rules_catalog)
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

	var raw_resources = rules_catalog.get("resources", [])
	if typeof(raw_resources) == TYPE_ARRAY:
		for r in raw_resources:
			if typeof(r) != TYPE_DICTIONARY:
				continue
			var rd: Dictionary = r
			var resource_id := _parse_runtime_id(rd.get("id", -1))
			var reveal = rd.get("revealed_by_tech", null)
			if reveal == null:
				continue
			var tech_id := _parse_runtime_id(reveal)
			if tech_id < 0:
				continue
			var resource_name := String(rd.get("name", "Resource"))
			if resource_name.is_empty():
				resource_name = "Resource"
			var list: Array = _revealed_resources_by_tech.get(tech_id, [])
			if typeof(list) != TYPE_ARRAY:
				list = []
			list.append(resource_name)
			_revealed_resources_by_tech[tech_id] = list

			if resource_id >= 0:
				var id_list: Array = _revealed_resource_ids_by_tech.get(tech_id, [])
				if typeof(id_list) != TYPE_ARRAY:
					id_list = []
				id_list.append(resource_id)
				_revealed_resource_ids_by_tech[tech_id] = id_list

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
		_build_tech_icons()
		tech_tree.set_tech_data(TECH_DATA, _tech_icon_textures)
		_refresh_filters()


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

	tech_tree.update_state(known_techs, current_research, research_progress, research_required)
	_update_tech_info()


func _refresh_filters() -> void:
	if tech_tree == null:
		return
	var options: Dictionary = tech_tree.get_filter_options()
	var eras: Array = options.get("eras", [])
	var tiers: Array = options.get("tiers", [])
	_populate_filter(era_filter, "All eras", eras, _filter_era, ERA_NAMES)
	_populate_filter(tier_filter, "All tiers", tiers, _filter_tier, [])
	_apply_filters()


func _populate_filter(
	button: OptionButton,
	all_label: String,
	values: Array,
	selected_value: int,
	labels: Array
) -> void:
	button.clear()
	button.add_item(all_label, -1)
	for raw in values:
		var val := int(raw)
		var label := ""
		if labels.is_empty():
			label = "Tier %d" % val
		else:
			label = labels[val % labels.size()]
		button.add_item(label, val)

	var selected_index := 0
	var count := button.get_item_count()
	for idx in range(count):
		if button.get_item_id(idx) == selected_value:
			selected_index = idx
			break
	button.select(selected_index)


func _apply_filters() -> void:
	tech_tree.set_filters(_filter_era, _filter_tier, _filter_search, _filter_available_only)


func _on_era_filter_changed(index: int) -> void:
	_filter_era = era_filter.get_item_id(index)
	_apply_filters()


func _on_tier_filter_changed(index: int) -> void:
	_filter_tier = tier_filter.get_item_id(index)
	_apply_filters()


func _on_available_only_toggled(pressed: bool) -> void:
	_filter_available_only = pressed
	_apply_filters()


func _on_search_filter_changed(text: String) -> void:
	_filter_search = text
	_apply_filters()


func _on_clear_filters() -> void:
	_filter_era = -1
	_filter_tier = -1
	_filter_search = ""
	_filter_available_only = false
	search_filter.text = ""
	available_only.button_pressed = false
	_refresh_filters()


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
		get_node_or_null("/root/AudioManager").play("ui_error") if get_node_or_null("/root/AudioManager") else null
		return

	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	research_selected.emit(tech_id)


func _on_tech_hovered(tech_id: int) -> void:
	hovered_tech = tech_id
	_update_tech_info()


func _on_tech_unhovered() -> void:
	hovered_tech = -1
	_update_tech_info()


func _get_dependents(tech_id: int) -> Array[int]:
	var dependents: Array[int] = []
	for raw_tid in TECH_DATA.keys():
		var tid: int = int(raw_tid)
		var tech: Dictionary = TECH_DATA[tid]
		var prereqs: Array = tech.get("prereqs", [])
		if prereqs.has(tech_id):
			dependents.append(tid)
	return dependents


func _update_tech_info() -> void:
	if hovered_tech < 0:
		tech_info_label.text = ""
		return

	var tech: Dictionary = TECH_DATA.get(hovered_tech, {})
	var lines: Array[String] = []
	lines.append("[b]%s[/b]" % _tech_name(hovered_tech))
	lines.append("Era: %s" % ERA_NAMES[int(tech.get("era", 0)) % ERA_NAMES.size()])
	lines.append("Cost: %d science" % tech.get("cost", 0))

	var reveals = _revealed_resources_by_tech.get(hovered_tech, [])
	if typeof(reveals) == TYPE_ARRAY and not reveals.is_empty():
		lines.append("Reveals: " + ", ".join(reveals))

	var prereqs: Array = tech.get("prereqs", [])
	if not prereqs.is_empty():
		var prereq_names: Array[String] = []
		for pid in prereqs:
			var pname: String = _tech_name(int(pid))
			if known_techs.has(int(pid)):
				prereq_names.append("[color=green]✓ %s[/color]" % pname)
			else:
				prereq_names.append("[color=orange]⊗ %s[/color]" % pname)
		lines.append("")
		lines.append("[color=gray]Requires:[/color] " + ", ".join(prereq_names))

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
		lines.append("[color=yellow]Unlocks:[/color] " + ", ".join(unlocks))

	# Show dependent techs (what this tech leads to)
	var dependents := _get_dependents(hovered_tech)
	if not dependents.is_empty():
		var dep_names: Array[String] = []
		for did in dependents:
			dep_names.append("[color=cyan]%s[/color]" % _tech_name(did))
		lines.append("")
		lines.append("[color=gray]Leads to:[/color] " + ", ".join(dep_names))

	tech_info_label.text = "\n".join(lines)


func _on_close_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_close") if get_node_or_null("/root/AudioManager") else null
	visible = false
	panel_closed.emit()


func open() -> void:
	get_node_or_null("/root/AudioManager").play("ui_open") if get_node_or_null("/root/AudioManager") else null
	_update_display()
	visible = true


func _apply_holo_theme() -> void:
	_ui_fonts = UiTheme.load_fonts()
	clip_contents = true
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.05, 0.1, 0.16, 0.78)
	panel_style.border_color = Color(0.2, 0.8, 0.95, 0.6)
	panel_style.set_border_width_all(1)
	panel_style.set_corner_radius_all(14)
	panel_style.shadow_color = Color(0.0, 0.0, 0.0, 0.45)
	panel_style.shadow_size = 12
	panel_style.content_margin_left = 16
	panel_style.content_margin_right = 16
	panel_style.content_margin_top = 12
	panel_style.content_margin_bottom = 12
	add_theme_stylebox_override("panel", panel_style)

	UiTheme.apply_label(_title_label, "title", _ui_fonts)
	_title_label.add_theme_font_size_override("font_size", 20)
	UiTheme.apply_label(current_label, "meta", _ui_fonts)
	current_label.add_theme_color_override("font_color", Color(0.4, 0.85, 1.0))

	tech_info_label.add_theme_font_override("normal_font", _ui_fonts.get("body", ThemeDB.fallback_font))
	tech_info_label.add_theme_font_size_override("normal_font_size", 13)
	tech_info_label.add_theme_color_override("default_color", Color(0.78, 0.86, 0.95))
	tech_info_label.add_theme_constant_override("line_separation", 2)

	UiTheme.apply_button(close_button, "ghost", _ui_fonts)


func _build_tech_icons() -> void:
	_tech_icon_textures.clear()
	_icon_cache.clear()
	if TECH_DATA.is_empty():
		return

	for raw_id in TECH_DATA.keys():
		var tech_id := int(raw_id)
		var tech: Dictionary = TECH_DATA.get(tech_id, {})
		var tex := _icon_from_unlocks(tech)
		if tex == null:
			tex = _icon_from_reveals(tech_id)
		if tex == null:
			tex = _icon_from_keyword(String(tech.get("name", "")))
		if tex != null:
			_tech_icon_textures[tech_id] = tex


func _icon_from_unlocks(tech: Dictionary) -> Texture2D:
	var unlock_units = tech.get("unlock_units", [])
	if typeof(unlock_units) == TYPE_ARRAY:
		for uid in unlock_units:
			var tex := _icon_loader.unit_texture(int(uid))
			if tex != null:
				return tex

	var unlock_buildings = tech.get("unlock_buildings", [])
	if typeof(unlock_buildings) == TYPE_ARRAY:
		for bid in unlock_buildings:
			var tex := _icon_loader.building_texture(int(bid))
			if tex != null:
				return tex

	return null


func _icon_from_reveals(tech_id: int) -> Texture2D:
	var revealed_ids = _revealed_resource_ids_by_tech.get(tech_id, [])
	if typeof(revealed_ids) == TYPE_ARRAY:
		for rid in revealed_ids:
			var tex := _icon_loader.resource_texture(int(rid))
			if tex != null:
				return tex
	return null


func _icon_from_keyword(name: String) -> Texture2D:
	var lower := name.to_lower()
	for key in TECH_ICON_FALLBACKS.keys():
		if lower.find(key) >= 0:
			return _load_icon_texture(String(TECH_ICON_FALLBACKS[key]))
	return _load_icon_texture(DEFAULT_ICON_PATH)


func _load_icon_texture(path: String) -> Texture2D:
	if _icon_cache.has(path):
		return _icon_cache[path]
	if not ResourceLoader.exists(path):
		return null
	var tex: Texture2D = load(path)
	if tex != null:
		_icon_cache[path] = tex
	return tex
