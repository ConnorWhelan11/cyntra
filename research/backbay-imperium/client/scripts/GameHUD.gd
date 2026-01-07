extends CanvasLayer
class_name GameHUD

## Game HUD with turn indicator, timer, end turn button, player info, and tooltips.

const UiTheme = preload("res://scripts/UiTheme.gd")

signal end_turn_pressed()
signal menu_pressed()
signal city_panel_close_requested()
signal production_selected(item_type: String, item_id: int)
signal cancel_production_requested()
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
signal promotion_selected(unit_id: int, promotion_id: int)
signal city_maintenance_why_requested(city_id: int)

# References
@onready var turn_label: Label = $TopBar/TurnLabel
@onready var player_label: Label = $TopBar/PlayerLabel
@onready var timer_label: Label = $TopBar/TimerLabel
@onready var gold_label: Label = $TopBar/GoldLabel
@onready var resources_label: Label = $TopBar/ResourcesLabel
@onready var research_label: Label = $TopBar/ResearchLabel
@onready var research_button: Button = $TopBar/ResearchButton
@onready var diplomacy_button: Button = $TopBar/DiplomacyButton
@onready var share_button: Button = $TopBar/ShareButton

@onready var end_turn_button: Button = $BottomBar/EndTurnButton
@onready var menu_button: Button = $BottomBar/MenuButton
@onready var top_bar: HBoxContainer = $TopBar
@onready var top_bar_bg: ColorRect = $TopBar/Background
@onready var bottom_bar: HBoxContainer = $BottomBar
@onready var bottom_bar_bg: ColorRect = $BottomBar/Background
@onready var right_rail: VBoxContainer = $RightRail
@onready var minimap_panel: PanelContainer = $RightRail/MinimapPanel
@onready var minimap_title: Label = $RightRail/MinimapPanel/VBox/Title
@onready var promise_panel: PanelContainer = $RightRail/PromisePanel
@onready var promise_title: Label = $RightRail/PromisePanel/VBox/Title
@onready var timeline_panel: PanelContainer = $RightRail/TimelinePanel
@onready var timeline_title: Label = $RightRail/TimelinePanel/VBox/Title
@onready var message_panel: PanelContainer = $RightRail/MessagePanel
@onready var unit_panel: PanelContainer = $UnitPanel
@onready var unit_title_label: Label = $UnitPanel/VBox/Title
@onready var unit_info_label: Label = $UnitPanel/VBox/UnitInfo
@onready var unit_status_label: Label = $UnitPanel/VBox/Status
@onready var _unit_actions: HBoxContainer = $UnitPanel/VBox/Actions
@onready var found_city_button: Button = $UnitPanel/VBox/Actions/FoundCityButton
@onready var fortify_button: Button = $UnitPanel/VBox/Actions/FortifyButton
@onready var automation_button: Button = $UnitPanel/VBox/Actions/AutomationButton
@onready var unit_details_button: Button = $UnitPanel/VBox/Actions/DetailsButton
@onready var promote_button: Button = $UnitPanel/VBox/Actions/PromoteButton

@onready var city_panel: PanelContainer = $CityPanel
@onready var city_name_label: Label = $CityPanel/VBox/CityName
@onready var city_info_label: Label = $CityPanel/VBox/CityInfo
@onready var city_why_button: Button = $CityPanel/VBox/CityActions/WhyUpkeepButton
@onready var growth_box: VBoxContainer = $CityPanel/VBox/GrowthBox
@onready var growth_label: Label = $CityPanel/VBox/GrowthBox/GrowthLabel
@onready var growth_bar: ProgressBar = $CityPanel/VBox/GrowthBox/GrowthBar
@onready var growth_detail_label: Label = $CityPanel/VBox/GrowthBox/GrowthDetail
@onready var production_progress_box: VBoxContainer = $CityPanel/VBox/ProductionProgressBox
@onready var production_progress_label: Label = $CityPanel/VBox/ProductionProgressBox/ProductionProgressLabel
@onready var production_bar: ProgressBar = $CityPanel/VBox/ProductionProgressBox/ProductionBar
@onready var production_detail_label: Label = $CityPanel/VBox/ProductionProgressBox/ProductionDetail
@onready var production_label: Label = $CityPanel/VBox/ProductionLabel
@onready var production_list: ItemList = $CityPanel/VBox/ProductionList
@onready var cancel_production_button: Button = $CityPanel/VBox/CancelProductionButton
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

@onready var rules_detail_panel: PanelContainer = $RulesDetailPanel
@onready var rules_detail_title: Label = $RulesDetailPanel/VBox/Header/Title
@onready var rules_detail_body: RichTextLabel = $RulesDetailPanel/VBox/Body
@onready var rules_detail_close_button: Button = $RulesDetailPanel/VBox/Header/CloseButton

@onready var promotion_panel: PanelContainer = $PromotionPanel
@onready var promotion_panel_info: Label = $PromotionPanel/VBox/Info
@onready var promotion_list: ItemList = $PromotionPanel/VBox/PromotionList
@onready var promotion_close_button: Button = $PromotionPanel/VBox/Header/CloseButton

@onready var promise_list: VBoxContainer = $RightRail/PromisePanel/VBox/PromiseScroll/PromiseList
@onready var timeline_list: ItemList = $RightRail/TimelinePanel/VBox/TimelineList

@onready var message_label: Label = $RightRail/MessagePanel/MessageLabel
@onready var minimap: Minimap = $RightRail/MinimapPanel/VBox/Minimap

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
var _terrain_rules_by_id: Dictionary = {}   # terrain_id -> RulesCatalogTerrain dict
var _resource_rules_by_id: Dictionary = {}  # resource_id -> RulesCatalogResource dict
var _unit_rules_by_id: Dictionary = {}     # unit_type_id -> RulesCatalogUnitType dict
var _building_rules_by_id: Dictionary = {} # building_id -> RulesCatalogBuilding dict
var _improvement_rules_by_id: Dictionary = {} # improvement_id -> RulesCatalogImprovement dict
var _promotion_rules_by_id: Dictionary = {} # promotion_id -> RulesCatalogPromotion dict
var _promises: Array = []
var _resource_inventory: Dictionary = {} # resource_id -> {available, total, used}
var _resource_inventory_received := false

var _timeline_entries: Array = [] # Display-ordered ChronicleEntry dicts.
var _timeline_interactive := false
var _timeline_city_names: Dictionary = {}   # city_id -> name
var _timeline_player_names: Dictionary = {} # player_id -> name

var _context_kind := ""
var _context_attacker_id := -1
var _context_defender_id := -1

@export var ui_v2_enabled := true
@export var debug_perf_hud := false

var _perf_label: Label = null
var _perf_timer := 0.0
var _ui_v2_cache: Dictionary = {}
var _ui_v2_props: Dictionary = {}
var _ui_v2_applied := false
var _ui_fonts: Dictionary = {}


func _ready() -> void:
	end_turn_button.pressed.connect(_on_end_turn_pressed)
	menu_button.pressed.connect(_on_menu_pressed)
	city_close_button.pressed.connect(_on_city_close_pressed)
	found_city_button.pressed.connect(_on_found_city_pressed)
	fortify_button.pressed.connect(_on_fortify_pressed)
	automation_button.pressed.connect(_on_automation_pressed)
	promote_button.pressed.connect(_on_promote_pressed)
	production_list.item_selected.connect(_on_production_selected)
	production_list.fixed_icon_size = Vector2i(24, 24)  # Small icons for production items
	cancel_production_button.pressed.connect(_on_cancel_production_pressed)
	research_button.pressed.connect(_on_research_button_pressed)
	diplomacy_button.pressed.connect(_on_diplomacy_button_pressed)
	share_button.pressed.connect(_on_share_pressed)
	minimap.minimap_clicked.connect(_on_minimap_clicked)
	timeline_list.item_selected.connect(_on_timeline_item_selected)
	context_why_button.pressed.connect(_on_context_why_pressed)
	context_attack_button.pressed.connect(_on_context_attack_pressed)
	why_close_button.pressed.connect(_on_why_close_pressed)
	unit_details_button.pressed.connect(_on_unit_details_pressed)
	rules_detail_close_button.pressed.connect(_on_rules_detail_close_pressed)
	promotion_close_button.pressed.connect(_on_promotion_close_pressed)
	promotion_list.item_selected.connect(_on_promotion_item_selected)
	city_why_button.pressed.connect(_on_city_why_pressed)

	unit_panel.visible = false
	city_panel.visible = false
	tooltip_panel.visible = false
	context_panel.visible = false
	why_panel.visible = false
	rules_detail_panel.visible = false
	promotion_panel.visible = false
	growth_box.visible = false
	production_progress_box.visible = false
	cancel_production_button.visible = false
	city_why_button.disabled = true

	why_body.bbcode_enabled = true
	rules_detail_body.bbcode_enabled = true

	_update_display()
	_apply_ui_variant()
	_setup_perf_hud()


