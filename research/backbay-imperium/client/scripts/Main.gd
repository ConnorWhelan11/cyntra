extends Node

@onready var client: GameClient = $GameClient
@onready var map_view: MapView = $MapView
@onready var info_label: Label = $UI/InfoLabel
@onready var turn_slider: HSlider = $UI/TurnSlider
@onready var timeline_list: ItemList = $UI/TimelineList
@onready var context_body: Label = $UI/ContextPanel/VBox/Body
@onready var context_why_button: Button = $UI/ContextPanel/VBox/Header/WhyButton
@onready var context_attack_button: Button = $UI/ContextPanel/VBox/Header/AttackButton
@onready var promise_list: ItemList = $UI/PromisesPanel/VBox/PromiseList
@onready var why_panel: PanelContainer = $UI/WhyPanel
@onready var why_title: Label = $UI/WhyPanel/VBox/Header/Title
@onready var why_body: RichTextLabel = $UI/WhyPanel/VBox/Body
@onready var why_close_button: Button = $UI/WhyPanel/VBox/Header/CloseButton

var _log_lines: Array[String] = []
var _promises: Array = []
var _chronicle_entries: Array = []
var _max_turn_seen: int = 1
var _updating_timeline := false
var _updating_turn_slider := false

var _context_kind: String = ""
var _context_attacker_id: int = -1
var _context_defender_id: int = -1
var _context_city_id: int = -1
var _context_preview: Dictionary = {}
var _context_dirty := true
var _context_last_hover := Vector2i(-999, -999)
var _context_last_selected := -1

func _ready() -> void:
	client.snapshot_loaded.connect(_on_snapshot_loaded)
	client.events_received.connect(_on_events_received)
	client.info_message.connect(_on_info_message)
	turn_slider.drag_ended.connect(_on_turn_slider_drag_ended)
	timeline_list.item_selected.connect(_on_timeline_item_selected)
	map_view.why_panel_requested.connect(_on_why_panel_requested)
	promise_list.item_selected.connect(_on_promise_item_selected)
	context_why_button.pressed.connect(_on_context_why_pressed)
	context_attack_button.pressed.connect(_on_context_attack_pressed)
	why_close_button.pressed.connect(_hide_why_panel)

	_push_log("LMB: select/move/attack | RMB/Shift+LMB: goto | Tab: cycle | Space/Enter: end turn")
	_push_log("Esc/Backspace: cancel orders | R: repath goto | Z: toggle ZOC | O: toggle orders")
	_push_log("Alt+LMB: Why (combat/city) | Context panel: Why/Attack")
	_push_log("A: toggle worker automation")
	_push_log("Timeline: click entries or scrub with slider")
	_push_log("Why panels: M=maintenance | U=unrest | C=conversion | T=treaties | X=clear")
	_max_turn_seen = 1
	client.new_game(10, 2)
	_refresh_context_panel()


func _process(_delta: float) -> void:
	info_label.text = _status_text()
	_maybe_refresh_context_panel()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		var key := event as InputEventKey
		match key.keycode:
			KEY_P:
				var json := client.export_replay_json()
				if json != "":
					DisplayServer.clipboard_set(json)
					_push_log("Replay copied to clipboard (%d chars)" % json.length())
			KEY_L:
				var json := DisplayServer.clipboard_get()
				if json != "":
					_push_log("Importing replay from clipboard...")
					client.import_replay_json(json)
			KEY_A:
				var unit_id := map_view.selected_unit_id
				if unit_id >= 0 and client.units.has(unit_id):
					var u: Dictionary = client.units[unit_id]
					var type_id = int(u.get("type_id", -1))
					if _unit_type_is_worker(type_id):
						var next_enabled = not bool(u.get("automated", false))
						client.set_worker_automation(unit_id, next_enabled)
						_push_log("Worker automation: %s" % ("ON" if next_enabled else "OFF"))
			KEY_M:
				_show_why_panel(client.get_maintenance_why(client.current_player))
			KEY_U:
				var city_id := _first_city_id_for_player(client.current_player)
				if city_id >= 0:
					_show_why_panel(client.get_unrest_why(city_id))
			KEY_C:
				var city_id := _first_city_id_for_player(client.current_player)
				if city_id >= 0:
					_show_why_panel(client.get_conversion_why(city_id))
			KEY_T:
				var other := 0 if client.current_player != 0 else 1
				_show_why_panel(client.get_treaty_why(client.current_player, other))
			KEY_X:
				_hide_why_panel()
			_:
					pass


