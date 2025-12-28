extends Control
class_name LobbyUI

## Lobby UI for multiplayer game setup.
## Handles connection, player list, ready states, and game start.

signal game_started()
signal back_to_menu()

@export var network_client_path: NodePath

@onready var network: NetworkClient = get_node(network_client_path) if network_client_path else null

# UI Elements (set via @onready or @export)
@onready var connection_panel: Control = $ConnectionPanel
@onready var lobby_panel: Control = $LobbyPanel
@onready var host_input: LineEdit = $ConnectionPanel/VBox/HostInput
@onready var port_input: SpinBox = $ConnectionPanel/VBox/PortInput
@onready var name_input: LineEdit = $ConnectionPanel/VBox/NameInput
@onready var connect_button: Button = $ConnectionPanel/VBox/ConnectButton
@onready var status_label: Label = $ConnectionPanel/VBox/StatusLabel

@onready var player_list: ItemList = $LobbyPanel/VBox/PlayerList
@onready var ready_button: Button = $LobbyPanel/VBox/HBox/ReadyButton
@onready var start_button: Button = $LobbyPanel/VBox/HBox/StartButton
@onready var leave_button: Button = $LobbyPanel/VBox/HBox/LeaveButton
@onready var chat_display: RichTextLabel = $LobbyPanel/VBox/ChatDisplay
@onready var chat_input: LineEdit = $LobbyPanel/VBox/ChatInput
@onready var lobby_status: Label = $LobbyPanel/VBox/LobbyStatus
@onready var map_size_input: SpinBox = $LobbyPanel/VBox/MapSizeInput

var is_ready: bool = false


func _ready() -> void:
	# Set defaults
	if host_input:
		host_input.text = "127.0.0.1"
	if port_input:
		port_input.value = 7777
	if name_input:
		name_input.text = "Player"
	if map_size_input:
		map_size_input.value = 64
		map_size_input.min_value = 32
		map_size_input.max_value = 128
		map_size_input.step = 16

	# Connect UI signals
	if connect_button:
		connect_button.pressed.connect(_on_connect_pressed)
	if ready_button:
		ready_button.pressed.connect(_on_ready_pressed)
	if start_button:
		start_button.pressed.connect(_on_start_pressed)
	if leave_button:
		leave_button.pressed.connect(_on_leave_pressed)
	if chat_input:
		chat_input.text_submitted.connect(_on_chat_submitted)

	# Connect network signals
	if network:
		network.connected.connect(_on_network_connected)
		network.disconnected.connect(_on_network_disconnected)
		network.join_accepted.connect(_on_join_accepted)
		network.join_rejected.connect(_on_join_rejected)
		network.lobby_updated.connect(_on_lobby_updated)
		network.player_ready_changed.connect(_on_player_ready_changed)
		network.game_starting.connect(_on_game_starting)
		network.chat_received.connect(_on_chat_received)
		network.player_connected.connect(_on_player_connected)
		network.player_disconnected.connect(_on_player_disconnected)

	# Initial UI state
	_show_connection_panel()


func _show_connection_panel() -> void:
	if connection_panel:
		connection_panel.visible = true
	if lobby_panel:
		lobby_panel.visible = false
	if status_label:
		status_label.text = ""


func _show_lobby_panel() -> void:
	if connection_panel:
		connection_panel.visible = false
	if lobby_panel:
		lobby_panel.visible = true
	_update_lobby_ui()


func _update_lobby_ui() -> void:
	if not network:
		return

	# Update player list
	if player_list:
		player_list.clear()
		for p in network.players:
			var pid: int = p.get("player_id", -1)
			var pname: String = p.get("name", "Unknown")
			var ready: bool = p.get("ready", false)
			var is_host_player: bool = p.get("is_host", false)

			var status := ""
			if is_host_player:
				status = "[HOST] "
			if ready:
				status += "[READY] "

			var is_me := (pid == network.player_id)
			var display := "%s%s%s" % [status, pname, " (You)" if is_me else ""]
			player_list.add_item(display)

	# Update buttons
	if ready_button:
		ready_button.text = "Not Ready" if is_ready else "Ready"
		ready_button.disabled = false

	if start_button:
		start_button.visible = network.is_host
		var can_start := _can_start_game()
		start_button.disabled = not can_start

	if map_size_input:
		map_size_input.visible = network.is_host
		map_size_input.editable = network.is_host

	# Update status
	if lobby_status:
		var ready_count := 0
		for p in network.players:
			if p.get("ready", false):
				ready_count += 1
		lobby_status.text = "Players: %d | Ready: %d | Latency: %d ms" % [
			network.players.size(),
			ready_count,
			network.latency_ms
		]