func _process(delta: float) -> void:
	# Update timer countdown
	if timer_remaining_ms > 0:
		timer_remaining_ms -= int(delta * 1000)
		if timer_remaining_ms < 0:
			timer_remaining_ms = 0
		_update_timer_display()

	# Perf HUD update
	if not debug_perf_hud or _perf_label == null:
		return

	_perf_timer += delta
	if _perf_timer < 0.25:
		return
	_perf_timer = 0.0

	var fps := Engine.get_frames_per_second()
	var ms := 0.0
	if fps > 0.0:
		ms = 1000.0 / fps

	var shapes := RenderingServer.get_rendering_info(
		RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME
	)
	_perf_label.text = "Frame: %.1f ms | Shapes: %d" % [ms, int(shapes)]


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		var key := event as InputEventKey
		if key.keycode == KEY_F8:
			toggle_ui_v2_enabled()
			get_viewport().set_input_as_handled()
		elif key.keycode == KEY_ESCAPE:
			if promotion_panel.visible:
				get_node_or_null("/root/AudioManager").play("ui_close") if get_node_or_null("/root/AudioManager") else null
				_hide_promotion_panel()
				get_viewport().set_input_as_handled()
			elif rules_detail_panel.visible:
				get_node_or_null("/root/AudioManager").play("ui_close") if get_node_or_null("/root/AudioManager") else null
				hide_rules_detail_panel()
				get_viewport().set_input_as_handled()


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

func set_ui_v2_enabled(enabled: bool) -> void:
	ui_v2_enabled = enabled
	_apply_ui_variant()

func toggle_ui_v2_enabled() -> void:
	set_ui_v2_enabled(not ui_v2_enabled)

func _apply_ui_variant() -> void:
	if ui_v2_enabled and not _ui_v2_applied:
		_apply_ui_v2()
		_ui_v2_applied = true
	elif not ui_v2_enabled and _ui_v2_applied:
		_restore_ui_v2()
		_ui_v2_applied = false

func _apply_ui_v2() -> void:
	if _ui_fonts.is_empty():
		_ui_fonts = UiTheme.load_fonts()

	_cache_property(top_bar_bg, "color")
	_cache_property(bottom_bar_bg, "color")
	_cache_property(top_bar, "alignment")
	_cache_property(bottom_bar, "alignment")
	var top_color := UiTheme.COLORS["panel_strong"]
	top_color.a = 0.98
	top_bar_bg.color = top_color
	var bottom_color := UiTheme.COLORS["panel"].darkened(0.02)
	bottom_color.a = 0.98
	bottom_bar_bg.color = bottom_color
	top_bar.alignment = BoxContainer.ALIGNMENT_CENTER
	bottom_bar.alignment = BoxContainer.ALIGNMENT_CENTER

	_cache_theme_constant(top_bar, "separation")
	_cache_theme_constant(bottom_bar, "separation")
	_cache_theme_constant(right_rail, "separation")
	top_bar.add_theme_constant_override("separation", UiTheme.SPACING["xs"])
	bottom_bar.add_theme_constant_override("separation", UiTheme.SPACING["sm"])
	right_rail.add_theme_constant_override("separation", UiTheme.SPACING["sm"])

	_apply_label_v2(turn_label, "title")
	_apply_label_v2(player_label, "heading")
	_apply_label_v2(timer_label, "heading")
	_apply_label_v2(gold_label, "meta")
	_apply_label_v2(resources_label, "meta")
	_apply_label_v2(research_label, "meta")
	gold_label.add_theme_color_override("font_color", UiTheme.COLORS["warning"])
	research_label.add_theme_color_override("font_color", UiTheme.COLORS["accent"])

	_apply_button_v2(research_button, "secondary")
	_apply_button_v2(diplomacy_button, "secondary")
	_apply_button_v2(share_button, "secondary")
	_apply_button_v2(menu_button, "secondary")
	_apply_button_v2(end_turn_button, "primary")
	_cache_theme_font_size(end_turn_button, "font_size")
	_cache_property(end_turn_button, "custom_minimum_size")
	end_turn_button.add_theme_font_size_override("font_size", 15)
	end_turn_button.custom_minimum_size = Vector2(170, 46)
	_apply_end_turn_button_v2(end_turn_button)

	_apply_holo_panel_v2(unit_panel, "card")
	_apply_holo_panel_v2(city_panel, "card")
	_apply_holo_panel_v2(context_panel, "soft")
	_apply_holo_panel_v2(why_panel, "card")
	_apply_holo_panel_v2(rules_detail_panel, "card")
	_apply_holo_panel_v2(promotion_panel, "card")
	_apply_holo_panel_v2(minimap_panel, "soft")
	_apply_holo_panel_v2(promise_panel, "soft")
	_apply_holo_panel_v2(timeline_panel, "soft")
	_apply_holo_panel_v2(message_panel, "soft")
	_apply_panel_v2(tooltip_panel, "tooltip")

	_apply_label_v2(unit_title_label, "heading")
	_apply_label_v2(unit_info_label, "body")
	_apply_label_v2(unit_status_label, "meta")
	unit_status_label.add_theme_color_override("font_color", UiTheme.COLORS["danger"])
	_apply_label_v2(city_name_label, "heading")
	_apply_label_v2(city_info_label, "body")
	_apply_label_v2(growth_label, "heading")
	_apply_label_v2(growth_detail_label, "meta")
	_apply_label_v2(production_progress_label, "heading")
	_apply_label_v2(production_detail_label, "meta")
	_apply_label_v2(production_label, "heading")
	_apply_label_v2(promotion_panel_info, "meta")
	_apply_label_v2(context_body, "body")
	_apply_label_v2(tooltip_label, "body")
	_apply_label_v2(minimap_title, "heading")
	_apply_label_v2(promise_title, "heading")
	_apply_label_v2(timeline_title, "heading")
	_apply_label_v2(message_label, "meta")
	_cache_theme_constant(promise_list, "separation")
	promise_list.add_theme_constant_override("separation", UiTheme.SPACING["sm"])

	_apply_progress_bar_v2(growth_bar, UiTheme.COLORS["accent"])
	_apply_progress_bar_v2(production_bar, UiTheme.COLORS["accent"])
	_apply_item_list_v2(production_list)
	_apply_item_list_v2(timeline_list)
	_apply_item_list_v2(promotion_list)

	_apply_button_v2(found_city_button, "primary")
	_apply_button_v2(fortify_button, "secondary")
	_apply_button_v2(automation_button, "secondary")
	_apply_button_v2(unit_details_button, "secondary")
	_apply_button_v2(promote_button, "secondary")
	_apply_button_v2(city_why_button, "secondary")
	_apply_button_v2(cancel_production_button, "danger")
	_apply_button_v2(city_close_button, "secondary")
	_apply_button_v2(context_why_button, "secondary")
	_apply_button_v2(context_attack_button, "danger")
	_apply_button_v2(why_close_button, "secondary")
	_apply_button_v2(rules_detail_close_button, "secondary")
	_apply_button_v2(promotion_close_button, "secondary")

