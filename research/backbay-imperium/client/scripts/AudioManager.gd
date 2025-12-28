extends Node

## AudioManager singleton for game sound effects.
## Provides pooled audio playback with volume control per bus.

const SOUNDS_PATH := "res://assets/audio/"

# Sound pools for concurrent playback
var _sound_pools: Dictionary = {}  # sound_id -> Array[AudioStreamPlayer]
const POOL_SIZE := 3  # Max concurrent instances per sound

# Volume settings (0.0 to 1.0)
var master_volume := 1.0
var sfx_volume := 0.8
var music_volume := 0.5
var ui_volume := 0.7

# Sound definitions: file, volume_db, bus
var SOUNDS: Dictionary = {
	# UI sounds
	"ui_click": {"file": "ui_click.ogg", "volume": -6.0, "bus": "UI"},
	"ui_open": {"file": "ui_open.ogg", "volume": -8.0, "bus": "UI"},
	"ui_close": {"file": "ui_close.ogg", "volume": -10.0, "bus": "UI"},
	"ui_error": {"file": "ui_error.ogg", "volume": -4.0, "bus": "UI"},

	# Unit sounds
	"unit_select": {"file": "unit_select.ogg", "volume": -8.0, "bus": "SFX"},
	"unit_move": {"file": "unit_move.ogg", "volume": -10.0, "bus": "SFX"},
	"unit_move_complete": {"file": "unit_move_complete.ogg", "volume": -12.0, "bus": "SFX"},

	# Combat sounds
	"attack_melee": {"file": "attack_melee.ogg", "volume": -4.0, "bus": "SFX"},
	"attack_ranged": {"file": "attack_ranged.ogg", "volume": -6.0, "bus": "SFX"},
	"attack_siege": {"file": "attack_siege.ogg", "volume": -4.0, "bus": "SFX"},
	"unit_death": {"file": "unit_death.ogg", "volume": -3.0, "bus": "SFX"},
	"unit_damaged": {"file": "unit_damaged.ogg", "volume": -6.0, "bus": "SFX"},

	# City sounds
	"city_founded": {"file": "city_founded.ogg", "volume": -4.0, "bus": "SFX"},
	"city_captured": {"file": "city_captured.ogg", "volume": -2.0, "bus": "SFX"},
	"production_complete": {"file": "production_complete.ogg", "volume": -6.0, "bus": "SFX"},

	# Game event sounds
	"turn_start": {"file": "turn_start.ogg", "volume": -4.0, "bus": "SFX"},
	"turn_end": {"file": "turn_end.ogg", "volume": -8.0, "bus": "SFX"},
	"tech_complete": {"file": "tech_complete.ogg", "volume": -4.0, "bus": "SFX"},
	"victory": {"file": "victory.ogg", "volume": 0.0, "bus": "Music"},
	"defeat": {"file": "defeat.ogg", "volume": 0.0, "bus": "Music"},
}

# Track which sounds failed to load (avoid spam)
var _missing_sounds: Dictionary = {}


func _ready() -> void:
	_setup_audio_buses()
	_preload_sounds()
	_apply_volume_settings()


func _setup_audio_buses() -> void:
	# Create audio buses if they don't exist
	if AudioServer.get_bus_index("SFX") == -1:
		var idx := AudioServer.bus_count
		AudioServer.add_bus()
		AudioServer.set_bus_name(idx, "SFX")
		AudioServer.set_bus_send(idx, "Master")

	if AudioServer.get_bus_index("UI") == -1:
		var idx := AudioServer.bus_count
		AudioServer.add_bus()
		AudioServer.set_bus_name(idx, "UI")
		AudioServer.set_bus_send(idx, "Master")

	if AudioServer.get_bus_index("Music") == -1:
		var idx := AudioServer.bus_count
		AudioServer.add_bus()
		AudioServer.set_bus_name(idx, "Music")
		AudioServer.set_bus_send(idx, "Master")


