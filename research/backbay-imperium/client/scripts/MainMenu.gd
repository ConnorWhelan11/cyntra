extends Control
class_name MainMenu

## Main menu for Backbay Imperium.
## Allows starting local games or joining multiplayer.

signal start_local_game()
signal start_multiplayer()
signal quit_game()


func _ready() -> void:
	$VBox/LocalGameButton.pressed.connect(_on_local_game)
	$VBox/MultiplayerButton.pressed.connect(_on_multiplayer)
	$VBox/QuitButton.pressed.connect(_on_quit)


func _on_local_game() -> void:
	start_local_game.emit()


func _on_multiplayer() -> void:
	start_multiplayer.emit()


func _on_quit() -> void:
	quit_game.emit()
	get_tree().quit()
