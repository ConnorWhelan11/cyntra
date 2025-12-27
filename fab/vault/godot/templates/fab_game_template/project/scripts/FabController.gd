## Cartridge Controller integration for Starknet wallet/session management
##
## Implements proper Cartridge Controller integration with:
## - Session Policies for pre-approved transactions
## - Keychain authentication (Passkeys, social login, etc.)
## - Paymaster support for gasless transactions
## - Proper session management
##
## Reference: https://docs.cartridge.gg/controller/overview
extends Node

signal session_created(address: String, session_id: String)
signal session_expired
signal session_error(error: String)
signal transaction_sent(tx_hash: String)
signal transaction_failed(error: String)
signal connection_pending(keychain_url: String)

@onready var config: Node = get_node("/root/FabDojoConfig")

# Session state
var _session_id: String = ""
var _session_expires: int = 0
var _connection_id: String = ""
var _policies: Dictionary = {}

# Transaction queue
var _tx_queue: Array = []
var _processing_tx: bool = false

# HTTP client
var _http: HTTPRequest

# Membrane bridge URL
const MEMBRANE_URL = "http://localhost:7331"


func _ready() -> void:
	_http = HTTPRequest.new()
	add_child(_http)
	_restore_session()


## Check if we have an active session
func is_connected() -> bool:
	if _session_id.is_empty():
		return false
	if Time.get_unix_time_from_system() >= _session_expires:
		_session_id = ""
		session_expired.emit()
		return false
	return true


## Get the connected wallet address
func get_address() -> String:
	return config.wallet_address


## Get the current session ID
func get_session_id() -> String:
	return _session_id


## Get default session policies for Fab games
func get_default_policies() -> Dictionary:
	return {
		"contracts": {
			config.world_address: {
				"name": "Fab World",
				"description": "Fab game world interactions",
				"methods": [
					{
						"name": "Join World",
						"entrypoint": "join_world",
						"description": "Join the game world"
					},
					{
						"name": "Leave World",
						"entrypoint": "leave_world",
						"description": "Leave the game world"
					},
					{
						"name": "Update Position",
						"entrypoint": "update_player_position",
						"description": "Update player position in real-time"
					},
					{
						"name": "Spawn Asset",
						"entrypoint": "spawn_asset",
						"description": "Place an asset in the world"
					},
					{
						"name": "Despawn Asset",
						"entrypoint": "despawn_asset",
						"description": "Remove an asset from the world"
					},
					{
						"name": "Pickup Item",
						"entrypoint": "pickup_item",
						"description": "Pick up an item into inventory"
					},
					{
						"name": "Drop Item",
						"entrypoint": "drop_item",
						"description": "Drop an item from inventory"
					},
					{
						"name": "Interact",
						"entrypoint": "interact",
						"description": "Interact with objects"
					}
				]
			}
		}
	}


## Connect wallet with Cartridge Controller
##
## Opens the Cartridge keychain for authentication with:
## - Passkey (WebAuthn) - passwordless login
## - Social login (Google, Discord, etc.)
## - External wallets (MetaMask, etc.)
##
## @param custom_policies Optional custom session policies (uses defaults if not provided)
func connect_wallet(custom_policies: Dictionary = {}) -> void:
	_policies = custom_policies if not custom_policies.is_empty() else get_default_policies()

	var callback_url := "http://localhost:8765/controller/callback"

	var request_body := {
		"policies": _policies,
		"chainId": config.chain_id,
		"redirectUrl": callback_url,
		"preset": config.get("controller_preset", "")
	}

	var body := JSON.stringify(request_body)
	var headers := ["Content-Type: application/json"]

	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result: int, response_code: int, _headers: PackedStringArray, body_bytes: PackedByteArray):
		http.queue_free()
		if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
			session_error.emit("Failed to initiate connection")
			return

		var json := JSON.new()
		if json.parse(body_bytes.get_string_from_utf8()) != OK:
			session_error.emit("Invalid response from membrane")
			return

		var data: Dictionary = json.data
		_connection_id = data.get("connectionId", "")
		var keychain_url: String = data.get("keychainUrl", "")

		if keychain_url.is_empty():
			session_error.emit("No keychain URL received")
			return

		# Open keychain in browser
		OS.shell_open(keychain_url)
		connection_pending.emit(keychain_url)

		# Start polling for connection status
		_poll_connection_status()
	)
	http.request(MEMBRANE_URL + "/controller/connect", headers, HTTPClient.METHOD_POST, body)
	config.log_debug("Initiating Controller connection...")


