## Dojo client for querying game state via Torii GraphQL
extends Node

signal connected
signal disconnected
signal player_updated(player_data: Dictionary)
signal asset_spawned(instance_data: Dictionary)
signal asset_despawned(world_id: String, instance_id: String)
signal world_state_changed(world_data: Dictionary)

@onready var config: Node = get_node("/root/FabDojoConfig")

var _http: HTTPRequest
var _ws: WebSocketPeer
var _ws_connected: bool = false


func _ready() -> void:
	_http = HTTPRequest.new()
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)


func _process(_delta: float) -> void:
	if _ws != null:
		_ws.poll()
		var state := _ws.get_ready_state()
		if state == WebSocketPeer.STATE_OPEN:
			if not _ws_connected:
				_ws_connected = true
				connected.emit()
			while _ws.get_available_packet_count() > 0:
				var packet := _ws.get_packet()
				_handle_ws_message(packet.get_string_from_utf8())
		elif state == WebSocketPeer.STATE_CLOSED:
			if _ws_connected:
				_ws_connected = false
				disconnected.emit()


func connect_realtime() -> void:
	if _ws != null:
		_ws.close()
	_ws = WebSocketPeer.new()
	var err := _ws.connect_to_url(config.torii_ws_url, TLSOptions.client())
	if err != OK:
		push_error("Failed to connect to Torii WebSocket: ", err)


func disconnect_realtime() -> void:
	if _ws != null:
		_ws.close()
		_ws = null
		_ws_connected = false


func subscribe_player(world_id: String, player_address: String) -> void:
	if not _ws_connected:
		push_warning("WebSocket not connected")
		return
	var query := """subscription { playerModels(where: { world_id: "%s", address: "%s" }) { world_id address name position { x y z } rotation { x y z w } health online } }""" % [world_id, player_address]
	_ws.send_text(JSON.stringify({"type": "subscribe", "payload": {"query": query}}))


func subscribe_assets(world_id: String) -> void:
	if not _ws_connected:
		push_warning("WebSocket not connected")
		return
	var query := """subscription { assetInstanceModels(where: { world_id: "%s", active: true }) { world_id instance_id asset_id position { x y z } rotation { x y z w } scale { x y z } active } }""" % world_id
	_ws.send_text(JSON.stringify({"type": "subscribe", "payload": {"query": query}}))


func get_asset(asset_id: String, callback: Callable) -> void:
	var query := """query { assetModels(where: { asset_id: "%s" }) { edges { node { asset_id ipfs_cid attestation_uid category quality creator name description version } } } }""" % asset_id
	_execute_query(query, func(result: Dictionary):
		var edges = result.get("data", {}).get("assetModels", {}).get("edges", [])
		callback.call(edges[0]["node"] if edges.size() > 0 else {})
	)


func get_world_instances(world_id: String, callback: Callable) -> void:
	var query := """query { assetInstanceModels(where: { world_id: "%s", active: true }, first: 1000) { edges { node { world_id instance_id asset_id position { x y z } rotation { x y z w } scale { x y z } owner metadata } } } }""" % world_id
	_execute_query(query, func(result: Dictionary):
		var edges = result.get("data", {}).get("assetInstanceModels", {}).get("edges", [])
		var instances: Array = []
		for edge in edges:
			instances.append(edge["node"])
		callback.call(instances)
	)


func get_player(world_id: String, address: String, callback: Callable) -> void:
	var query := """query { playerModels(where: { world_id: "%s", address: "%s" }) { edges { node { world_id address name position { x y z } rotation { x y z w } character_asset_id health last_active online } } } }""" % [world_id, address]
	_execute_query(query, func(result: Dictionary):
		var edges = result.get("data", {}).get("playerModels", {}).get("edges", [])
		callback.call(edges[0]["node"] if edges.size() > 0 else {})
	)


func get_online_players(world_id: String, callback: Callable) -> void:
	var query := """query { playerModels(where: { world_id: "%s", online: true }, first: 100) { edges { node { world_id address name position { x y z } rotation { x y z w } character_asset_id health } } } }""" % world_id
	_execute_query(query, func(result: Dictionary):
		var edges = result.get("data", {}).get("playerModels", {}).get("edges", [])
		var players: Array = []
		for edge in edges:
			players.append(edge["node"])
		callback.call(players)
	)


func get_inventory(world_id: String, player_address: String, callback: Callable) -> void:
	var query := """query { inventorySlotModels(where: { world_id: "%s", player: "%s" }, first: 100) { edges { node { player world_id slot_index asset_id quantity data } } } }""" % [world_id, player_address]
	_execute_query(query, func(result: Dictionary):
		var edges = result.get("data", {}).get("inventorySlotModels", {}).get("edges", [])
		var slots: Array = []
		for edge in edges:
			slots.append(edge["node"])
		callback.call(slots)
	)


func _execute_query(query: String, callback: Callable) -> void:
	var body := JSON.stringify({"query": query})
	var headers := ["Content-Type: application/json"]
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result: int, response_code: int, _headers: PackedStringArray, body_bytes: PackedByteArray):
		http.queue_free()
		if result != HTTPRequest.RESULT_SUCCESS:
			callback.call({})
			return
		var json := JSON.new()
		if json.parse(body_bytes.get_string_from_utf8()) != OK:
			callback.call({})
			return
		callback.call(json.data)
	)
	http.request(config.torii_url, headers, HTTPClient.METHOD_POST, body)


func _handle_ws_message(text: String) -> void:
	var json := JSON.new()
	if json.parse(text) != OK:
		return
	var msg: Dictionary = json.data
	var msg_type: String = msg.get("type", "")
	var payload: Dictionary = msg.get("payload", {})
	if msg_type == "data":
		_handle_subscription_data(payload.get("data", {}))


func _handle_subscription_data(data: Dictionary) -> void:
	if data.has("playerModels"):
		player_updated.emit(data["playerModels"])
	if data.has("assetInstanceModels"):
		var instance := data["assetInstanceModels"] as Dictionary
		if instance.get("active", false):
			asset_spawned.emit(instance)
		else:
			asset_despawned.emit(instance.get("world_id", ""), instance.get("instance_id", ""))
	if data.has("worldMetaModels"):
		world_state_changed.emit(data["worldMetaModels"])


func _on_request_completed(_result: int, _response_code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	pass


static func vec3_from_fixed(data: Dictionary) -> Vector3:
	const SCALE := 1e18
	return Vector3(float(data.get("x", 0)) / SCALE, float(data.get("y", 0)) / SCALE, float(data.get("z", 0)) / SCALE)


static func quat_from_fixed(data: Dictionary) -> Quaternion:
	const SCALE := 1e18
	return Quaternion(float(data.get("x", 0)) / SCALE, float(data.get("y", 0)) / SCALE, float(data.get("z", 0)) / SCALE, float(data.get("w", SCALE)) / SCALE)


static func vec3_to_fixed(v: Vector3) -> Dictionary:
	const SCALE := 1e18
	return {"x": int(v.x * SCALE), "y": int(v.y * SCALE), "z": int(v.z * SCALE)}