func _restore_ui_v2() -> void:
	for path in _ui_v2_cache.keys():
		var node = get_node_or_null(path)
		if node == null:
			continue
		var entry: Dictionary = _ui_v2_cache[path]
		for key in entry.keys():
			var payload: Dictionary = entry[key]
			if payload.is_empty():
				continue
			var parts = key.split(":", false, 1)
			if parts.size() != 2:
				continue
			var kind = parts[0]
			var name = parts[1]
			match kind:
				"color":
					if payload.get("has", false):
						node.add_theme_color_override(name, payload.get("value"))
					else:
						node.remove_theme_color_override(name)
				"font":
					if payload.get("has", false):
						node.add_theme_font_override(name, payload.get("value"))
					else:
						node.remove_theme_font_override(name)
				"font_size":
					if payload.get("has", false):
						node.add_theme_font_size_override(name, payload.get("value"))
					else:
						node.remove_theme_font_size_override(name)
				"stylebox":
					if payload.get("has", false):
						node.add_theme_stylebox_override(name, payload.get("value"))
					else:
						node.remove_theme_stylebox_override(name)
				"constant":
					if payload.get("has", false):
						node.add_theme_constant_override(name, payload.get("value"))
					else:
						node.remove_theme_constant_override(name)

	for path in _ui_v2_props.keys():
		var node = get_node_or_null(path)
		if node == null:
			continue
		var props: Dictionary = _ui_v2_props[path]
		for prop in props.keys():
			node.set(prop, props[prop])

	_ui_v2_cache.clear()
	_ui_v2_props.clear()

func _apply_label_v2(label: Label, kind: String) -> void:
	_cache_theme_font(label, "font")
	_cache_theme_font_size(label, "font_size")
	_cache_theme_color(label, "font_color")
	UiTheme.apply_label(label, kind, _ui_fonts)

func _apply_button_v2(button: Button, kind: String) -> void:
	_cache_theme_font(button, "font")
	_cache_theme_font_size(button, "font_size")
	_cache_theme_color(button, "font_color")
	_cache_theme_color(button, "font_color_hover")
	_cache_theme_color(button, "font_color_pressed")
	_cache_theme_color(button, "font_color_disabled")
	_cache_theme_stylebox(button, "normal")
	_cache_theme_stylebox(button, "hover")
	_cache_theme_stylebox(button, "pressed")
	_cache_theme_stylebox(button, "disabled")
	UiTheme.apply_button(button, kind, _ui_fonts)

func _apply_panel_v2(panel: PanelContainer, variant: String = "surface") -> void:
	_cache_theme_stylebox(panel, "panel")
	if variant == "tooltip":
		panel.add_theme_stylebox_override("panel", UiTheme.bb_tooltip())
	else:
		panel.add_theme_stylebox_override("panel", UiTheme.bb_panel(variant))

func _apply_holo_panel_v2(panel: PanelContainer, kind: String = "card") -> void:
	_cache_theme_stylebox(panel, "panel")
	panel.add_theme_stylebox_override("panel", _holo_panel_style(kind))

func _apply_item_list_v2(list: ItemList) -> void:
	_cache_theme_font(list, "font")
	_cache_theme_font_size(list, "font_size")
	_cache_theme_color(list, "font_color")
	_cache_theme_color(list, "font_color_selected")
	_cache_theme_color(list, "font_color_hovered")
	_cache_theme_stylebox(list, "panel")
	_cache_theme_stylebox(list, "item")
	_cache_theme_stylebox(list, "item_selected")
	_cache_theme_stylebox(list, "item_hovered")

	list.add_theme_font_override("font", _ui_fonts.get("body", ThemeDB.fallback_font))
	list.add_theme_font_size_override("font_size", 13)
	list.add_theme_color_override("font_color", UiTheme.COLORS["text"])
	list.add_theme_color_override("font_color_selected", UiTheme.COLORS["text"])
	list.add_theme_color_override("font_color_hovered", UiTheme.COLORS["text"])

	list.add_theme_stylebox_override("panel", _holo_list_panel_style())
	list.add_theme_stylebox_override("item", _holo_list_item_style(false, false))
	list.add_theme_stylebox_override("item_hovered", _holo_list_item_style(true, false))
	list.add_theme_stylebox_override("item_selected", _holo_list_item_style(true, true))

func _apply_progress_bar_v2(bar: ProgressBar, accent: Color) -> void:
	_cache_theme_stylebox(bar, "background")
	_cache_theme_stylebox(bar, "fill")
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.04, 0.08, 0.12, 0.75)
	bg.border_color = Color(0.18, 0.5, 0.7, 0.4)
	bg.set_border_width_all(1)
	bg.set_corner_radius_all(6)
	var fill := StyleBoxFlat.new()
	fill.bg_color = accent
	fill.set_corner_radius_all(6)
	bar.add_theme_stylebox_override("background", bg)
	bar.add_theme_stylebox_override("fill", fill)

func _apply_end_turn_button_v2(button: Button) -> void:
	_cache_theme_font(button, "font")
	_cache_theme_font_size(button, "font_size")
	_cache_theme_color(button, "font_color")
	_cache_theme_color(button, "font_color_hover")
	_cache_theme_color(button, "font_color_pressed")
	_cache_theme_color(button, "font_color_disabled")
	_cache_theme_stylebox(button, "normal")
	_cache_theme_stylebox(button, "hover")
	_cache_theme_stylebox(button, "pressed")
	_cache_theme_stylebox(button, "disabled")

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.08, 0.42, 0.34, 0.95)
	normal.border_color = Color(0.35, 0.95, 0.82, 0.95)
	normal.set_border_width_all(2)
	normal.set_corner_radius_all(14)
	normal.shadow_color = Color(0.0, 0.35, 0.25, 0.55)
	normal.shadow_size = 10
	normal.content_margin_left = 18
	normal.content_margin_right = 18
	normal.content_margin_top = 8
	normal.content_margin_bottom = 8

	var hover := normal.duplicate()
	hover.bg_color = normal.bg_color.lightened(0.08)
	hover.border_color = normal.border_color.lightened(0.1)

	var pressed := normal.duplicate()
	pressed.bg_color = normal.bg_color.darkened(0.12)
	pressed.border_color = normal.border_color.darkened(0.1)

	var disabled := normal.duplicate()
	disabled.bg_color = normal.bg_color.darkened(0.35)
	disabled.border_color = normal.border_color.darkened(0.35)

	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("disabled", disabled)
	button.add_theme_font_override("font", _ui_fonts.get("body_bold", ThemeDB.fallback_font))
	button.add_theme_color_override("font_color", Color(0.05, 0.12, 0.12))
	button.add_theme_color_override("font_color_hover", Color(0.05, 0.12, 0.12))
	button.add_theme_color_override("font_color_pressed", Color(0.05, 0.12, 0.12))
	button.add_theme_color_override("font_color_disabled", Color(0.2, 0.3, 0.3, 0.7))

func _holo_panel_style(kind: String) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	var bg := Color(0.05, 0.1, 0.16, 0.78)
	var border := Color(0.2, 0.8, 0.95, 0.6)
	var radius := 12
	var shadow := 8
	var pad_x := 12
	var pad_y := 10

	if kind == "soft":
		bg.a = 0.6
		border.a = 0.4
		radius = 10
		shadow = 6
		pad_x = 10
		pad_y = 8
	elif kind == "card":
		bg.a = 0.82
		border.a = 0.7
		radius = 12
		shadow = 10
		pad_x = 14
		pad_y = 12

	box.bg_color = bg
	box.border_color = border
	box.set_border_width_all(1)
	box.set_corner_radius_all(radius)
	box.shadow_color = Color(0.0, 0.0, 0.0, 0.45)
	box.shadow_size = shadow
	box.content_margin_left = pad_x
	box.content_margin_right = pad_x
	box.content_margin_top = pad_y
	box.content_margin_bottom = pad_y
	return box

