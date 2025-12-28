extends Window
class_name CityNameDialog

## Dialog for naming a new city when founding.

signal city_name_confirmed(name: String)
signal cancelled()

@onready var name_input: LineEdit = $VBox/NameInput
@onready var confirm_button: Button = $VBox/Buttons/ConfirmButton
@onready var cancel_button: Button = $VBox/Buttons/CancelButton
@onready var error_label: Label = $VBox/ErrorLabel

var default_names: Array[String] = [
	"New Haven", "Riverside", "Oakdale", "Mountainview", "Lakeside",
	"Greenfield", "Westbrook", "Eastgate", "Northpoint", "Southbay",
	"Ironforge", "Goldshore", "Silverton", "Copperhill", "Bronzewood",
	"Starfall", "Moonrise", "Sundale", "Cloudpeak", "Stormwatch"
]
var name_index := 0


func _ready() -> void:
	confirm_button.pressed.connect(_on_confirm_pressed)
	cancel_button.pressed.connect(_on_cancel_pressed)
	name_input.text_submitted.connect(_on_text_submitted)
	close_requested.connect(_on_cancel_pressed)

	# Generate a random default name
	name_index = randi() % default_names.size()
	name_input.text = default_names[name_index]
	error_label.text = ""


func _on_confirm_pressed() -> void:
	var city_name := name_input.text.strip_edges()
	if city_name.is_empty():
		error_label.text = "Please enter a city name"
		return
	if city_name.length() > 20:
		error_label.text = "Name too long (max 20 characters)"
		return

	city_name_confirmed.emit(city_name)
	hide()


func _on_cancel_pressed() -> void:
	cancelled.emit()
	hide()


func _on_text_submitted(text: String) -> void:
	_on_confirm_pressed()


func suggest_next_name() -> void:
	name_index = (name_index + 1) % default_names.size()
	name_input.text = default_names[name_index]


func open() -> void:
	error_label.text = ""
	popup_centered()
	name_input.grab_focus()
	name_input.select_all()