func _unit_type_is_worker(type_id: int) -> bool:
	var unit_types = client.rules_catalog.get("unit_types", [])
	if typeof(unit_types) != TYPE_ARRAY:
		return false
	for u in unit_types:
		if typeof(u) != TYPE_DICTIONARY:
			continue
		var ud: Dictionary = u
		if int(ud.get("id", -1)) == type_id:
			return bool(ud.get("is_worker", false))
	return false


func _on_snapshot_loaded() -> void:
	_push_log("Snapshot loaded")
	_refresh_promises()
	_max_turn_seen = max(_max_turn_seen, client.current_turn)
	_refresh_timeline()
	_refresh_turn_slider()
	_context_dirty = true
	_refresh_context_panel()


func _on_events_received(events: Array) -> void:
	for e in events:
		if typeof(e) != TYPE_DICTIONARY:
			continue
		var t = String(e.get("type", ""))
		if t == "TurnStarted":
			_push_log("Turn %d: Player %d" % [client.current_turn, client.current_player])
	_refresh_promises()
	_max_turn_seen = max(_max_turn_seen, client.current_turn)
	_refresh_timeline()
	_refresh_turn_slider()
	_context_dirty = true
	_refresh_context_panel()


func _on_info_message(message: String) -> void:
	_push_log(message)

func _on_why_panel_requested(panel: Dictionary) -> void:
	_show_why_panel(panel)


func _push_log(line: String) -> void:
	_log_lines.append(line)
	while _log_lines.size() > 8:
		_log_lines.pop_front()

func _refresh_promises() -> void:
	_promises = client.get_promise_strip(client.current_player)
	_refresh_promise_list()

func _refresh_turn_slider() -> void:
	_updating_turn_slider = true
	turn_slider.min_value = 1
	turn_slider.max_value = max(_max_turn_seen, 1)
	turn_slider.value = client.current_turn
	_updating_turn_slider = false

func _on_turn_slider_drag_ended(value_changed: bool) -> void:
	if _updating_turn_slider:
		return
	if not value_changed:
		return
	client.replay_to_turn(int(turn_slider.value))

func _refresh_timeline() -> void:
	_updating_timeline = true
	timeline_list.clear()
	_chronicle_entries.clear()

	var raw = client.snapshot.get("chronicle", [])
	if typeof(raw) == TYPE_ARRAY:
		var entries: Array = raw
		for i in range(entries.size() - 1, -1, -1):
			var entry = entries[i]
			if typeof(entry) != TYPE_DICTIONARY:
				continue
			_chronicle_entries.append(entry)
			timeline_list.add_item(_format_chronicle_entry(entry))

	_updating_timeline = false

func _on_timeline_item_selected(index: int) -> void:
	if _updating_timeline:
		return
	if index < 0 or index >= _chronicle_entries.size():
		return

	var entry = _chronicle_entries[index]
	if typeof(entry) != TYPE_DICTIONARY:
		return

	client.replay_to_turn(int(entry.get("turn", 1)))