## Disconnect wallet and invalidate session
func disconnect_wallet() -> void:
	if _session_id.is_empty():
		return

	var body := JSON.stringify({"sessionId": _session_id})
	var headers := ["Content-Type: application/json"]

	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(_result: int, _response_code: int, _headers: PackedStringArray, _body_bytes: PackedByteArray):
		http.queue_free()
	)
	http.request(MEMBRANE_URL + "/controller/disconnect", headers, HTTPClient.METHOD_POST, body)

	# Clear local state immediately
	_session_id = ""
	_session_expires = 0
	_connection_id = ""
	config.wallet_address = ""
	config.session_token = ""
	_clear_session()
	session_expired.emit()


## Execute a transaction using the active session
##
## Transactions matching session policies are executed without user approval.
## The Cartridge Paymaster sponsors gas fees for approved transactions.
##
## @param calls Array of contract calls to execute
## @param callback Optional callback with result
func execute(calls: Array, callback: Callable = Callable()) -> void:
	if not is_connected():
		if callback.is_valid():
			callback.call({"error": "No active session"})
		transaction_failed.emit("No active session")
		return

	_tx_queue.append({"calls": calls, "callback": callback})
	_process_tx_queue()


## Join a game world
func join_world(world_id: String, name: String, character_asset_id: String, callback: Callable = Callable()) -> void:
	execute([{
		"contractAddress": config.world_address,
		"entrypoint": "join_world",
		"calldata": [world_id, name, character_asset_id]
	}], callback)


## Update player position (high-frequency, batched)
func update_position(world_id: String, position: Vector3, rotation: Quaternion, callback: Callable = Callable()) -> void:
	var pos := FabDojoClient.vec3_to_fixed(position)
	var rot := _quat_to_fixed(rotation)
	execute([{
		"contractAddress": config.world_address,
		"entrypoint": "update_player_position",
		"calldata": [
			world_id,
			str(pos["x"]), str(pos["y"]), str(pos["z"]),
			str(rot["x"]), str(rot["y"]), str(rot["z"]), str(rot["w"])
		]
	}], callback)


## Spawn an asset in the world
func spawn_asset(world_id: String, asset_id: String, instance_id: String, position: Vector3, rotation: Quaternion, scale: Vector3, metadata: String = "", callback: Callable = Callable()) -> void:
	var pos := FabDojoClient.vec3_to_fixed(position)
	var rot := _quat_to_fixed(rotation)
	var scl := FabDojoClient.vec3_to_fixed(scale)
	execute([{
		"contractAddress": config.world_address,
		"entrypoint": "spawn_asset",
		"calldata": [
			world_id, asset_id, instance_id,
			str(pos["x"]), str(pos["y"]), str(pos["z"]),
			str(rot["x"]), str(rot["y"]), str(rot["z"]), str(rot["w"]),
			str(scl["x"]), str(scl["y"]), str(scl["z"]),
			metadata
		]
	}], callback)


## Pick up an item into inventory
func pickup_item(world_id: String, instance_id: String, slot_index: int, callback: Callable = Callable()) -> void:
	execute([{
		"contractAddress": config.world_address,
		"entrypoint": "pickup_item",
		"calldata": [world_id, instance_id, str(slot_index)]
	}], callback)


## Drop an item from inventory
func drop_item(world_id: String, slot_index: int, position: Vector3, callback: Callable = Callable()) -> void:
	var pos := FabDojoClient.vec3_to_fixed(position)
	execute([{
		"contractAddress": config.world_address,
		"entrypoint": "drop_item",
		"calldata": [world_id, str(slot_index), str(pos["x"]), str(pos["y"]), str(pos["z"])]
	}], callback)


## Leave the current world
func leave_world(world_id: String, callback: Callable = Callable()) -> void:
	execute([{
		"contractAddress": config.world_address,
		"entrypoint": "leave_world",
		"calldata": [world_id]
	}], callback)


## Interact with an object in the world
func interact(world_id: String, target_id: String, action: String, callback: Callable = Callable()) -> void:
	execute([{
		"contractAddress": config.world_address,
		"entrypoint": "interact",
		"calldata": [world_id, target_id, action]
	}], callback)


# ─────────────────────────────────────────────────────────────────────────────
# Private Methods
# ─────────────────────────────────────────────────────────────────────────────

func _process_tx_queue() -> void:
	if _processing_tx or _tx_queue.is_empty():
		return

	_processing_tx = true
	var tx := _tx_queue.pop_front() as Dictionary

	_send_transaction(tx["calls"], func(result: Dictionary):
		_processing_tx = false
		if result.has("error"):
			transaction_failed.emit(result["error"])
		else:
			transaction_sent.emit(result.get("transactionHash", ""))
		if tx["callback"].is_valid():
			tx["callback"].call(result)
		_process_tx_queue()
	)