func _can_start_game() -> bool:
	if not network or not network.is_host:
		return false

	# All players must be ready
	for p in network.players:
		if not p.get("ready", false):
			return false

	return network.players.size() >= 2


func _add_chat_message(from_name: String, message: String) -> void:
	if chat_display:
		chat_display.append_text("[%s] %s\n" % [from_name, message])


# UI Event Handlers

func _on_connect_pressed() -> void:
	if not network or not network.is_available():
		if status_label:
			status_label.text = "Multiplayer not available"
		return

	var host := host_input.text if host_input else "127.0.0.1"
	var port := int(port_input.value) if port_input else 7777
	var player_name := name_input.text if name_input else "Player"

	if player_name.is_empty():
		player_name = "Player"

	if status_label:
		status_label.text = "Connecting to %s:%d..." % [host, port]

	if connect_button:
		connect_button.disabled = true

	if not network.connect_to_server(host, port, player_name):
		if status_label:
			status_label.text = "Failed to connect"
		if connect_button:
			connect_button.disabled = false


func _on_ready_pressed() -> void:
	if network:
		is_ready = not is_ready
		network.set_ready(is_ready)
		_update_lobby_ui()


func _on_start_pressed() -> void:
	if network and network.is_host:
		var map_size := int(map_size_input.value) if map_size_input else 64
		network.start_game(map_size)


func _on_leave_pressed() -> void:
	if network:
		network.disconnect_from_server()
	is_ready = false
	_show_connection_panel()
	back_to_menu.emit()


func _on_chat_submitted(text: String) -> void:
	if network and not text.is_empty():
		network.send_chat(text)
		if chat_input:
			chat_input.text = ""


# Network Event Handlers

func _on_network_connected() -> void:
	if status_label:
		status_label.text = "Connected, joining..."


func _on_network_disconnected(reason: String) -> void:
	if status_label:
		status_label.text = "Disconnected: %s" % reason
	if connect_button:
		connect_button.disabled = false
	is_ready = false
	_show_connection_panel()


func _on_join_accepted(player_id: int, _token: String) -> void:
	_add_chat_message("System", "Joined as Player %d" % player_id)
	_show_lobby_panel()


func _on_join_rejected(reason: String) -> void:
	if status_label:
		status_label.text = "Join rejected: %s" % reason
	if connect_button:
		connect_button.disabled = false


func _on_lobby_updated(_players: Array, _host_id: int, _min_p: int, _max_p: int) -> void:
	_update_lobby_ui()


func _on_player_ready_changed(player_id: int, ready: bool) -> void:
	var name := network.get_player_name(player_id) if network else "Player %d" % player_id
	_add_chat_message("System", "%s is %s" % [name, "ready" if ready else "not ready"])
	_update_lobby_ui()


func _on_game_starting(countdown_ms: int) -> void:
	if countdown_ms > 0:
		_add_chat_message("System", "Game starting in %d seconds..." % (countdown_ms / 1000))
	else:
		_add_chat_message("System", "Game starting!")
	game_started.emit()


func _on_chat_received(from_player: int, message: String) -> void:
	var name := network.get_player_name(from_player) if network else "Player %d" % from_player
	_add_chat_message(name, message)


func _on_player_connected(player_id: int, name: String) -> void:
	_add_chat_message("System", "%s joined the lobby" % name)


func _on_player_disconnected(player_id: int, ai_takeover: bool) -> void:
	var name := network.get_player_name(player_id) if network else "Player %d" % player_id
	if ai_takeover:
		_add_chat_message("System", "%s disconnected (AI taking over)" % name)
	else:
		_add_chat_message("System", "%s left the lobby" % name)
	_update_lobby_ui()
