# gdlint:ignore = class-definitions-order
## Diplomacy panel for managing relations with other civilizations.
## Shows war/peace status, treaties, and diplomatic actions.
extends PanelContainer
class_name DiplomacyPanel

signal declare_war(target_player: int)
signal propose_peace(target_player: int)
signal panel_closed()

enum Relation { PEACE, WAR, ALLIANCE, VASSAL }

const PLAYER_COLORS := [
	Color(0.2, 0.6, 1.0),   # Blue
	Color(1.0, 0.3, 0.2),   # Red
	Color(0.3, 0.8, 0.3),   # Green
	Color(1.0, 0.8, 0.2),   # Yellow
	Color(0.7, 0.3, 0.8),   # Purple
	Color(0.2, 0.8, 0.8),   # Cyan
	Color(1.0, 0.5, 0.2),   # Orange
	Color(0.9, 0.4, 0.6),   # Pink
]

var my_player_id: int = 0
var players: Dictionary = {}  # player_id -> {name, relation, score, is_alive}
var treaties: Array = []  # Array of treaty dictionaries
var selected_player: int = -1
var player_rows: Dictionary = {}  # player_id -> HBoxContainer

@onready var _title_label: Label = $VBox/TitleBar/Title
@onready var close_button: Button = $VBox/TitleBar/CloseButton
@onready var player_list: VBoxContainer = $VBox/ScrollContainer/PlayerList
@onready var info_label: RichTextLabel = $VBox/InfoPanel


func _ready() -> void:
	close_button.pressed.connect(_on_close_pressed)
	visible = false
	info_label.bbcode_enabled = true


func update_diplomacy(p_my_id: int, p_players: Dictionary, p_treaties: Array) -> void:
	my_player_id = p_my_id
	players = p_players.duplicate(true)
	treaties = p_treaties.duplicate(true)
	_rebuild_player_list()
	_update_info_panel()


func update_from_snapshot(snapshot: Dictionary, my_id: int) -> void:
	my_player_id = my_id
	players.clear()
	treaties.clear()

	# Extract player info
	var player_data = snapshot.get("players", [])
	for i in range(player_data.size()):
		var p = player_data[i]
		if typeof(p) != TYPE_DICTIONARY:
			continue

		var pid: int = i
		if p.has("id"):
			var id_data = p.get("id")
			if typeof(id_data) == TYPE_DICTIONARY:
				pid = int(id_data.get("0", i))
			else:
				pid = int(id_data)

		if pid == my_id:
			continue  # Skip self

		var player_info: Dictionary = {
			"name": "Player %d" % (pid + 1),
			"relation": Relation.PEACE,
			"score": int(p.get("score", 0)),
			"is_alive": bool(p.get("is_alive", true)),
			"cities": int(p.get("city_count", 0)),
			"units": int(p.get("unit_count", 0)),
		}

		# Check war status
		var at_war_with = snapshot.get("wars", [])
		if typeof(at_war_with) == TYPE_ARRAY:
			for war in at_war_with:
				if typeof(war) != TYPE_DICTIONARY:
					continue
				var a = war.get("a", -1)
				var b = war.get("b", -1)
				if typeof(a) == TYPE_DICTIONARY:
					a = int(a.get("0", -1))
				else:
					a = int(a)
				if typeof(b) == TYPE_DICTIONARY:
					b = int(b.get("0", -1))
				else:
					b = int(b)

				if (a == my_id and b == pid) or (a == pid and b == my_id):
					player_info["relation"] = Relation.WAR
					break

		players[pid] = player_info

	# Extract treaties
	var treaty_data = snapshot.get("treaties", [])
	if typeof(treaty_data) == TYPE_ARRAY:
		for t in treaty_data:
			if typeof(t) == TYPE_DICTIONARY:
				treaties.append(t)

	_rebuild_player_list()
	_update_info_panel()


func _rebuild_player_list() -> void:
	# Clear existing
	for child in player_list.get_children():
		child.queue_free()
	player_rows.clear()

	# Sort players by id
	var sorted_ids: Array = players.keys()
	sorted_ids.sort()

	for pid in sorted_ids:
		var pinfo: Dictionary = players[pid]
		var row := _create_player_row(int(pid), pinfo)
		player_list.add_child(row)
		player_rows[pid] = row