func _holo_list_panel_style() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.04, 0.08, 0.12, 0.65)
	box.border_color = Color(0.18, 0.5, 0.7, 0.45)
	box.set_border_width_all(1)
	box.set_corner_radius_all(10)
	box.content_margin_left = 8
	box.content_margin_right = 8
	box.content_margin_top = 6
	box.content_margin_bottom = 6
	return box

func _holo_list_item_style(hovered: bool, selected: bool) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	if selected:
		box.bg_color = Color(0.12, 0.24, 0.34, 0.85)
		box.border_color = Color(0.3, 0.9, 0.98, 0.8)
	elif hovered:
		box.bg_color = Color(0.08, 0.16, 0.24, 0.7)
		box.border_color = Color(0.2, 0.7, 0.85, 0.55)
	else:
		box.bg_color = Color(0, 0, 0, 0)
		box.border_color = Color(0, 0, 0, 0)
	box.set_border_width_all(1 if hovered or selected else 0)
	box.set_corner_radius_all(8)
	box.content_margin_left = 6
	box.content_margin_right = 6
	box.content_margin_top = 4
	box.content_margin_bottom = 4
	return box

func _promise_row_style() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.05, 0.1, 0.16, 0.6)
	box.border_color = Color(0.2, 0.6, 0.8, 0.35)
	box.set_border_width_all(1)
	box.set_corner_radius_all(8)
	box.content_margin_left = 8
	box.content_margin_right = 8
	box.content_margin_top = 6
	box.content_margin_bottom = 6
	return box

func _cache_theme_color(node: Control, name: String) -> void:
	_cache_theme_entry(node, "color", name, node.has_theme_color_override(name), node.get_theme_color(name))

func _cache_theme_font(node: Control, name: String) -> void:
	_cache_theme_entry(node, "font", name, node.has_theme_font_override(name), node.get_theme_font(name))

func _cache_theme_font_size(node: Control, name: String) -> void:
	_cache_theme_entry(node, "font_size", name, node.has_theme_font_size_override(name), node.get_theme_font_size(name))

func _cache_theme_stylebox(node: Control, name: String) -> void:
	_cache_theme_entry(node, "stylebox", name, node.has_theme_stylebox_override(name), node.get_theme_stylebox(name))

func _cache_theme_constant(node: Control, name: String) -> void:
	_cache_theme_entry(node, "constant", name, node.has_theme_constant_override(name), node.get_theme_constant(name))

func _cache_theme_entry(node: Control, kind: String, name: String, has_override: bool, value: Variant) -> void:
	var path := node.get_path()
	var entry: Dictionary = _ui_v2_cache.get(path, {})
	var key := "%s:%s" % [kind, name]
	if entry.has(key):
		return
	entry[key] = {"has": has_override, "value": value}
	_ui_v2_cache[path] = entry

func _cache_property(node: Node, prop: String) -> void:
	var path := node.get_path()
	var props: Dictionary = _ui_v2_props.get(path, {})
	if props.has(prop):
		return
	props[prop] = node.get(prop)
	_ui_v2_props[path] = props

func _setup_perf_hud() -> void:
	if not debug_perf_hud:
		if _perf_label != null:
			_perf_label.queue_free()
			_perf_label = null
		set_process(false)
		return

	if _perf_label == null:
		_perf_label = Label.new()
		_perf_label.name = "PerfHud"
		_perf_label.position = Vector2(12, 12)
		_perf_label.z_index = 200
		_perf_label.add_theme_color_override("font_color", Color(0.8, 0.95, 0.9))
		_perf_label.add_theme_font_size_override("font_size", 12)
		add_child(_perf_label)

	set_process(true)

func set_rules_catalog(catalog: Dictionary) -> void:
	_rules_catalog = catalog
	_terrain_rules_by_id.clear()
	_resource_rules_by_id.clear()
	_unit_rules_by_id.clear()
	_building_rules_by_id.clear()
	_improvement_rules_by_id.clear()
	_promotion_rules_by_id.clear()

	var terrains = _rules_catalog.get("terrains", [])
	if typeof(terrains) == TYPE_ARRAY:
			for t in terrains:
				if typeof(t) != TYPE_DICTIONARY:
					continue
				var td: Dictionary = t
				var id = _parse_runtime_id(td.get("id", -1))
				if id >= 0:
					_terrain_rules_by_id[id] = td

	var resources = _rules_catalog.get("resources", [])
	if typeof(resources) == TYPE_ARRAY:
		for r in resources:
			if typeof(r) != TYPE_DICTIONARY:
				continue
			var rd: Dictionary = r
			var id = _parse_runtime_id(rd.get("id", -1))
			if id >= 0:
				_resource_rules_by_id[id] = rd

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

	var promotions = _rules_catalog.get("promotions", [])
	if typeof(promotions) == TYPE_ARRAY:
		for p in promotions:
			if typeof(p) != TYPE_DICTIONARY:
				continue
			var pd: Dictionary = p
			var id = _parse_runtime_id(pd.get("id", -1))
			if id >= 0:
				_promotion_rules_by_id[id] = pd

	if minimap != null and minimap.has_method("set_rules_catalog"):
		minimap.set_rules_catalog(catalog)
	_update_resource_inventory_label()

func set_promises(promises: Array) -> void:
	_promises = promises
	for child in promise_list.get_children():
		child.queue_free()

	if _promises.is_empty():
		var empty_label := Label.new()
		empty_label.text = "No actions right now"
		if _ui_fonts.is_empty():
			_ui_fonts = UiTheme.load_fonts()
		UiTheme.apply_label(empty_label, "meta", _ui_fonts)
		empty_label.add_theme_color_override("font_color", UiTheme.COLORS["muted"])
		promise_list.add_child(empty_label)
		return

	for p in _promises:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		_add_promise_row(p)


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


func show_unit_type_details(type_id: int) -> void:
	var rules = _unit_rules_by_id.get(type_id, {})
	var name := _unit_type_name(type_id)
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		name = String(rules.get("name", name))

	var lines: Array[String] = []
	lines.append("[b]Cost:[/b] %d" % int(rules.get("cost", _unit_cost(type_id))))
	lines.append("[b]Combat:[/b] ATK %d / DEF %d" % [int(rules.get("attack", 0)), int(rules.get("defense", 0))])
	lines.append("[b]Movement:[/b] %d" % int(rules.get("moves", 0)))
	lines.append("[b]HP:[/b] %d" % int(rules.get("hp", 0)))
	lines.append("[b]Firepower:[/b] %d" % int(rules.get("firepower", 0)))
	lines.append("[b]Supply:[/b] %d" % int(rules.get("supply_cost", 0)))

	var tech_req = rules.get("tech_required", null)
	if tech_req != null:
		var tech_id = _parse_runtime_id(tech_req)
		if tech_id >= 0:
			lines.append("[b]Requires:[/b] %s" % _tech_name(tech_id))

	var req_resources = rules.get("requires_resources", [])
	if typeof(req_resources) == TYPE_ARRAY and not req_resources.is_empty():
		var counts: Dictionary = {}
		for r in req_resources:
			var rid := _parse_runtime_id(r)
			if rid >= 0:
				counts[rid] = int(counts.get(rid, 0)) + 1
		var ids: Array = counts.keys()
		ids.sort()
		var names: Array[String] = []
		for rid in ids:
			var res_name := _resource_name(int(rid))
			var count := int(counts.get(rid, 0))
			if count > 1:
				names.append("%s x%d" % [res_name, count])
			else:
				names.append(res_name)
		if not names.is_empty():
			lines.append("[b]Requires resources:[/b] %s" % ", ".join(names))

	var consumes_resources = rules.get("consumes_resources", [])
	if typeof(consumes_resources) == TYPE_ARRAY and not consumes_resources.is_empty():
		var counts_c: Dictionary = {}
		for r in consumes_resources:
			var rid := _parse_runtime_id(r)
			if rid >= 0:
				counts_c[rid] = int(counts_c.get(rid, 0)) + 1
		var ids_c: Array = counts_c.keys()
		ids_c.sort()
		var names_c: Array[String] = []
		for rid in ids_c:
			var consume_name := _resource_name(int(rid))
			var count := int(counts_c.get(rid, 0))
			if count > 1:
				names_c.append("%s x%d" % [consume_name, count])
			else:
				names_c.append(consume_name)
		if not names_c.is_empty():
			lines.append("[b]Consumes resources:[/b] %s" % ", ".join(names_c))

	var caps: Array[String] = []
	if bool(rules.get("can_found_city", false)):
		caps.append("Found City")
	if bool(rules.get("is_worker", false)):
		caps.append("Worker")
	if bool(rules.get("can_fortify", false)):
		caps.append("Fortify")
	if not caps.is_empty():
		lines.append("[b]Capabilities:[/b] %s" % ", ".join(caps))

	_show_rules_detail_panel(name, "\n".join(lines))