func _format_chronicle_entry(entry: Dictionary) -> String:
	var turn = int(entry.get("turn", 0))
	var ev = entry.get("event", {})
	if typeof(ev) != TYPE_DICTIONARY:
		return "T%d: (unknown)" % turn
	var e: Dictionary = ev
	var t = String(e.get("type", ""))

	match t:
		"CityFounded":
			return "T%d: %s founded (P%d)" % [turn, String(e.get("name", "City")), int(e.get("owner", -1))]
		"CityConquered":
			return "T%d: %s conquered (P%d→P%d)" % [turn, String(e.get("name", "City")), int(e.get("old_owner", -1)), int(e.get("new_owner", -1))]
		"TechResearched":
			var tech_id = int(e.get("tech", -1))
			return "T%d: P%d researched %s" % [turn, int(e.get("player", -1)), client.tech_name(tech_id)]
		"PolicyAdopted":
			var policy_id = int(e.get("policy", -1))
			return "T%d: P%d adopted %s" % [turn, int(e.get("player", -1)), client.policy_name(policy_id)]
		"GovernmentReformed":
			var gov_id = int(e.get("new", -1))
			return "T%d: P%d reformed government → %s" % [turn, int(e.get("player", -1)), client.government_name(gov_id)]
		"WarDeclared":
			return "T%d: War declared (P%d→P%d)" % [turn, int(e.get("aggressor", -1)), int(e.get("target", -1))]
		"PeaceDeclared":
			return "T%d: Peace (P%d↔P%d)" % [turn, int(e.get("a", -1)), int(e.get("b", -1))]
		"BattleEnded":
			var at = e.get("at", {})
			if typeof(at) == TYPE_DICTIONARY:
				return "T%d: Battle at (%d,%d) P%d wins" % [turn, int(at.get("q", 0)), int(at.get("r", 0)), int(e.get("winner", -1))]
			return "T%d: Battle P%d wins" % [turn, int(e.get("winner", -1))]
		"ImprovementBuilt":
			var impr_id = int(e.get("improvement", -1))
			var at = e.get("at", {})
			var at_str := ""
			if typeof(at) == TYPE_DICTIONARY:
				at_str = " @(%d,%d)" % [int(at.get("q", 0)), int(at.get("r", 0))]
			return "T%d: %s built (T%d)%s" % [turn, client.improvement_name(impr_id), int(e.get("tier", 1)), at_str]
		"ImprovementMatured":
			var impr_id = int(e.get("improvement", -1))
			var at = e.get("at", {})
			var at_str := ""
			if typeof(at) == TYPE_DICTIONARY:
				at_str = " @(%d,%d)" % [int(at.get("q", 0)), int(at.get("r", 0))]
			return "T%d: %s matured → T%d%s" % [turn, client.improvement_name(impr_id), int(e.get("new_tier", 1)), at_str]
		"ImprovementPillaged":
			var impr_id = int(e.get("improvement", -1))
			var at = e.get("at", {})
			var at_str := ""
			if typeof(at) == TYPE_DICTIONARY:
				at_str = " @(%d,%d)" % [int(at.get("q", 0)), int(at.get("r", 0))]
			return "T%d: %s pillaged%s" % [turn, client.improvement_name(impr_id), at_str]
		"ImprovementRepaired":
			var impr_id = int(e.get("improvement", -1))
			var at = e.get("at", {})
			var at_str := ""
			if typeof(at) == TYPE_DICTIONARY:
				at_str = " @(%d,%d)" % [int(at.get("q", 0)), int(at.get("r", 0))]
			return "T%d: %s repaired (T%d)%s" % [turn, client.improvement_name(impr_id), int(e.get("tier", 1)), at_str]
		"TradeRouteEstablished":
			return "T%d: Trade route established" % turn
		"TradeRoutePillaged":
			return "T%d: Trade route pillaged" % turn
		_:
			return "T%d: %s" % [turn, t]

func _first_city_id_for_player(player_id: int) -> int:
	for city_data in client.snapshot.get("cities", []):
		if typeof(city_data) != TYPE_DICTIONARY:
			continue
		var c: Dictionary = city_data
		if int(c.get("owner", -1)) == player_id:
			return int(c.get("id", -1))
	return -1

func _show_why_panel(panel: Dictionary) -> void:
	if panel.is_empty():
		_hide_why_panel()
		return

	why_title.text = String(panel.get("title", "Why"))
	why_body.text = _format_why_body(panel)
	why_panel.visible = true

func _format_why_body(panel: Dictionary) -> String:
	if panel.is_empty():
		return ""
	var lines: Array[String] = []
	var summary = String(panel.get("summary", ""))
	if summary != "":
		lines.append(summary)
	var raw = panel.get("lines", [])
	if typeof(raw) == TYPE_ARRAY:
		for item in raw:
			if typeof(item) != TYPE_DICTIONARY:
				continue
			var d: Dictionary = item
			lines.append("- %s: %s" % [String(d.get("label", "")), String(d.get("value", ""))])
	return "\n".join(lines)


func _status_text() -> String:
	var sel := map_view.selected_unit_id
	var hover := map_view.hovered_hex
	var hover_str := "(none)"
	if hover.x >= 0:
		hover_str = "(%d,%d)" % [hover.x, hover.y]

	var lines: Array[String] = []
	lines.append("Turn %d  Player %d" % [client.current_turn, client.current_player])
	lines.append("Selected unit: %s  Hover: %s" % [str(sel), hover_str])
	lines.append("")
	lines.append_array(_log_lines)

	lines.append("")
	lines.append("Promises: %d (see list)" % _promises.size())
	return "\n".join(lines)


func _hide_why_panel() -> void:
	why_panel.visible = false
	why_title.text = "Why"
	why_body.text = ""


func _refresh_promise_list() -> void:
	promise_list.clear()
	for p in _promises:
		if typeof(p) != TYPE_DICTIONARY:
			continue
		promise_list.add_item(_format_promise_item(p))


