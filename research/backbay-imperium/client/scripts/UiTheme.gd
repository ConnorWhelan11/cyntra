extends RefCounted
class_name UiTheme

const GRID := 8
const SPACING := {
	"xs": 4,
	"sm": 8,
	"md": 12,
	"lg": 16,
	"xl": 24,
}

const RADIUS := {
	"sm": 6,
	"md": 10,
	"lg": 14,
}

const STROKE := {
	"thin": 1,
	"med": 2,
}

const COLORS := {
	"bg": Color(0.06, 0.08, 0.11),
	"panel": Color(0.13, 0.16, 0.2),
	"panel_alt": Color(0.18, 0.21, 0.27),
	"panel_strong": Color(0.22, 0.26, 0.32),
	"border": Color(0.28, 0.33, 0.41),
	"text": Color(0.93, 0.95, 0.98),
	"muted": Color(0.62, 0.68, 0.76),
	"accent": Color(0.22, 0.72, 0.6),
	"accent_strong": Color(0.3, 0.82, 0.68),
	"warning": Color(0.93, 0.72, 0.32),
	"danger": Color(0.88, 0.36, 0.32),
}

const FONT_BODY := "res://assets/fonts/Montserrat-Regular.ttf"
const FONT_BODY_BOLD := "res://assets/fonts/Montserrat-SemiBold.ttf"
const FONT_HEADING := "res://assets/fonts/Overlock-Bold.ttf"


static func load_fonts() -> Dictionary:
	return {
		"heading": _load_font(FONT_HEADING),
		"body": _load_font(FONT_BODY),
		"body_bold": _load_font(FONT_BODY_BOLD),
	}


static func bb_panel(variant: String = "surface") -> StyleBoxFlat:
	var bg := COLORS["panel"]
	if variant == "alt":
		bg = COLORS["panel_alt"]
	elif variant == "strong":
		bg = COLORS["panel_strong"]
	var box := StyleBoxFlat.new()
	box.bg_color = bg
	box.border_color = COLORS["border"]
	box.set_border_width_all(STROKE["thin"])
	box.set_corner_radius_all(RADIUS["md"])
	box.shadow_color = Color(0.0, 0.0, 0.0, 0.3)
	box.shadow_size = 4
	box.content_margin_left = SPACING["md"]
	box.content_margin_right = SPACING["md"]
	box.content_margin_top = SPACING["sm"]
	box.content_margin_bottom = SPACING["sm"]
	return box


static func bb_button(kind: String = "primary") -> Dictionary:
	var normal := StyleBoxFlat.new()
	var hover := StyleBoxFlat.new()
	var pressed := StyleBoxFlat.new()
	var disabled := StyleBoxFlat.new()
	var radius := RADIUS["sm"]
	var pad_y := SPACING["xs"] + 2

	var bg := COLORS["panel_alt"]
	var border := COLORS["border"]
	var text := COLORS["text"]

	if kind == "primary":
		bg = COLORS["accent"]
		border = COLORS["accent_strong"]
		text = Color(0.07, 0.09, 0.12)
	elif kind == "secondary":
		bg = COLORS["panel_strong"]
		border = COLORS["border"].lightened(0.08)
		text = COLORS["text"]
	elif kind == "ghost":
		bg = COLORS["panel_alt"]
		bg.a = 0.7
		border = COLORS["border"].lightened(0.05)
		text = COLORS["text"]
	elif kind == "danger":
		bg = COLORS["danger"]
		border = COLORS["danger"].lightened(0.1)
		text = Color(0.1, 0.05, 0.05)

	normal.bg_color = bg
	normal.border_color = border
	normal.set_border_width_all(STROKE["thin"])
	normal.set_corner_radius_all(radius)
	normal.content_margin_left = SPACING["md"]
	normal.content_margin_right = SPACING["md"]
	normal.content_margin_top = pad_y
	normal.content_margin_bottom = pad_y

	hover.bg_color = bg.lightened(0.08)
	hover.border_color = border.lightened(0.1)
	hover.set_border_width_all(STROKE["thin"])
	hover.set_corner_radius_all(radius)
	hover.content_margin_left = SPACING["md"]
	hover.content_margin_right = SPACING["md"]
	hover.content_margin_top = pad_y
	hover.content_margin_bottom = pad_y

	pressed.bg_color = bg.darkened(0.08)
	pressed.border_color = border.darkened(0.1)
	pressed.set_border_width_all(STROKE["thin"])
	pressed.set_corner_radius_all(radius)
	pressed.content_margin_left = SPACING["md"]
	pressed.content_margin_right = SPACING["md"]
	pressed.content_margin_top = pad_y
	pressed.content_margin_bottom = pad_y

	disabled.bg_color = bg.darkened(0.2)
	disabled.border_color = border.darkened(0.2)
	disabled.set_border_width_all(STROKE["thin"])
	disabled.set_corner_radius_all(radius)
	disabled.content_margin_left = SPACING["md"]
	disabled.content_margin_right = SPACING["md"]
	disabled.content_margin_top = pad_y
	disabled.content_margin_bottom = pad_y

	if kind == "ghost":
		var hover_bg := COLORS["panel_alt"].lightened(0.05)
		hover_bg.a = 0.85
		hover.bg_color = hover_bg
		var pressed_bg := COLORS["panel_alt"].darkened(0.08)
		pressed_bg.a = 0.9
		pressed.bg_color = pressed_bg

	return {
		"normal": normal,
		"hover": hover,
		"pressed": pressed,
		"disabled": disabled,
		"text": text,
		"text_muted": COLORS["muted"],
	}