func _preload_sounds() -> void:
	for sound_id in SOUNDS.keys():
		var def: Dictionary = SOUNDS[sound_id]
		var path: String = SOUNDS_PATH + String(def["file"])

		if ResourceLoader.exists(path):
			var stream := load(path) as AudioStream
			if stream:
				_create_sound_pool(sound_id, stream, def)
			else:
				_missing_sounds[sound_id] = true
		else:
			_missing_sounds[sound_id] = true


func _create_sound_pool(sound_id: String, stream: AudioStream, def: Dictionary) -> void:
	_sound_pools[sound_id] = []
	for i in range(POOL_SIZE):
		var player := AudioStreamPlayer.new()
		player.stream = stream
		player.volume_db = def.get("volume", 0.0)
		player.bus = def.get("bus", "Master")
		add_child(player)
		_sound_pools[sound_id].append(player)


## Play a sound effect by ID. Optional pitch_variation adds randomness.
func play(sound_id: String, pitch_variation: float = 0.0) -> void:
	if _missing_sounds.has(sound_id):
		return  # Silently skip missing sounds

	if not _sound_pools.has(sound_id):
		if not _missing_sounds.has(sound_id):
			push_warning("AudioManager: Unknown sound '%s'" % sound_id)
			_missing_sounds[sound_id] = true
		return

	var pool: Array = _sound_pools[sound_id]

	# Find available player
	for player in pool:
		if not player.playing:
			if pitch_variation > 0.0:
				player.pitch_scale = 1.0 + randf_range(-pitch_variation, pitch_variation)
			else:
				player.pitch_scale = 1.0
			player.play()
			return

	# All players busy, interrupt oldest (first in pool)
	var player: AudioStreamPlayer = pool[0]
	if pitch_variation > 0.0:
		player.pitch_scale = 1.0 + randf_range(-pitch_variation, pitch_variation)
	else:
		player.pitch_scale = 1.0
	player.stop()
	player.play()


## Play sound with 2D positional audio (simplified: just plays normally for now)
func play_at_position(sound_id: String, _global_pos: Vector2, pitch_variation: float = 0.0) -> void:
	play(sound_id, pitch_variation)


## Stop all instances of a sound
func stop(sound_id: String) -> void:
	if not _sound_pools.has(sound_id):
		return
	for player in _sound_pools[sound_id]:
		player.stop()


## Stop all sounds
func stop_all() -> void:
	for sound_id in _sound_pools.keys():
		stop(sound_id)


## Set master volume (affects all buses)
func set_master_volume(vol: float) -> void:
	master_volume = clampf(vol, 0.0, 1.0)
	_apply_volume_settings()


## Set SFX volume
func set_sfx_volume(vol: float) -> void:
	sfx_volume = clampf(vol, 0.0, 1.0)
	_apply_volume_settings()


## Set UI volume
func set_ui_volume(vol: float) -> void:
	ui_volume = clampf(vol, 0.0, 1.0)
	_apply_volume_settings()


## Set Music volume
func set_music_volume(vol: float) -> void:
	music_volume = clampf(vol, 0.0, 1.0)
	_apply_volume_settings()


func _apply_volume_settings() -> void:
	var sfx_idx := AudioServer.get_bus_index("SFX")
	if sfx_idx >= 0:
		AudioServer.set_bus_volume_db(sfx_idx, linear_to_db(sfx_volume * master_volume))

	var ui_idx := AudioServer.get_bus_index("UI")
	if ui_idx >= 0:
		AudioServer.set_bus_volume_db(ui_idx, linear_to_db(ui_volume * master_volume))

	var music_idx := AudioServer.get_bus_index("Music")
	if music_idx >= 0:
		AudioServer.set_bus_volume_db(music_idx, linear_to_db(music_volume * master_volume))


## Check if a sound exists and is loaded
func has_sound(sound_id: String) -> bool:
	return _sound_pools.has(sound_id)


## Get list of all registered sound IDs
func get_sound_ids() -> Array:
	return SOUNDS.keys()
