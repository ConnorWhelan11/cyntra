extends CanvasLayer
class_name GameEndScreen

## Full-screen overlay for victory/defeat presentation.

signal return_to_menu()
signal play_again()

@onready var overlay: ColorRect = $Overlay
@onready var panel: PanelContainer = $CenterContainer/Panel
@onready var banner_label: Label = $CenterContainer/Panel/VBox/Banner
@onready var message_label: Label = $CenterContainer/Panel/VBox/Message
@onready var stats_container: VBoxContainer = $CenterContainer/Panel/VBox/StatsContainer
@onready var return_button: Button = $CenterContainer/Panel/VBox/Buttons/ReturnButton
@onready var again_button: Button = $CenterContainer/Panel/VBox/Buttons/AgainButton

# State
var is_victory := false
var victory_type := ""
var player_stats: Dictionary = {}

# Animation
var entrance_tween: Tween


func _ready() -> void:
	visible = false
	return_button.pressed.connect(_on_return_pressed)
	again_button.pressed.connect(_on_again_pressed)

	# Start with elements hidden for animation
	_reset_animation_state()


func _reset_animation_state() -> void:
	overlay.modulate.a = 0.0
	panel.modulate.a = 0.0
	panel.scale = Vector2(0.8, 0.8)
	banner_label.modulate.a = 0.0
	message_label.modulate.a = 0.0
	stats_container.modulate.a = 0.0
	return_button.modulate.a = 0.0
	again_button.modulate.a = 0.0


func show_victory(type: String, stats: Dictionary) -> void:
	is_victory = true
	victory_type = type
	player_stats = stats
	_setup_victory_display()
	visible = true
	_play_entrance_animation()
	AudioManager.play("victory")


func show_defeat(reason: String, stats: Dictionary) -> void:
	is_victory = false
	player_stats = stats
	_setup_defeat_display(reason)
	visible = true
	_play_entrance_animation()
	AudioManager.play("defeat")


func _setup_victory_display() -> void:
	banner_label.text = "VICTORY!"
	banner_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2))

	var type_name := _victory_type_name(victory_type)
	message_label.text = "You have achieved\n%s VICTORY!" % type_name

	_populate_stats()

	# Set panel style for victory
	overlay.color = Color(0.1, 0.15, 0.1, 0.85)


func _setup_defeat_display(reason: String) -> void:
	banner_label.text = "DEFEAT"
	banner_label.add_theme_color_override("font_color", Color(0.9, 0.3, 0.3))

	message_label.text = "Your civilization has fallen.\n%s" % reason

	_populate_stats()

	# Set panel style for defeat
	overlay.color = Color(0.15, 0.1, 0.1, 0.85)


func _populate_stats() -> void:
	# Clear existing stats
	for child in stats_container.get_children():
		child.queue_free()

	# Add separator
	var sep := HSeparator.new()
	stats_container.add_child(sep)

	# Add title
	var title := Label.new()
	title.text = "Final Statistics"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 16)
	stats_container.add_child(title)

	# Add stats
	_add_stat("Final Score", _format_number(player_stats.get("score", 0)))
	_add_stat("Cities", str(player_stats.get("cities", 0)))
	_add_stat("Units", str(player_stats.get("units", 0)))
	_add_stat("Technologies", str(player_stats.get("techs", 0)))
	_add_stat("Turns Played", str(player_stats.get("turns", 0)))

	# Additional victory-specific stats
	if is_victory:
		if player_stats.has("enemies_defeated"):
			_add_stat("Enemies Defeated", str(player_stats.get("enemies_defeated", 0)))
		if player_stats.has("cities_conquered"):
			_add_stat("Cities Conquered", str(player_stats.get("cities_conquered", 0)))


func _add_stat(label_text: String, value: String) -> void:
	var hbox := HBoxContainer.new()

	var lbl := Label.new()
	lbl.text = label_text + ":"
	lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lbl.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))

	var val := Label.new()
	val.text = value
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	val.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0))

	hbox.add_child(lbl)
	hbox.add_child(val)
	stats_container.add_child(hbox)


func _format_number(num: int) -> String:
	# Format large numbers with commas
	var s := str(num)
	var result := ""
	var count := 0
	for i in range(s.length() - 1, -1, -1):
		if count > 0 and count % 3 == 0:
			result = "," + result
		result = s[i] + result
		count += 1
	return result


func _victory_type_name(type: String) -> String:
	match type.to_lower():
		"domination": return "DOMINATION"
		"science": return "SCIENCE"
		"culture": return "CULTURAL"
		"diplomatic": return "DIPLOMATIC"
		"time": return "TIME"
		"score": return "SCORE"
		_: return type.to_upper() if not type.is_empty() else "TOTAL"


func _play_entrance_animation() -> void:
	_reset_animation_state()

	if entrance_tween:
		entrance_tween.kill()

	entrance_tween = create_tween()
	entrance_tween.set_parallel(false)

	# Fade in overlay
	entrance_tween.tween_property(overlay, "modulate:a", 1.0, 0.3)

	# Scale and fade in panel
	entrance_tween.set_parallel(true)
	entrance_tween.tween_property(panel, "modulate:a", 1.0, 0.3)
	entrance_tween.tween_property(panel, "scale", Vector2(1.0, 1.0), 0.4).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)

	# Fade in banner with bounce
	entrance_tween.set_parallel(false)
	entrance_tween.tween_property(banner_label, "modulate:a", 1.0, 0.2)

	# Add a slight pulse to banner for victory
	if is_victory:
		entrance_tween.tween_property(banner_label, "scale", Vector2(1.15, 1.15), 0.15).from(Vector2(1.0, 1.0))
		entrance_tween.tween_property(banner_label, "scale", Vector2(1.0, 1.0), 0.15)

	# Fade in message
	entrance_tween.tween_property(message_label, "modulate:a", 1.0, 0.2)

	# Fade in stats
	entrance_tween.tween_property(stats_container, "modulate:a", 1.0, 0.3)

	# Fade in buttons
	entrance_tween.set_parallel(true)
	entrance_tween.tween_property(return_button, "modulate:a", 1.0, 0.2)
	entrance_tween.tween_property(again_button, "modulate:a", 1.0, 0.2)


func _on_return_pressed() -> void:
	AudioManager.play("ui_click")
	return_to_menu.emit()


func _on_again_pressed() -> void:
	AudioManager.play("ui_click")
	play_again.emit()


func hide_screen() -> void:
	if entrance_tween:
		entrance_tween.kill()

	var exit_tween := create_tween()
	exit_tween.tween_property(self, "modulate:a", 0.0, 0.3)
	exit_tween.tween_callback(func(): visible = false)