func show_building_details(building_id: int) -> void:
	var rules = _building_rules_by_id.get(building_id, {})
	var name := _building_name(building_id)
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		name = String(rules.get("name", name))

	var lines: Array[String] = []
	lines.append("[b]Cost:[/b] %d" % int(rules.get("cost", _building_cost(building_id))))
	lines.append("[b]Maintenance:[/b] %d" % int(rules.get("maintenance", 0)))
	lines.append("[b]Admin:[/b] %d" % int(rules.get("admin", 0)))

	var tech_req = rules.get("tech_required", null)
	if tech_req != null:
		var tech_id = _parse_runtime_id(tech_req)
		if tech_id >= 0:
			lines.append("[b]Requires:[/b] %s" % _tech_name(tech_id))

	var req_resources = rules.get("requires_resources", [])
	if typeof(req_resources) == TYPE_ARRAY and not req_resources.is_empty():
		var counts: Dictionary = {}
		for r in req_resources:
			var rid := _parse_runtime_id(r)
			if rid >= 0:
				counts[rid] = int(counts.get(rid, 0)) + 1
		var ids: Array = counts.keys()
		ids.sort()
		var names: Array[String] = []
		for rid in ids:
			var res_name := _resource_name(int(rid))
			var count := int(counts.get(rid, 0))
			if count > 1:
				names.append("%s x%d" % [res_name, count])
			else:
				names.append(res_name)
		if not names.is_empty():
			lines.append("[b]Requires resources:[/b] %s" % ", ".join(names))

	_show_rules_detail_panel(name, "\n".join(lines))


func show_terrain_details(terrain_id: int) -> void:
	var rules = _terrain_rules_by_id.get(terrain_id, {})
	var name := _terrain_name(terrain_id)
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		name = String(rules.get("name", name))

	var lines: Array[String] = []
	var icon = rules.get("ui_icon", null)
	if typeof(icon) == TYPE_STRING:
		var s := String(icon).strip_edges()
		if not s.is_empty():
			lines.append("[b]Icon:[/b] %s" % s)
	var category = rules.get("ui_category", null)
	if typeof(category) == TYPE_STRING:
		var s := String(category).strip_edges()
		if not s.is_empty():
			lines.append("[b]Category:[/b] %s" % s)

	var yields = rules.get("yields", {})
	lines.append("[b]Yields:[/b] %s" % _format_yields(yields))

	lines.append("[b]Move cost:[/b] %d" % max(1, int(rules.get("move_cost", 1))))
	var defense := int(rules.get("defense_bonus", 0))
	if defense != 0:
		lines.append("[b]Defense:[/b] %s%d%%" % ["+" if defense > 0 else "", defense])
	else:
		lines.append("[b]Defense:[/b] 0%")

	if bool(rules.get("impassable", false)):
		lines.append("[b]Impassable[/b]")

	_show_rules_detail_panel(name, "\n".join(lines))


func show_improvement_details(improvement_id: int, instance: Dictionary = {}) -> void:
	var rules = _improvement_rules_by_id.get(improvement_id, {})
	var name := _improvement_name(improvement_id)
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		name = String(rules.get("name", name))

	var lines: Array[String] = []
	var icon = rules.get("ui_icon", null)
	if typeof(icon) == TYPE_STRING:
		var s := String(icon).strip_edges()
		if not s.is_empty():
			lines.append("[b]Icon:[/b] %s" % s)
	var category = rules.get("ui_category", null)
	if typeof(category) == TYPE_STRING:
		var s := String(category).strip_edges()
		if not s.is_empty():
			lines.append("[b]Category:[/b] %s" % s)
	lines.append("[b]Build time:[/b] %d" % int(rules.get("build_time", 0)))
	lines.append("[b]Repair time:[/b] %d" % int(rules.get("repair_time", 0)))

	var allowed = rules.get("allowed_terrain", [])
	if typeof(allowed) == TYPE_ARRAY and not allowed.is_empty():
		var names: Array[String] = []
		for t in allowed:
			var tid = _parse_runtime_id(t)
			if tid >= 0:
				names.append(_terrain_name(tid))
		if not names.is_empty():
			lines.append("[b]Allowed terrain:[/b] %s" % ", ".join(names))

	var tier = int(instance.get("tier", 0))
	if tier > 0:
		var pillaged := bool(instance.get("pillaged", false))
		lines.append("[b]On tile:[/b] Tier %d%s" % [tier, " (pillaged)" if pillaged else ""])

		var worked_turns := int(instance.get("worked_turns", 0))
		if worked_turns > 0:
			lines.append("[b]Worked turns:[/b] %d" % worked_turns)

	var tiers = rules.get("tiers", [])
	if typeof(tiers) == TYPE_ARRAY and not tiers.is_empty():
		lines.append("")
		lines.append("[b]Tiers:[/b]")
		for i in range(tiers.size()):
			var td = tiers[i]
			if typeof(td) != TYPE_DICTIONARY:
				continue
			var tdict: Dictionary = td
			var yields = tdict.get("yields", {})
			var yields_str := _format_yields(yields)
			var turns_next = tdict.get("worked_turns_to_next", null)
			var extra := ""
			if turns_next != null:
				extra = " (next: %dt)" % int(turns_next)
			lines.append("  Tier %d: %s%s" % [i + 1, yields_str, extra])

	_show_rules_detail_panel(name, "\n".join(lines))


func hide_rules_detail_panel() -> void:
	rules_detail_panel.visible = false

func _hide_promotion_panel() -> void:
	promotion_panel.visible = false
	promotion_panel_info.text = ""
	promotion_list.clear()


func _show_rules_detail_panel(title: String, body_bbcode: String) -> void:
	rules_detail_title.text = title
	rules_detail_body.text = body_bbcode
	rules_detail_panel.visible = true


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

func set_resource_inventory(counts: Array) -> void:
	_resource_inventory_received = true
	_resource_inventory.clear()
	if typeof(counts) == TYPE_ARRAY:
		for entry in counts:
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			var d: Dictionary = entry
			var id := _parse_runtime_id(d.get("id", -1))
			if id < 0:
				continue
			var available := int(d.get("count", 0))
			var total := int(d.get("total", available))
			var used := int(d.get("used", max(0, total - available)))
			if total < 0:
				total = 0
			if available < 0:
				available = 0
			if used < 0:
				used = 0
			_resource_inventory[id] = {
				"available": available,
				"total": total,
				"used": used,
			}

	_update_resource_inventory_label()

func _update_resource_inventory_label() -> void:
	if resources_label == null:
		return
	if not _resource_inventory_received:
		resources_label.text = ""
		return

	var parts: Array[String] = []
	var resources = _rules_catalog.get("resources", [])
	if typeof(resources) == TYPE_ARRAY:
		for r in resources:
			if typeof(r) != TYPE_DICTIONARY:
				continue
			var rd: Dictionary = r
			if String(rd.get("ui_category", "")) != "strategic":
				continue
			var id := _parse_runtime_id(rd.get("id", -1))
			if id < 0:
				continue
			var entry: Dictionary = _resource_inventory.get(id, {})
			var available := int(entry.get("available", 0))
			var total := int(entry.get("total", available))
			var used := int(entry.get("used", max(0, total - available)))
			var label := "%s %d" % [_resource_name(id), available]
			if total > 0:
				label = "%s %d/%d" % [_resource_name(id), available, total]
				if used > total:
					label += " (-%d)" % (used - total)
			elif used > 0:
				label = "%s 0/0 (-%d)" % [_resource_name(id), used]
			parts.append(label)

	resources_label.text = "" if parts.is_empty() else "Res: " + " | ".join(parts)