func _send_transaction(calls: Array, callback: Callable) -> void:
	var request := {
		"sessionId": _session_id,
		"calls": calls
	}

	var body := JSON.stringify(request)
	var headers := ["Content-Type: application/json"]

	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result: int, response_code: int, _headers: PackedStringArray, body_bytes: PackedByteArray):
		http.queue_free()
		if result != HTTPRequest.RESULT_SUCCESS:
			callback.call({"error": "Request failed"})
			return

		var json := JSON.new()
		if json.parse(body_bytes.get_string_from_utf8()) != OK:
			callback.call({"error": "Invalid response"})
			return

		var data: Dictionary = json.data
		if response_code != 200:
			callback.call({"error": data.get("error", "Transaction failed")})
		else:
			callback.call(data)
	)
	http.request(MEMBRANE_URL + "/controller/execute", headers, HTTPClient.METHOD_POST, body)


func _poll_connection_status() -> void:
	if _connection_id.is_empty():
		return

	var timer := Timer.new()
	add_child(timer)
	timer.wait_time = 2.0
	timer.one_shot = false
	var attempts := 0

	timer.timeout.connect(func():
		attempts += 1
		if attempts > 150:  # 5 minutes timeout
			timer.stop()
			timer.queue_free()
			session_error.emit("Connection timeout")
			return

		# Check session status
		var http := HTTPRequest.new()
		add_child(http)
		http.request_completed.connect(func(result: int, response_code: int, _headers: PackedStringArray, body_bytes: PackedByteArray):
			http.queue_free()
			if result != HTTPRequest.RESULT_SUCCESS:
				return

			var json := JSON.new()
			if json.parse(body_bytes.get_string_from_utf8()) != OK:
				return

			var data: Dictionary = json.data
			if data.get("valid", false):
				timer.stop()
				timer.queue_free()
				_handle_session_created(data)
		)

		# Try to find session by checking recent sessions
		# In production, the callback would directly create the session
		http.request(MEMBRANE_URL + "/controller/status/" + _connection_id)
	)
	timer.start()


func _handle_session_created(data: Dictionary) -> void:
	_session_id = data.get("sessionId", data.get("session_id", ""))
	config.wallet_address = data.get("address", "")
	_session_expires = Time.get_unix_time_from_system() + 86400  # 24 hours

	_save_session()
	session_created.emit(config.wallet_address, _session_id)
	config.log_debug("Session created for: " + config.wallet_address)


func _quat_to_fixed(q: Quaternion) -> Dictionary:
	return {
		"x": int(q.x * 1e18),
		"y": int(q.y * 1e18),
		"z": int(q.z * 1e18),
		"w": int(q.w * 1e18)
	}


func _save_session() -> void:
	var file := FileAccess.open("user://fab_controller_session.json", FileAccess.WRITE)
	if file == null:
		return

	var data := {
		"session_id": _session_id,
		"session_expires": _session_expires,
		"wallet_address": config.wallet_address,
		"policies": _policies
	}
	file.store_string(JSON.stringify(data))
	file.close()


func _restore_session() -> void:
	if not FileAccess.file_exists("user://fab_controller_session.json"):
		return

	var file := FileAccess.open("user://fab_controller_session.json", FileAccess.READ)
	if file == null:
		return

	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK:
		file.close()
		return

	var data: Dictionary = json.data
	_session_id = data.get("session_id", "")
	_session_expires = data.get("session_expires", 0)
	config.wallet_address = data.get("wallet_address", "")
	_policies = data.get("policies", {})
	file.close()

	if is_connected():
		# Validate session with server
		_validate_session()
	else:
		_session_id = ""


func _validate_session() -> void:
	if _session_id.is_empty():
		return

	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result: int, response_code: int, _headers: PackedStringArray, body_bytes: PackedByteArray):
		http.queue_free()
		if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
			_session_id = ""
			session_expired.emit()
			return

		var json := JSON.new()
		if json.parse(body_bytes.get_string_from_utf8()) != OK:
			return

		var data: Dictionary = json.data
		if data.get("valid", false):
			session_created.emit(config.wallet_address, _session_id)
		else:
			_session_id = ""
			session_expired.emit()
	)
	http.request(MEMBRANE_URL + "/controller/session/" + _session_id)


func _clear_session() -> void:
	if FileAccess.file_exists("user://fab_controller_session.json"):
		DirAccess.remove_absolute("user://fab_controller_session.json")