func _format_promise_item(p: Dictionary) -> String:
	var t = String(p.get("type", ""))
	match t:
		"PolicyPickAvailable":
			return "Policy pick available (%d)" % int(p.get("picks", 0))
		"IdleWorker":
			var at = p.get("at", {})
			var at_str := ""
			if typeof(at) == TYPE_DICTIONARY:
				at_str = "@(%d,%d)" % [int(at.get("q", 0)), int(at.get("r", 0))]
			var rec_str := ""
			var rec = p.get("recommendation", null)
			if typeof(rec) == TYPE_DICTIONARY:
				var rd: Dictionary = rec
				match String(rd.get("type", "")):
					"Repair":
						rec_str = "repair"
					"Build":
						rec_str = "build %s" % client.improvement_name(int(rd.get("improvement", -1)))
					_:
						rec_str = ""
			var turns = int(p.get("recommendation_turns", 0))
			if rec_str != "" and turns > 0:
				return "Idle worker %s → %s (%dt)" % [at_str, rec_str, turns]
			if rec_str != "":
				return "Idle worker %s → %s" % [at_str, rec_str]
			return "Idle worker %s" % at_str
		"WorkerTask":
			var at = p.get("at", {})
			var at_str := ""
			if typeof(at) == TYPE_DICTIONARY:
				at_str = "@(%d,%d)" % [int(at.get("q", 0)), int(at.get("r", 0))]
			var kind = p.get("kind", {})
			var kind_str := "work"
			if typeof(kind) == TYPE_DICTIONARY:
				var kd: Dictionary = kind
				match String(kd.get("type", "")):
					"Repair":
						kind_str = "repair"
					"Build":
						kind_str = "build %s" % client.improvement_name(int(kd.get("improvement", -1)))
					_:
						kind_str = "work"
			return "Worker %s (%dt) %s" % [kind_str, int(p.get("turns", 0)), at_str]
		_:
			if p.has("turns"):
				return "%s in %d" % [t, int(p.get("turns", 0))]
			return t


func _on_promise_item_selected(index: int) -> void:
	if index < 0 or index >= _promises.size():
		return
	var p = _promises[index]
	if typeof(p) != TYPE_DICTIONARY:
		return
	var promise: Dictionary = p

	var t = String(promise.get("type", ""))
	if t != "IdleWorker":
		return

	var unit_id = int(promise.get("unit", -1))
	if unit_id < 0:
		return

	var rec = promise.get("recommendation", null)
	if typeof(rec) != TYPE_DICTIONARY:
		_push_log("Idle worker has no recommendation")
		return

	var rd: Dictionary = rec
	match String(rd.get("type", "")):
		"Repair":
			client.set_repair_improvement_orders(unit_id)
			_push_log("Worker: repair")
		"Build":
			var impr_id = int(rd.get("improvement", -1))
			if impr_id >= 0:
				client.set_build_improvement_orders(unit_id, impr_id)
				_push_log("Worker: build %s" % client.improvement_name(impr_id))
		_:
			pass

	promise_list.deselect_all()


func _maybe_refresh_context_panel() -> void:
	var hover := map_view.hovered_hex
	var sel := map_view.selected_unit_id
	if _context_dirty or hover != _context_last_hover or sel != _context_last_selected:
		_context_last_hover = hover
		_context_last_selected = sel
		_context_dirty = false
		_refresh_context_panel()


func _refresh_context_panel() -> void:
	_context_kind = ""
	_context_attacker_id = -1
	_context_defender_id = -1
	_context_city_id = -1
	_context_preview = {}

	context_attack_button.visible = false
	context_attack_button.disabled = true
	context_why_button.visible = true
	context_why_button.disabled = true

	var hover := map_view.hovered_hex
	if hover.x < 0:
		context_body.text = "Hover an adjacent enemy for combat preview, or a friendly city for upkeep."
		return

	# Combat context: hover an adjacent enemy while a unit is selected.
	var attacker_id := map_view.selected_unit_id
	if attacker_id >= 0:
		var defender_id := _unit_id_at_hex(hover)
		if defender_id >= 0 and client.units.has(defender_id):
			var defender: Dictionary = client.units[defender_id]
			if int(defender.get("owner", -1)) != client.current_player:
				var attacker_pos := _unit_pos(attacker_id)
				if attacker_pos != Vector2i(-999, -999) and _is_neighbor(attacker_pos, hover):
					_context_kind = "combat"
					_context_attacker_id = attacker_id
					_context_defender_id = defender_id
					_context_preview = client.get_combat_preview(attacker_id, defender_id)

					context_body.text = _format_combat_context(attacker_id, defender_id, _context_preview)
					context_attack_button.visible = true
					context_attack_button.disabled = false
					context_why_button.visible = true
					context_why_button.disabled = false
					return

	# City context: hover a friendly city.
	var city_id := _city_id_at_hex(hover)
	if city_id >= 0 and client.cities.has(city_id):
		var city: Dictionary = client.cities[city_id]
		if int(city.get("owner", -1)) == client.current_player:
			_context_kind = "city"
			_context_city_id = city_id
			context_body.text = "City upkeep: %s\nClick Why for a breakdown." % String(city.get("name", "City"))
			context_why_button.visible = true
			context_why_button.disabled = false
			return

	context_body.text = "Hover an adjacent enemy for combat preview, or a friendly city for upkeep."