static func bb_tab(active: bool = false) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = COLORS["panel_strong"] if active else COLORS["panel"]
	box.border_color = COLORS["accent"] if active else COLORS["border"]
	box.set_border_width_all(STROKE["thin"])
	box.set_corner_radius_all(RADIUS["sm"])
	box.content_margin_left = SPACING["sm"]
	box.content_margin_right = SPACING["sm"]
	box.content_margin_top = SPACING["xs"]
	box.content_margin_bottom = SPACING["xs"]
	return box


static func bb_chip() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = COLORS["panel_strong"]
	box.border_color = COLORS["border"]
	box.set_border_width_all(STROKE["thin"])
	box.set_corner_radius_all(RADIUS["lg"])
	box.content_margin_left = SPACING["sm"]
	box.content_margin_right = SPACING["sm"]
	box.content_margin_top = SPACING["xs"]
	box.content_margin_bottom = SPACING["xs"]
	return box


static func bb_tooltip() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = COLORS["panel_strong"].darkened(0.1)
	box.border_color = COLORS["border"]
	box.set_border_width_all(STROKE["thin"])
	box.set_corner_radius_all(RADIUS["sm"])
	box.shadow_color = Color(0.0, 0.0, 0.0, 0.45)
	box.shadow_size = 8
	box.content_margin_left = SPACING["md"]
	box.content_margin_right = SPACING["md"]
	box.content_margin_top = SPACING["sm"]
	box.content_margin_bottom = SPACING["sm"]
	return box


static func apply_label(label: Label, kind: String, fonts: Dictionary) -> void:
	if kind == "title":
		label.add_theme_font_override("font", fonts["heading"])
		label.add_theme_font_size_override("font_size", 22)
		label.add_theme_color_override("font_color", COLORS["text"])
	elif kind == "heading":
		label.add_theme_font_override("font", fonts["body_bold"])
		label.add_theme_font_size_override("font_size", 16)
		label.add_theme_color_override("font_color", COLORS["text"])
	elif kind == "meta":
		label.add_theme_font_override("font", fonts["body"])
		label.add_theme_font_size_override("font_size", 12)
		label.add_theme_color_override("font_color", COLORS["muted"])
	else:
		label.add_theme_font_override("font", fonts["body"])
		label.add_theme_font_size_override("font_size", 14)
		label.add_theme_color_override("font_color", COLORS["text"])


static func apply_button(button: Button, kind: String, fonts: Dictionary) -> void:
	var styles := bb_button(kind)
	button.add_theme_stylebox_override("normal", styles["normal"])
	button.add_theme_stylebox_override("hover", styles["hover"])
	button.add_theme_stylebox_override("pressed", styles["pressed"])
	button.add_theme_stylebox_override("disabled", styles["disabled"])
	button.add_theme_color_override("font_color", styles["text"])
	button.add_theme_color_override("font_color_hover", styles["text"])
	button.add_theme_color_override("font_color_pressed", styles["text"])
	button.add_theme_color_override("font_color_disabled", styles["text_muted"])
	button.add_theme_font_override("font", fonts["body_bold"])
	button.add_theme_font_size_override("font_size", 13)


static func _load_font(path: String) -> Font:
	if ResourceLoader.exists(path):
		var font: Font = load(path)
		if font != null:
			return font
	return ThemeDB.fallback_font