func _create_player_row(pid: int, pinfo: Dictionary) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.custom_minimum_size.y = 40

	# Player color indicator
	var color_rect := ColorRect.new()
	color_rect.custom_minimum_size = Vector2(8, 32)
	color_rect.color = PLAYER_COLORS[pid % PLAYER_COLORS.size()]
	row.add_child(color_rect)

	# Spacer
	var spacer1 := Control.new()
	spacer1.custom_minimum_size.x = 8
	row.add_child(spacer1)

	# Player name and status
	var name_label := Label.new()
	name_label.custom_minimum_size.x = 120
	name_label.text = pinfo.get("name", "Player %d" % (pid + 1))
	if not pinfo.get("is_alive", true):
		name_label.modulate = Color(0.5, 0.5, 0.5)
		name_label.text += " (Dead)"
	row.add_child(name_label)

	# Relation status
	var relation: int = pinfo.get("relation", Relation.PEACE)
	var status_label := Label.new()
	status_label.custom_minimum_size.x = 80
	match relation:
		Relation.PEACE:
			status_label.text = "Peace"
			status_label.add_theme_color_override("font_color", Color(0.4, 0.8, 0.4))
		Relation.WAR:
			status_label.text = "At War"
			status_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
		Relation.ALLIANCE:
			status_label.text = "Allied"
			status_label.add_theme_color_override("font_color", Color(0.3, 0.6, 1.0))
		Relation.VASSAL:
			status_label.text = "Vassal"
			status_label.add_theme_color_override("font_color", Color(0.7, 0.5, 0.3))
	row.add_child(status_label)

	# Score
	var score_label := Label.new()
	score_label.custom_minimum_size.x = 60
	score_label.text = "%d pts" % pinfo.get("score", 0)
	score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(score_label)

	# Spacer
	var spacer2 := Control.new()
	spacer2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer2)

	# Action buttons (only for alive players)
	if pinfo.get("is_alive", true):
		if relation == Relation.PEACE:
			var war_btn := Button.new()
			war_btn.text = "Declare War"
			war_btn.custom_minimum_size = Vector2(100, 30)
			war_btn.pressed.connect(_on_declare_war.bind(pid))
			row.add_child(war_btn)
		elif relation == Relation.WAR:
			var peace_btn := Button.new()
			peace_btn.text = "Propose Peace"
			peace_btn.custom_minimum_size = Vector2(100, 30)
			peace_btn.pressed.connect(_on_propose_peace.bind(pid))
			row.add_child(peace_btn)

	# Info button
	var info_btn := Button.new()
	info_btn.text = "Info"
	info_btn.custom_minimum_size = Vector2(50, 30)
	info_btn.pressed.connect(_on_select_player.bind(pid))
	row.add_child(info_btn)

	return row


func _update_info_panel() -> void:
	if selected_player < 0 or not players.has(selected_player):
		info_label.text = "Select a civilization to view details."
		return

	var pinfo: Dictionary = players[selected_player]
	var lines: Array[String] = []

	# Header
	lines.append("[b]%s[/b]" % pinfo.get("name", "Unknown"))
	lines.append("")

	# Status
	var relation: int = pinfo.get("relation", Relation.PEACE)
	match relation:
		Relation.PEACE:
			lines.append("[color=green]Status: At Peace[/color]")
		Relation.WAR:
			lines.append("[color=red]Status: At War[/color]")
		Relation.ALLIANCE:
			lines.append("[color=cyan]Status: Allied[/color]")
		Relation.VASSAL:
			lines.append("[color=yellow]Status: Vassal[/color]")

	lines.append("")

	# Stats
	lines.append("Score: %d" % pinfo.get("score", 0))
	lines.append("Cities: %d" % pinfo.get("cities", 0))
	lines.append("Military: %d units" % pinfo.get("units", 0))

	# Treaties with this player
	var player_treaties: Array = []
	for t in treaties:
		if typeof(t) != TYPE_DICTIONARY:
			continue
		var a = t.get("a", -1)
		var b = t.get("b", -1)
		if typeof(a) == TYPE_DICTIONARY:
			a = int(a.get("0", -1))
		else:
			a = int(a)
		if typeof(b) == TYPE_DICTIONARY:
			b = int(b.get("0", -1))
		else:
			b = int(b)

		if (a == my_player_id and b == selected_player) or (a == selected_player and b == my_player_id):
			player_treaties.append(t)

	if not player_treaties.is_empty():
		lines.append("")
		lines.append("[b]Active Treaties:[/b]")
		for t in player_treaties:
			var treaty_type: String = t.get("type", "Unknown")
			var turns_left: int = t.get("turns_remaining", -1)
			if turns_left > 0:
				lines.append("- %s (%d turns)" % [treaty_type, turns_left])
			else:
				lines.append("- %s" % treaty_type)

	info_label.text = "\n".join(lines)


func _on_declare_war(target: int) -> void:
	AudioManager.play("ui_click")
	declare_war.emit(target)


func _on_propose_peace(target: int) -> void:
	AudioManager.play("ui_click")
	propose_peace.emit(target)


func _on_select_player(pid: int) -> void:
	AudioManager.play("ui_click")
	selected_player = pid
	_update_info_panel()


func _on_close_pressed() -> void:
	AudioManager.play("ui_close")
	visible = false
	panel_closed.emit()


func open() -> void:
	AudioManager.play("ui_open")
	_rebuild_player_list()
	_update_info_panel()
	visible = true