func _on_context_why_pressed() -> void:
	match _context_kind:
		"combat":
			_show_why_panel(client.get_combat_why(_context_attacker_id, _context_defender_id))
		"city":
			_show_why_panel(client.get_city_maintenance_why(_context_city_id))
		_:
			pass


func _on_context_attack_pressed() -> void:
	if _context_kind != "combat":
		return
	client.attack_unit(_context_attacker_id, _context_defender_id)


func _format_combat_context(attacker_id: int, defender_id: int, preview: Dictionary) -> String:
	var attacker: Dictionary = client.units.get(attacker_id, {})
	var defender: Dictionary = client.units.get(defender_id, {})

	var a_name = client.unit_type_name(int(attacker.get("type_id", -1)))
	var d_name = client.unit_type_name(int(defender.get("type_id", -1)))

	var win = int(preview.get("attacker_win_pct", 0))
	var a_exp = int(preview.get("attacker_hp_expected", 0))
	var d_exp = int(preview.get("defender_hp_expected", 0))
	var a_hp = int(attacker.get("hp", 0))
	var d_hp = int(defender.get("hp", 0))

	return "Combat preview (hover affordance)\nA: %s (HP %d) vs D: %s (HP %d)\nWin: %d%%  Expected HP: A%d / D%d\nClick enemy to attack; click Why for breakdown." % [a_name, a_hp, d_name, d_hp, win, a_exp, d_exp]


func _unit_id_at_hex(hex: Vector2i) -> int:
	for unit_id in client.units.keys():
		var u: Dictionary = client.units[unit_id]
		var pos: Dictionary = u.get("pos", {})
		if typeof(pos) == TYPE_DICTIONARY:
			if int(pos.get("q", -999)) == hex.x and int(pos.get("r", -999)) == hex.y:
				return int(unit_id)
	return -1


func _city_id_at_hex(hex: Vector2i) -> int:
	for city_id in client.cities.keys():
		var c: Dictionary = client.cities[city_id]
		var pos: Dictionary = c.get("pos", {})
		if typeof(pos) == TYPE_DICTIONARY:
			if int(pos.get("q", -999)) == hex.x and int(pos.get("r", -999)) == hex.y:
				return int(city_id)
	return -1


func _unit_pos(unit_id: int) -> Vector2i:
	if not client.units.has(unit_id):
		return Vector2i(-999, -999)
	var u: Dictionary = client.units[unit_id]
	var pos: Dictionary = u.get("pos", {})
	if typeof(pos) != TYPE_DICTIONARY:
		return Vector2i(-999, -999)
	return Vector2i(int(pos.get("q", -999)), int(pos.get("r", -999)))


func _normalize_hex(hex: Vector2i) -> Vector2i:
	var r := hex.y
	if r < 0 or r >= map_view.map_height:
		return Vector2i(-999, -999)
	var q := hex.x
	if map_view.wrap_horizontal:
		q = posmod(q, map_view.map_width)
	else:
		if q < 0 or q >= map_view.map_width:
			return Vector2i(-999, -999)
	return Vector2i(q, r)


func _is_neighbor(a: Vector2i, b: Vector2i) -> bool:
	var dirs := [
		Vector2i(1, 0),
		Vector2i(0, 1),
		Vector2i(-1, 1),
		Vector2i(-1, 0),
		Vector2i(0, -1),
		Vector2i(1, -1),
	]
	for d in dirs:
		if _normalize_hex(a + d) == b:
			return true
	return false