func show_unit_panel(unit: Dictionary) -> void:
	selected_unit = unit
	_hide_promotion_panel()
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
	var promotion_picks: int = int(unit.get("promotion_picks", 0))

	var promo_names: Array[String] = []
	var promos = unit.get("promotions", [])
	if typeof(promos) == TYPE_ARRAY:
		for p in promos:
			var pid := _parse_runtime_id(p)
			if pid >= 0:
				promo_names.append(_promotion_name(pid))
	var promos_str := "—" if promo_names.is_empty() else ", ".join(promo_names)
	var promo_suffix := ""
	if promotion_picks > 0:
		promo_suffix = " (pick %d)" % promotion_picks

	var attack := 0
	var defense := 0
	var moves_base: int = moves
	var supply_cost := 0
	var unsupplied := bool(unit.get("unsupplied", false))

	var rules = _unit_rules_by_id.get(type_id, {})
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		attack = int(rules.get("attack", 0))
		defense = int(rules.get("defense", 0))
		moves_base = int(rules.get("moves", moves_base))
		supply_cost = int(rules.get("supply_cost", 0))

	unit_status_label.visible = unsupplied
	unit_status_label.text = "UNSUPPLIED (-50% combat)" if unsupplied else ""

	unit_info_label.text = "%s\nHP: %d/100\nMoves: %d/%d\nATK/DEF: %d/%d  Supply: %d\nPromotions: %s%s" % [
		unit_name,
		hp,
		moves,
		moves_base,
		attack,
		defense,
		supply_cost,
		promos_str,
		promo_suffix,
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
	promote_button.visible = promotion_picks > 0
	if automation_button.visible:
		var enabled = bool(unit.get("automated", false))
		automation_button.text = "Auto: " + ("ON" if enabled else "OFF")
	else:
		automation_button.text = "Auto"


func hide_unit_panel() -> void:
	unit_panel.visible = false
	unit_status_label.visible = false
	selected_unit = {}
	_hide_promotion_panel()


func show_city_panel(city: Dictionary, available_production: Array) -> void:
	selected_city = city
	unit_panel.visible = false
	_hide_promotion_panel()
	city_panel.visible = true
	city_why_button.visible = true
	var city_owner := _parse_player_id(city.get("owner", -1))
	city_why_button.disabled = city_owner != my_player_id

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
	var producing_kind: String = ""
	var producing_id: int = -1
	var producing = city.get("producing", null)
	if typeof(producing) == TYPE_DICTIONARY:
		var item: Dictionary = producing
		var keys: Array = item.keys()
		if not keys.is_empty():
			var kind := String(keys[0])
			var item_id = _parse_runtime_id(item.get(kind, -1))
			producing_kind = kind
			producing_id = int(item_id)
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

	# Growth progress (explicit bar so UI can't lie).
	growth_box.visible = true
	var growth_max: float = float(max(food_needed, 1))
	growth_bar.max_value = growth_max
	growth_bar.value = clampf(float(food_stock), 0.0, growth_max)
	if turns_growth == null:
		growth_detail_label.text = "Food %d/%d (%s) • stalled" % [food_stock, food_needed, surplus_str]
	else:
		growth_detail_label.text = "Food %d/%d (%s) • %d turns" % [food_stock, food_needed, surplus_str, int(turns_growth)]

	# Production progress + cancel.
	var has_prod := producing != null and prod_cost != null and int(prod_cost) > 0
	production_progress_box.visible = has_prod
	cancel_production_button.visible = producing != null
	if has_prod:
		var cost_int := int(prod_cost)
		var prod_max: float = float(max(cost_int, 1))
		production_bar.max_value = prod_max
		production_bar.value = clampf(float(prod_stock), 0.0, prod_max)
		var turns_str := "stalled"
		if turns_complete != null:
			turns_str = "%d turns" % int(turns_complete)
		production_detail_label.text = "%s %d/%d • %s" % [prod_name, prod_stock, cost_int, turns_str]
	else:
		production_detail_label.text = ""

	# Populate production list
	production_list.clear()
	var unit_items: Array = []
	var building_items: Array = []
	for raw in available_production:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var d: Dictionary = raw
		var item_type: String = String(d.get("type", "")).to_lower()
		match item_type:
			"unit":
				unit_items.append(d)
			"building":
				building_items.append(d)
			_:
				pass

	_add_production_section("Units", unit_items, producing_kind, producing_id)
	_add_production_section("Buildings", building_items, producing_kind, producing_id)


func _add_production_section(title: String, items: Array, producing_kind: String, producing_id: int) -> void:
	if items.is_empty():
		return

	var header_index := production_list.item_count
	production_list.add_item("— %s —" % title)
	production_list.set_item_disabled(header_index, true)
	production_list.set_item_custom_fg_color(header_index, Color(0.7, 0.8, 0.9, 0.9))

	for raw in items:
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var d: Dictionary = raw
		var item_name: String = String(d.get("name", "Unknown"))
		var cost: int = int(d.get("cost", 0))
		var item_type: String = String(d.get("type", "unit"))
		var item_id: int = int(d.get("id", 0))
		var enabled := bool(d.get("enabled", true))
		var missing_resources = d.get("missing_resources", [])
		var missing_requirements = d.get("missing_requirements", [])

		var item_type_lower := item_type.to_lower()
		var producing_kind_lower := producing_kind.to_lower()
		var is_current := producing_kind_lower == item_type_lower and item_id == producing_id
		var prefix := "▶ " if is_current else ""
		var display_text := "%s%s (%d⚙)" % [prefix, item_name, cost]

		var requires_counts := _resource_counts_for_item(item_type_lower, item_id, "requires_resources")
		var consumes_counts := _resource_counts_for_item(item_type_lower, item_id, "consumes_resources")
		var res_inline := _format_resource_inventory_inline(requires_counts)
		if not res_inline.is_empty():
			display_text += " [Res: %s]" % res_inline
		var consumes_inline := _format_resource_counts_inline(consumes_counts)
		if not consumes_inline.is_empty():
			display_text += " [Cons: %s]" % consumes_inline

		if not enabled:
			var reasons: Array[String] = []
			var missing_counts: Dictionary = {}
			if typeof(missing_resources) == TYPE_ARRAY:
				for r in missing_resources:
					var rid := _parse_runtime_id(r)
					if rid >= 0:
						missing_counts[rid] = int(missing_counts.get(rid, 0)) + 1
			if not missing_counts.is_empty():
				var ids: Array = missing_counts.keys()
				ids.sort()
				var missing_names: Array[String] = []
				for rid in ids:
					var res_name := _resource_name(int(rid))
					var count := int(missing_counts.get(rid, 0))
					if count > 1:
						missing_names.append("%s x%d" % [res_name, count])
					else:
						missing_names.append(res_name)
				reasons.append("Needs %s" % ", ".join(missing_names))
			elif typeof(missing_resources) == TYPE_ARRAY and missing_resources.size() > 0:
				reasons.append("Needs resources")
			if typeof(missing_requirements) == TYPE_ARRAY:
				for req in missing_requirements:
					reasons.append(String(req))
			if reasons.is_empty():
				display_text += "  ⛔ Unavailable"
			else:
				display_text += "  ⛔ %s" % "; ".join(reasons)

		# Try to load sprite icon for this item
		var icon: Texture2D = null
		var icon_path := ""
		if item_type_lower == "unit":
			var name_key := item_name.to_lower().replace(" ", "_")
			icon_path = "res://assets/units/%s.png" % name_key
		elif item_type_lower == "building":
			var name_key := item_name.to_lower().replace(" ", "_")
			icon_path = "res://assets/buildings/%s.png" % name_key

		if not icon_path.is_empty() and ResourceLoader.exists(icon_path):
			icon = load(icon_path)

		var idx := production_list.item_count
		if icon:
			production_list.add_item(display_text, icon)
		else:
			production_list.add_item(display_text)

		production_list.set_item_metadata(idx, {
			"type": item_type,
			"id": item_id,
			"enabled": enabled,
			"missing_resources": missing_resources,
			"missing_requirements": missing_requirements,
		})

		var tooltip_lines: Array[String] = []
		if not requires_counts.is_empty():
			tooltip_lines.append("Requires: %s" % _format_resource_counts_inline(requires_counts))
			if not res_inline.is_empty():
				tooltip_lines.append("Inventory: %s" % res_inline)
		if not consumes_counts.is_empty():
			tooltip_lines.append("Consumes: %s" % _format_resource_counts_inline(consumes_counts))
		if typeof(missing_resources) == TYPE_ARRAY and not missing_resources.is_empty():
			tooltip_lines.append("Missing resources: %s" % _format_resource_counts_inline(_resource_counts_from_list(missing_resources)))
		if typeof(missing_requirements) == TYPE_ARRAY and not missing_requirements.is_empty():
			for req in missing_requirements:
				tooltip_lines.append(String(req))
		if not tooltip_lines.is_empty():
			production_list.set_item_tooltip(idx, "\n".join(tooltip_lines))

		# Highlight current production
		if is_current:
			production_list.set_item_custom_fg_color(idx, Color(0.3, 1.0, 0.4, 1.0))
		elif not enabled:
			production_list.set_item_custom_fg_color(idx, Color(0.7, 0.7, 0.7, 0.9))


func hide_city_panel() -> void:
	city_panel.visible = false
	city_why_button.disabled = true
	selected_city = {}
	growth_box.visible = false
	production_progress_box.visible = false
	cancel_production_button.visible = false


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
		if ui_v2_enabled:
			player_label.add_theme_color_override("font_color", UiTheme.COLORS["accent"])
		else:
			player_label.add_theme_color_override("font_color", Color.GREEN)
		end_turn_button.disabled = false
		if _end_turn_blocked:
			end_turn_button.text = _end_turn_block_reason if not _end_turn_block_reason.is_empty() else "Needs Attention"
			if not ui_v2_enabled:
				end_turn_button.add_theme_color_override("font_color", Color(1.0, 0.45, 0.45, 1.0))
		else:
			end_turn_button.text = "End Turn"
			if not ui_v2_enabled:
				end_turn_button.add_theme_color_override("font_color", Color(0.2, 1.0, 0.3, 1.0))
	else:
		player_label.text = "Player %d's Turn" % current_player
		if ui_v2_enabled:
			player_label.add_theme_color_override("font_color", UiTheme.COLORS["warning"])
		else:
			player_label.add_theme_color_override("font_color", Color.YELLOW)
		end_turn_button.disabled = true
		end_turn_button.text = "End Turn"
		if not ui_v2_enabled:
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

func _promotion_name(promotion_id: int) -> String:
	var names = _rules_names.get("promotions", [])
	if typeof(names) == TYPE_ARRAY and promotion_id >= 0 and promotion_id < names.size():
		return String(names[promotion_id])
	return "Promotion %d" % promotion_id

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

func _terrain_name(terrain_id: int) -> String:
	var names = _rules_names.get("terrains", [])
	if typeof(names) == TYPE_ARRAY and terrain_id >= 0 and terrain_id < names.size():
		return String(names[terrain_id])
	return "Terrain %d" % terrain_id

func _resource_name(resource_id: int) -> String:
	var rules = _resource_rules_by_id.get(resource_id, {})
	if typeof(rules) == TYPE_DICTIONARY and not rules.is_empty():
		return String(rules.get("name", "Resource %d" % resource_id))
	return "Resource %d" % resource_id

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

func _format_yields(y: Variant) -> String:
	if typeof(y) != TYPE_DICTIONARY:
		return "—"
	var d: Dictionary = y
	var parts: Array[String] = []
	var food = int(d.get("food", 0))
	var prod = int(d.get("production", 0))
	var gold = int(d.get("gold", 0))
	var sci = int(d.get("science", 0))
	var cul = int(d.get("culture", 0))
	if food != 0:
		parts.append("Food %s" % (("+" if food > 0 else "") + str(food)))
	if prod != 0:
		parts.append("Prod %s" % (("+" if prod > 0 else "") + str(prod)))
	if gold != 0:
		parts.append("Gold %s" % (("+" if gold > 0 else "") + str(gold)))
	if sci != 0:
		parts.append("Sci %s" % (("+" if sci > 0 else "") + str(sci)))
	if cul != 0:
		parts.append("Cul %s" % (("+" if cul > 0 else "") + str(cul)))
	if parts.is_empty():
		return "—"
	return ", ".join(parts)

func _add_promise_row(promise: Dictionary) -> void:
	if _ui_fonts.is_empty():
		_ui_fonts = UiTheme.load_fonts()

	var row := PanelContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.custom_minimum_size = Vector2(0, 34)
	row.add_theme_stylebox_override("panel", _promise_row_style())

	var content := HBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 8)
	row.add_child(content)

	var label := Label.new()
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.text = _format_promise_item(promise)
	UiTheme.apply_label(label, "body", _ui_fonts)

	var action_info := _promise_action_info(promise)
	var action_label := String(action_info.get("label", ""))
	if action_label.is_empty():
		action_label = "Info"

	var action_button := Button.new()
	action_button.text = action_label
	action_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	UiTheme.apply_button(action_button, "secondary", _ui_fonts)

	var enabled := bool(action_info.get("enabled", false))
	var reason := String(action_info.get("reason", ""))
	action_button.disabled = not enabled
	if not reason.is_empty():
		action_button.tooltip_text = reason
		label.tooltip_text = reason

	content.add_child(label)
	content.add_child(action_button)
	promise_list.add_child(row)

	if enabled:
		action_button.pressed.connect(_on_promise_action_pressed.bind(promise.duplicate(true)))

