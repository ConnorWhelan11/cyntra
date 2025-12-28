extends Node
class_name GameManager

## Game manager that handles scene transitions.
## Switches between main menu, lobby, and game.

enum GameMode { MENU, LOBBY, LOCAL_GAME, MULTIPLAYER_GAME }

var current_mode: GameMode = GameMode.MENU
var current_scene: Node = null

const MENU_SCENE = preload("res://scenes/MainMenu.tscn")
const LOBBY_SCENE = preload("res://scenes/Lobby.tscn")
const GAME_SCENE = preload("res://scenes/Game.tscn")
const MULTIPLAYER_GAME_SCENE = preload("res://scenes/MultiplayerGame.tscn")

# Connection info for multiplayer (passed from lobby)
var mp_host: String = ""
var mp_port: int = 7777
var mp_player_name: String = ""


func _ready() -> void:
	_show_menu()


func _show_menu() -> void:
	_clear_current_scene()
	current_mode = GameMode.MENU

	var menu = MENU_SCENE.instantiate()
	menu.start_local_game.connect(_on_start_local_game)
	menu.start_multiplayer.connect(_on_start_multiplayer)
	add_child(menu)
	current_scene = menu


func _show_lobby() -> void:
	_clear_current_scene()
	current_mode = GameMode.LOBBY

	var lobby = LOBBY_SCENE.instantiate()
	lobby.game_started.connect(_on_multiplayer_game_started.bind(lobby))
	lobby.back_to_menu.connect(_show_menu)
	add_child(lobby)
	current_scene = lobby


func _show_local_game() -> void:
	_clear_current_scene()
	current_mode = GameMode.LOCAL_GAME

	if ResourceLoader.exists("res://scenes/Game.tscn"):
		var game = GAME_SCENE.instantiate()
		add_child(game)
		current_scene = game
	else:
		# Fallback to old Main scene structure for local games
		_show_legacy_game()


func _show_legacy_game() -> void:
	# Load the original game components directly
	var game_root = Node.new()
	game_root.name = "Game"

	var game_client_script = load("res://scripts/GameClient.gd")
	var game_client = Node.new()
	game_client.name = "GameClient"
	game_client.set_script(game_client_script)
	game_root.add_child(game_client)

	var map_view_script = load("res://scripts/MapView.gd")
	var map_view = Node2D.new()
	map_view.name = "MapView"
	map_view.set_script(map_view_script)
	map_view.set("client_path", NodePath("../GameClient"))
	game_root.add_child(map_view)

	var ui_layer = CanvasLayer.new()
	ui_layer.name = "UI"
	game_root.add_child(ui_layer)

	var info_label = Label.new()
	info_label.name = "InfoLabel"
	info_label.position = Vector2(16, 16)
	info_label.size = Vector2(724, 204)
	info_label.text = "Loading..."
	info_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	ui_layer.add_child(info_label)

	var back_button = Button.new()
	back_button.name = "BackButton"
	back_button.text = "Back to Menu"
	back_button.position = Vector2(16, 680)
	back_button.pressed.connect(_show_menu)
	ui_layer.add_child(back_button)

	add_child(game_root)
	current_scene = game_root

	# Initialize the game
	await get_tree().process_frame
	if game_client.has_method("new_game"):
		game_client.new_game(10, 2)


func _show_multiplayer_game(lobby: Node) -> void:
	# Extract connection info from lobby before clearing it
	var lobby_ui := lobby as LobbyUI
	if lobby_ui and lobby_ui.network:
		mp_host = lobby_ui.host_input.text if lobby_ui.host_input else "127.0.0.1"
		mp_port = int(lobby_ui.port_input.value) if lobby_ui.port_input else 7777
		mp_player_name = lobby_ui.name_input.text if lobby_ui.name_input else "Player"

	var player_id := -1
	if lobby_ui and lobby_ui.network:
		player_id = lobby_ui.network.player_id

	_clear_current_scene()
	current_mode = GameMode.MULTIPLAYER_GAME

	# Instantiate the multiplayer game scene
	var game: MultiplayerGame = MULTIPLAYER_GAME_SCENE.instantiate()

	# Connect signals for returning to menu
	game.return_to_lobby.connect(_on_return_from_game)
	game.game_over.connect(_on_game_over)

	add_child(game)
	current_scene = game

	# Start the game with connection info
	await get_tree().process_frame
	game.start_game(mp_host, mp_port, player_id, mp_player_name)


func _on_return_from_game() -> void:
	_show_menu()


func _on_game_over(winner_id: int) -> void:
	# Could show a game over screen here
	print("Game over! Winner: Player %d" % winner_id)
	# For now, just go back to menu after a delay
	await get_tree().create_timer(3.0).timeout
	_show_menu()


func _clear_current_scene() -> void:
	if current_scene:
		current_scene.queue_free()
		current_scene = null


func _on_start_local_game() -> void:
	_show_local_game()


func _on_start_multiplayer() -> void:
	_show_lobby()


func _on_multiplayer_game_started(lobby: Node) -> void:
	_show_multiplayer_game(lobby)
