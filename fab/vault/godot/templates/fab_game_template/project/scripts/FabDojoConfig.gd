## Configuration for Dojo/Starknet integration
## Add this as an autoload: Project > Project Settings > Autoload
extends Node

## Torii GraphQL endpoint (indexer)
@export var torii_url: String = "http://localhost:8080/graphql"

## Torii WebSocket endpoint for subscriptions
@export var torii_ws_url: String = "ws://localhost:8080/graphql"

## Katana RPC endpoint (local sequencer)
@export var rpc_url: String = "http://localhost:5050"

## Dojo world address (set after deployment)
@export var world_address: String = ""

## Cartridge Controller URL
@export var controller_url: String = "https://x.cartridge.gg"

## Starknet chain ID (SN_MAIN or SN_SEPOLIA)
@export var chain_id: String = "SN_SEPOLIA"

## Controller theme preset (optional)
@export var controller_preset: String = ""

## Enable debug logging
@export var debug: bool = true

## Current world ID for gameplay
var current_world_id: String = ""

## Connected wallet address
var wallet_address: String = ""

## Session token from Controller
var session_token: String = ""


func _ready() -> void:
	_load_config()


func _load_config() -> void:
	var config_path := "user://dojo_config.json"
	if FileAccess.file_exists(config_path):
		var file := FileAccess.open(config_path, FileAccess.READ)
		var json := JSON.new()
		if json.parse(file.get_as_text()) == OK:
			var data: Dictionary = json.data
			if data.has("torii_url"):
				torii_url = data["torii_url"]
			if data.has("rpc_url"):
				rpc_url = data["rpc_url"]
			if data.has("world_address"):
				world_address = data["world_address"]
			if data.has("controller_url"):
				controller_url = data["controller_url"]
			if data.has("chain_id"):
				chain_id = data["chain_id"]
			if data.has("controller_preset"):
				controller_preset = data["controller_preset"]
		file.close()

	if OS.has_environment("DOJO_TORII_URL"):
		torii_url = OS.get_environment("DOJO_TORII_URL")
	if OS.has_environment("DOJO_RPC_URL"):
		rpc_url = OS.get_environment("DOJO_RPC_URL")
	if OS.has_environment("DOJO_WORLD_ADDRESS"):
		world_address = OS.get_environment("DOJO_WORLD_ADDRESS")


func save_config() -> void:
	var config_path := "user://dojo_config.json"
	var file := FileAccess.open(config_path, FileAccess.WRITE)
	var data := {
		"torii_url": torii_url,
		"rpc_url": rpc_url,
		"world_address": world_address,
		"controller_url": controller_url,
		"chain_id": chain_id,
		"controller_preset": controller_preset,
	}
	file.store_string(JSON.stringify(data, "\t"))
	file.close()


func log_debug(msg: String) -> void:
	if debug:
		print("[FabDojo] ", msg)