func _promise_action_info(promise: Dictionary) -> Dictionary:
	var t = String(promise.get("type", ""))
	var info := {
		"label": "",
		"enabled": false,
		"reason": "",
	}

	match t:
		"TechPickRequired", "ResearchComplete":
			info["label"] = "Pick Tech"
			info["enabled"] = true
		"CityProductionPickRequired", "CityProduction":
			info["label"] = "Pick Production"
			info["enabled"] = true
			if _extract_entity_id(promise.get("city", -1)) < 0:
				info["enabled"] = false
				info["reason"] = "City unavailable"
		"IdleWorker":
			info["label"] = "Apply"
			info["enabled"] = promise.has("recommendation")
			if not bool(info["enabled"]):
				info["reason"] = "No recommendation"
		"ConnectResource":
			info["label"] = "Connect"
			info["enabled"] = promise.has("kind")
			if not bool(info["enabled"]):
				info["reason"] = "No connect action"
		"PolicyPickAvailable":
			info["label"] = "Pick Policy"
			info["reason"] = "Policy UI not ready"
		_:
			info["label"] = "Info"
			info["reason"] = "No action available"

	if bool(info["enabled"]) and not is_my_turn:
		info["enabled"] = false
		info["reason"] = "Wait for your turn"

	return info

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
		"ConnectResource":
			var rid := _parse_runtime_id(promise.get("resource", -1))
			var rname := _resource_name(rid)
			var action := "connect"
			var kind = promise.get("kind", null)
			if typeof(kind) == TYPE_DICTIONARY:
				var kd: Dictionary = kind
				var kt := String(kd.get("type", ""))
				match kt:
					"Build":
						var impr_id := _parse_runtime_id(kd.get("improvement", -1))
						action = "build %s" % _improvement_name(impr_id)
					"Repair":
						var req_impr := -1
						var rr = _resource_rules_by_id.get(rid, {})
						if typeof(rr) == TYPE_DICTIONARY:
							var v = rr.get("requires_improvement", null)
							if v != null:
								req_impr = _parse_runtime_id(v)
						if req_impr >= 0:
							action = "repair %s" % _improvement_name(req_impr)
						else:
							action = "repair improvement"
					_:
						action = "connect"
			return "Connect %s → %s" % [rname, action]
		_:
			if promise.has("turns"):
				return "%s in %d" % [t, int(promise.get("turns", 0))]
			return t

func _resource_counts_from_list(raw_list: Variant) -> Dictionary:
	var counts: Dictionary = {}
	if typeof(raw_list) != TYPE_ARRAY:
		return counts
	for r in raw_list:
		var rid := _parse_runtime_id(r)
		if rid >= 0:
			counts[rid] = int(counts.get(rid, 0)) + 1
	return counts

func _resource_counts_for_item(item_type_lower: String, item_id: int, key: String) -> Dictionary:
	var rules: Dictionary = {}
	match item_type_lower:
		"unit":
			rules = _unit_rules_by_id.get(item_id, {})
		"building":
			rules = _building_rules_by_id.get(item_id, {})
		_:
			return {}

	if typeof(rules) != TYPE_DICTIONARY or rules.is_empty():
		return {}
	return _resource_counts_from_list(rules.get(key, []))

func _format_resource_counts_inline(counts: Dictionary) -> String:
	if counts.is_empty():
		return ""
	var ids: Array = counts.keys()
	ids.sort()
	var parts: Array[String] = []
	for rid in ids:
		var count := int(counts.get(rid, 0))
		if count <= 0:
			continue
		var name := _resource_name(int(rid))
		if count > 1:
			parts.append("%s x%d" % [name, count])
		else:
			parts.append(name)
	return ", ".join(parts)

func _format_resource_inventory_inline(counts: Dictionary) -> String:
	if not _resource_inventory_received:
		return ""
	if counts.is_empty():
		return ""
	var ids: Array = counts.keys()
	ids.sort()
	var parts: Array[String] = []
	for rid in ids:
		var count := int(counts.get(rid, 0))
		if count <= 0:
			continue
		var entry: Dictionary = _resource_inventory.get(rid, {})
		var available := int(entry.get("available", 0))
		var total := int(entry.get("total", available))
		var used := int(entry.get("used", max(0, total - available)))
		var name := _resource_name(int(rid))
		var need_suffix := ""
		if count > 1:
			need_suffix = " x%d" % count
		var part := "%s%s %d/%d" % [name, need_suffix, available, total]
		if used > 0:
			part += " (used %d)" % used
		parts.append(part)
	return ", ".join(parts)


func _on_end_turn_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	end_turn_pressed.emit()


func _on_menu_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	menu_pressed.emit()


func _on_city_close_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_close") if get_node_or_null("/root/AudioManager") else null
	hide_city_panel()
	city_panel_close_requested.emit()

func _on_city_why_pressed() -> void:
	if selected_city.is_empty():
		return
	var city_id := _extract_entity_id(selected_city.get("id", -1))
	if city_id < 0:
		return
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	city_maintenance_why_requested.emit(city_id)


func _on_found_city_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	found_city_requested.emit()


func _on_fortify_pressed() -> void:
	var unit_id = _extract_entity_id(selected_unit.get("id", -1))
	if unit_id < 0:
		return
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
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
	var md: Dictionary = meta
	if not bool(md.get("enabled", true)):
		get_node_or_null("/root/AudioManager").play("ui_error") if get_node_or_null("/root/AudioManager") else null
		var raw_missing = md.get("missing_resources", [])
		var names: Array[String] = []
		if typeof(raw_missing) == TYPE_ARRAY:
			for r in raw_missing:
				var rid := _parse_runtime_id(r)
				if rid >= 0:
					names.append(_resource_name(rid))
		if not names.is_empty():
			add_message("Missing required resources: %s" % ", ".join(names))
		else:
			add_message("Missing required resources")
		production_list.deselect_all()
		return

	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	production_selected.emit(String(md.get("type", "unit")), int(md.get("id", 0)))


func _on_cancel_production_pressed() -> void:
	if selected_city.is_empty():
		return
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	cancel_production_requested.emit()

func _on_promise_action_pressed(promise: Dictionary) -> void:
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	promise_selected.emit(promise)

func _on_timeline_item_selected(index: int) -> void:
	if index < 0 or index >= _timeline_entries.size():
		return
	var entry = _timeline_entries[index]
	if typeof(entry) != TYPE_DICTIONARY:
		return
	var d: Dictionary = entry
	var turn := int(d.get("turn", 0))

	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	if not _timeline_interactive:
		add_message("Timeline scrub requires replay (host-only until game over)")
		timeline_list.deselect_all()
		return

	timeline_turn_selected.emit(turn)
	timeline_list.deselect_all()

func _on_context_why_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	context_why_pressed.emit(_context_kind, _context_attacker_id, _context_defender_id)


func _on_context_attack_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	if _context_kind != "Combat":
		return
	context_attack_pressed.emit(_context_attacker_id, _context_defender_id)


func _on_why_close_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_close") if get_node_or_null("/root/AudioManager") else null
	hide_why_panel()

func _on_rules_detail_close_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_close") if get_node_or_null("/root/AudioManager") else null
	hide_rules_detail_panel()

func _on_unit_details_pressed() -> void:
	if selected_unit.is_empty():
		return
	var type_data = selected_unit.get("type_id", -1)
	var type_id := _parse_runtime_id(type_data)
	if type_id < 0:
		return
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	show_unit_type_details(type_id)

func _on_promote_pressed() -> void:
	if selected_unit.is_empty():
		return
	if int(selected_unit.get("promotion_picks", 0)) <= 0:
		return
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	_show_promotion_panel_for_selected_unit()

func _on_promotion_item_selected(index: int) -> void:
	if index < 0 or index >= promotion_list.item_count:
		return
	if selected_unit.is_empty():
		return

	var unit_id := int(selected_unit.get("id", -1))
	if unit_id < 0:
		return

	var meta = promotion_list.get_item_metadata(index)
	var promotion_id := _parse_runtime_id(meta)
	if promotion_id < 0:
		return

	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	_hide_promotion_panel()
	promotion_selected.emit(unit_id, promotion_id)
	promotion_list.deselect_all()

func _on_promotion_close_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_close") if get_node_or_null("/root/AudioManager") else null
	_hide_promotion_panel()

func _show_promotion_panel_for_selected_unit() -> void:
	promotion_list.clear()

	var picks := int(selected_unit.get("promotion_picks", 0))
	promotion_panel_info.text = "Choose a promotion (%d pick%s available)" % [
		picks,
		"s" if picks != 1 else "",
	]

	var owned: Dictionary = {}
	var promos = selected_unit.get("promotions", [])
	if typeof(promos) == TYPE_ARRAY:
		for p in promos:
			var pid := _parse_runtime_id(p)
			if pid >= 0:
				owned[pid] = true

	var promotions = _rules_catalog.get("promotions", [])
	if typeof(promotions) == TYPE_ARRAY:
		for p in promotions:
			if typeof(p) != TYPE_DICTIONARY:
				continue
			var pd: Dictionary = p
			var pid := _parse_runtime_id(pd.get("id", -1))
			if pid < 0 or owned.has(pid):
				continue
			var name := String(pd.get("name", _promotion_name(pid)))
			var desc := String(pd.get("description", ""))
			var line := name
			if not desc.is_empty():
				line += " — " + desc
			var idx := promotion_list.item_count
			promotion_list.add_item(line)
			promotion_list.set_item_metadata(idx, pid)

	if promotion_list.item_count == 0:
		promotion_panel_info.text = "No promotions available."

	promotion_panel.visible = true


func _on_research_button_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	research_button_pressed.emit()


func _on_diplomacy_button_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
	diplomacy_button_pressed.emit()

func _on_share_pressed() -> void:
	get_node_or_null("/root/AudioManager").play("ui_click") if get_node_or_null("/root/AudioManager") else null
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
