# Implementation Plan: Minimap, Victory/Defeat, Sound Effects

## Overview

This plan covers three critical UI/UX improvements:
1. **Minimap** - Navigation aid for 64x64+ maps
2. **Victory/Defeat Screens** - Game ending presentation
3. **Sound Effects** - Audio feedback for game events

---

## 1. Minimap

### 1.1 Architecture

**New Files:**
- `scripts/Minimap.gd` - Minimap rendering and interaction logic
- `scenes/Minimap.tscn` - Scene with SubViewport for efficient rendering

**Integration Points:**
- `MultiplayerGame.tscn` - Add Minimap node to HUD layer
- `MapViewMultiplayer.gd` - Expose camera position for minimap viewport indicator

### 1.2 Design Specifications

```
+------------------+
|  +-----------+   |  <- Minimap positioned top-right corner
|  |  Minimap  |   |     Size: 180x180 pixels (configurable)
|  |  [■]      |   |     Background: semi-transparent dark
|  +-----------+   |
|                  |
|   Main Map       |
|                  |
+------------------+
```

**Visual Elements:**
- **Terrain**: Solid color per tile (reuse TerrainColors.gd)
- **Cities**: White squares (friend) / Red squares (enemy)
- **Units**: Small dots, colored by owner (only for density > threshold)
- **Viewport indicator**: White rectangle showing current view bounds
- **Player starting position**: Subtle highlight

### 1.3 Implementation Steps

**Step 1: Create Minimap.gd (Core Rendering)**
```gdscript
extends Control
class_name Minimap

const MINIMAP_SIZE := Vector2(180, 180)
const MINIMAP_MARGIN := Vector2(10, 50)  # Below TopBar

signal minimap_clicked(hex: Vector2i)

var map_data: Dictionary = {}
var cities: Dictionary = {}
var units: Dictionary = {}
var my_player_id := 0
var viewport_rect: Rect2 = Rect2()  # Current camera view in map coords

@onready var minimap_texture: TextureRect = $MinimapTexture

func _ready() -> void:
    custom_minimum_size = MINIMAP_SIZE
    mouse_filter = Control.MOUSE_FILTER_STOP

func update_from_snapshot(snapshot: Dictionary) -> void:
    map_data = snapshot.get("map", {})
    cities = _extract_cities(snapshot)
    units = _extract_units(snapshot)
    _regenerate_texture()

func set_viewport_rect(rect: Rect2) -> void:
    viewport_rect = rect
    queue_redraw()

func _gui_input(event: InputEvent) -> void:
    if event is InputEventMouseButton and event.pressed:
        if event.button_index == MOUSE_BUTTON_LEFT:
            var hex := _screen_to_hex(event.position)
            minimap_clicked.emit(hex)
            get_viewport().set_input_as_handled()

func _regenerate_texture() -> void:
    # Create Image, draw terrain colors, convert to ImageTexture
    var width: int = map_data.get("width", 64)
    var height: int = map_data.get("height", 64)
    var img := Image.create(width, height, false, Image.FORMAT_RGBA8)

    var tiles: Array = map_data.get("tiles", [])
    for r in range(height):
        for q in range(width):
            var idx := r * width + q
            var terrain_id := _get_terrain_id(tiles, idx)
            var color := TerrainColors.get_terrain_color(terrain_id)
            img.set_pixel(q, r, color)

    # Overlay cities
    for city in cities.values():
        var pos := _city_hex(city)
        var owner := _get_owner(city)
        var color := Color.WHITE if owner == my_player_id else Color.RED
        img.set_pixel(pos.x, pos.y, color)

    var tex := ImageTexture.create_from_image(img)
    minimap_texture.texture = tex

func _draw() -> void:
    # Draw viewport indicator rectangle over texture
    if viewport_rect.size.x > 0:
        var scale := MINIMAP_SIZE / Vector2(map_data.get("width", 64), map_data.get("height", 64))
        var rect := Rect2(viewport_rect.position * scale, viewport_rect.size * scale)
        draw_rect(rect, Color.WHITE, false, 2.0)
```

**Step 2: Create Minimap.tscn**
```
[node name="Minimap" type="Control"]
anchors_preset = 1  # Top-right
anchor_left = 1.0
anchor_right = 1.0
offset_left = -190
offset_top = 50
offset_right = -10
offset_bottom = 230
script = ExtResource("minimap_script")

[node name="Background" type="ColorRect" parent="."]
layout_mode = 1  # Full rect
color = Color(0.1, 0.1, 0.12, 0.85)

[node name="MinimapTexture" type="TextureRect" parent="."]
layout_mode = 1
stretch_mode = 4  # Keep aspect centered
```

**Step 3: Integrate into MultiplayerGame**
- Add `@onready var minimap: Minimap = $GameHUD/Minimap`
- In `_on_game_state_received()`: call `minimap.update_from_snapshot(snapshot)`
- In MapViewMultiplayer: calculate and emit viewport bounds
- Connect `minimap.minimap_clicked` to center camera on hex

**Step 4: Camera Viewport Tracking**
Add to `MapViewMultiplayer.gd`:
```gdscript
func get_visible_hex_bounds() -> Rect2:
    var vp := get_viewport_rect().size
    var effective_origin := origin + camera_offset
    var top_left := HexMath.pixel_to_axial(Vector2.ZERO - effective_origin, Vector2.ZERO, HEX_SIZE * zoom_level)
    var bottom_right := HexMath.pixel_to_axial(vp - effective_origin, Vector2.ZERO, HEX_SIZE * zoom_level)
    return Rect2(Vector2(top_left), Vector2(bottom_right - top_left))
```

### 1.4 Performance Considerations

- Regenerate texture only when snapshot changes (not every frame)
- Use ImageTexture with nearest-neighbor filtering for crisp pixels
- Limit unit density rendering (skip if too many units in region)
- Consider LOD: at zoom out, hide unit dots

---

## 2. Victory/Defeat Screens

### 2.1 Architecture

**New Files:**
- `scripts/GameEndScreen.gd` - Victory/defeat presentation logic
- `scenes/GameEndScreen.tscn` - Full-screen overlay with animations

**Integration Points:**
- `MultiplayerGame.gd` - Listen for `game_ended` signal from NetworkClient
- `NetworkClient.gd` - Parse and emit game ending conditions

### 2.2 Design Specifications

```
+----------------------------------------+
|                                        |
|           [VICTORY BANNER]             |
|           ================             |
|                                        |
|       "You have achieved               |
|        DOMINATION VICTORY!"            |
|                                        |
|       +---------------------+          |
|       |  Final Statistics   |          |
|       | - Cities: 12        |          |
|       | - Units: 45         |          |
|       | - Tech: Renaissance |          |
|       | - Score: 2,450      |          |
|       +---------------------+          |
|                                        |
|     [Return to Menu]  [Play Again]     |
+----------------------------------------+
```

**Victory Types (from server):**
1. `Domination` - Captured all enemy capitals
2. `Science` - Launched space mission
3. `Culture` - Achieved cultural dominance
4. `Diplomatic` - Won diplomatic vote
5. `Time` - Highest score at turn limit

**Defeat Conditions:**
1. Capital lost with no remaining cities
2. All units destroyed
3. Conceded

### 2.3 Implementation Steps

**Step 1: Create GameEndScreen.gd**
```gdscript
extends CanvasLayer
class_name GameEndScreen

signal return_to_menu()
signal play_again()

@onready var banner_label: Label = $CenterPanel/VBox/Banner
@onready var message_label: Label = $CenterPanel/VBox/Message
@onready var stats_container: VBoxContainer = $CenterPanel/VBox/Stats
@onready var return_button: Button = $CenterPanel/VBox/Buttons/ReturnButton
@onready var again_button: Button = $CenterPanel/VBox/Buttons/AgainButton
@onready var animation_player: AnimationPlayer = $AnimationPlayer

var is_victory := false
var victory_type := ""
var player_stats: Dictionary = {}

func _ready() -> void:
    visible = false
    return_button.pressed.connect(_on_return_pressed)
    again_button.pressed.connect(_on_again_pressed)

func show_victory(type: String, stats: Dictionary) -> void:
    is_victory = true
    victory_type = type
    player_stats = stats
    _setup_victory_display()
    visible = true
    animation_player.play("victory_entrance")

func show_defeat(reason: String, stats: Dictionary) -> void:
    is_victory = false
    player_stats = stats
    _setup_defeat_display(reason)
    visible = true
    animation_player.play("defeat_entrance")

func _setup_victory_display() -> void:
    banner_label.text = "VICTORY!"
    banner_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2))

    var type_name := _victory_type_name(victory_type)
    message_label.text = "You have achieved\n%s VICTORY!" % type_name

    _populate_stats()

func _setup_defeat_display(reason: String) -> void:
    banner_label.text = "DEFEAT"
    banner_label.add_theme_color_override("font_color", Color(0.9, 0.3, 0.3))

    message_label.text = "Your civilization has fallen.\n%s" % reason

    _populate_stats()

func _populate_stats() -> void:
    for child in stats_container.get_children():
        child.queue_free()

    _add_stat("Final Score", str(player_stats.get("score", 0)))
    _add_stat("Cities", str(player_stats.get("cities", 0)))
    _add_stat("Units", str(player_stats.get("units", 0)))
    _add_stat("Technologies", str(player_stats.get("techs", 0)))
    _add_stat("Turns Played", str(player_stats.get("turns", 0)))

func _add_stat(label: String, value: String) -> void:
    var hbox := HBoxContainer.new()
    var lbl := Label.new()
    lbl.text = label + ":"
    lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    var val := Label.new()
    val.text = value
    val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
    hbox.add_child(lbl)
    hbox.add_child(val)
    stats_container.add_child(hbox)

func _victory_type_name(type: String) -> String:
    match type:
        "domination": return "DOMINATION"
        "science": return "SCIENCE"
        "culture": return "CULTURAL"
        "diplomatic": return "DIPLOMATIC"
        "time": return "TIME"
        _: return type.to_upper()
```

**Step 2: Create GameEndScreen.tscn**
Scene structure with:
- CanvasLayer (layer 10, above HUD)
- ColorRect background with semi-transparent black
- CenterContainer with PanelContainer
- VBoxContainer with Banner, Message, Stats, Buttons
- AnimationPlayer with entrance animations

**Step 3: Animations**
```
victory_entrance:
  - 0.0s: Banner scale 0, alpha 0
  - 0.3s: Banner scale 1.2, alpha 1
  - 0.5s: Banner scale 1.0 (bounce)
  - 0.5s: Message fade in
  - 0.8s: Stats stagger in
  - 1.2s: Buttons slide up

defeat_entrance:
  - 0.0s: Screen shake, red flash
  - 0.3s: Banner slide down
  - 0.6s: Message fade in (slower, somber)
  - 1.0s: Stats, Buttons appear
```

**Step 4: Server Integration**
Add to `NetworkClient.gd`:
```gdscript
signal game_ended(is_victory: bool, type: String, reason: String, stats: Dictionary)

func _on_game_ended(data: String) -> void:
    var parsed = JSON.parse_string(data)
    if typeof(parsed) != TYPE_DICTIONARY:
        return
    var is_victory: bool = parsed.get("winner", -1) == player_id
    var type: String = parsed.get("victory_type", "")
    var reason: String = parsed.get("defeat_reason", "")
    var stats: Dictionary = parsed.get("player_stats", {}).get(str(player_id), {})
    game_ended.emit(is_victory, type, reason, stats)
```

**Step 5: MultiplayerGame Integration**
```gdscript
@onready var game_end_screen: GameEndScreen = $GameEndScreen

func _ready() -> void:
    # ... existing code ...
    network_client.game_ended.connect(_on_game_ended)

func _on_game_ended(is_victory: bool, type: String, reason: String, stats: Dictionary) -> void:
    if is_victory:
        game_end_screen.show_victory(type, stats)
    else:
        game_end_screen.show_defeat(reason, stats)

    # Disable game input
    map_view.set_process_unhandled_input(false)
```

---

## 3. Sound Effects

### 3.1 Architecture

**New Files:**
- `scripts/AudioManager.gd` - Singleton for audio playback
- `assets/audio/` - Sound effect files directory

**Integration Points:**
- `project.godot` - Register AudioManager autoload
- Various scripts emit sound events or call AudioManager directly

### 3.2 Sound Catalog

| Category | Sound ID | Trigger | Priority |
|----------|----------|---------|----------|
| **UI** | `ui_click` | Button press | High |
| | `ui_open` | Panel open | Medium |
| | `ui_close` | Panel close | Medium |
| | `ui_error` | Invalid action | High |
| **Units** | `unit_select` | Unit selected | Medium |
| | `unit_move` | Unit movement started | Medium |
| | `unit_move_complete` | Movement finished | Low |
| **Combat** | `attack_melee` | Melee attack | High |
| | `attack_ranged` | Ranged attack (bow) | High |
| | `attack_siege` | Siege weapon | High |
| | `unit_death` | Unit killed | High |
| | `unit_damaged` | Unit takes damage | Medium |
| **Cities** | `city_founded` | New city | High |
| | `city_captured` | City conquest | High |
| | `production_complete` | Unit/building done | Medium |
| **Game** | `turn_start` | Your turn begins | High |
| | `turn_end` | Turn submitted | Low |
| | `tech_complete` | Research finished | High |
| | `victory` | Game won | Critical |
| | `defeat` | Game lost | Critical |

### 3.3 Implementation Steps

**Step 1: Create AudioManager.gd (Singleton)**
```gdscript
extends Node

## AudioManager singleton for game sound effects

const SOUNDS_PATH := "res://assets/audio/"

# Sound pools for concurrent playback
var _sound_pools: Dictionary = {}  # sound_id -> Array[AudioStreamPlayer]
const POOL_SIZE := 3  # Max concurrent instances per sound

# Volume settings
var master_volume := 1.0
var sfx_volume := 0.8
var music_volume := 0.5
var ui_volume := 0.7

# Sound definitions
var SOUNDS: Dictionary = {
    # UI
    "ui_click": {"file": "ui_click.ogg", "volume": -6.0, "bus": "UI"},
    "ui_open": {"file": "ui_open.ogg", "volume": -8.0, "bus": "UI"},
    "ui_close": {"file": "ui_close.ogg", "volume": -10.0, "bus": "UI"},
    "ui_error": {"file": "ui_error.ogg", "volume": -4.0, "bus": "UI"},

    # Units
    "unit_select": {"file": "unit_select.ogg", "volume": -8.0, "bus": "SFX"},
    "unit_move": {"file": "unit_move.ogg", "volume": -10.0, "bus": "SFX"},

    # Combat
    "attack_melee": {"file": "attack_melee.ogg", "volume": -4.0, "bus": "SFX"},
    "attack_ranged": {"file": "attack_ranged.ogg", "volume": -6.0, "bus": "SFX"},
    "unit_death": {"file": "unit_death.ogg", "volume": -3.0, "bus": "SFX"},

    # Cities
    "city_founded": {"file": "city_founded.ogg", "volume": -4.0, "bus": "SFX"},
    "city_captured": {"file": "city_captured.ogg", "volume": -2.0, "bus": "SFX"},
    "production_complete": {"file": "production_complete.ogg", "volume": -6.0, "bus": "SFX"},

    # Game Events
    "turn_start": {"file": "turn_start.ogg", "volume": -4.0, "bus": "SFX"},
    "tech_complete": {"file": "tech_complete.ogg", "volume": -4.0, "bus": "SFX"},
    "victory": {"file": "victory.ogg", "volume": 0.0, "bus": "Music"},
    "defeat": {"file": "defeat.ogg", "volume": 0.0, "bus": "Music"},
}

func _ready() -> void:
    _setup_audio_buses()
    _preload_sounds()

func _setup_audio_buses() -> void:
    # Create audio buses if they don't exist
    if AudioServer.get_bus_index("SFX") == -1:
        AudioServer.add_bus()
        AudioServer.set_bus_name(AudioServer.bus_count - 1, "SFX")
    if AudioServer.get_bus_index("UI") == -1:
        AudioServer.add_bus()
        AudioServer.set_bus_name(AudioServer.bus_count - 1, "UI")
    if AudioServer.get_bus_index("Music") == -1:
        AudioServer.add_bus()
        AudioServer.set_bus_name(AudioServer.bus_count - 1, "Music")

func _preload_sounds() -> void:
    for sound_id in SOUNDS.keys():
        var def: Dictionary = SOUNDS[sound_id]
        var path := SOUNDS_PATH + def["file"]
        if ResourceLoader.exists(path):
            var stream := load(path) as AudioStream
            if stream:
                _create_sound_pool(sound_id, stream, def)

func _create_sound_pool(sound_id: String, stream: AudioStream, def: Dictionary) -> void:
    _sound_pools[sound_id] = []
    for i in range(POOL_SIZE):
        var player := AudioStreamPlayer.new()
        player.stream = stream
        player.volume_db = def.get("volume", 0.0)
        player.bus = def.get("bus", "Master")
        add_child(player)
        _sound_pools[sound_id].append(player)

func play(sound_id: String, pitch_variation: float = 0.0) -> void:
    if not _sound_pools.has(sound_id):
        push_warning("AudioManager: Unknown sound '%s'" % sound_id)
        return

    var pool: Array = _sound_pools[sound_id]
    for player in pool:
        if not player.playing:
            if pitch_variation > 0.0:
                player.pitch_scale = 1.0 + randf_range(-pitch_variation, pitch_variation)
            else:
                player.pitch_scale = 1.0
            player.play()
            return

    # All players busy, use first one (interrupt oldest)
    pool[0].stop()
    pool[0].play()

func play_at_position(sound_id: String, global_pos: Vector2) -> void:
    # For 2D positional audio (optional enhancement)
    play(sound_id)  # Simplified: just play normally

func set_sfx_volume(vol: float) -> void:
    sfx_volume = clampf(vol, 0.0, 1.0)
    var bus_idx := AudioServer.get_bus_index("SFX")
    if bus_idx >= 0:
        AudioServer.set_bus_volume_db(bus_idx, linear_to_db(sfx_volume * master_volume))

func set_ui_volume(vol: float) -> void:
    ui_volume = clampf(vol, 0.0, 1.0)
    var bus_idx := AudioServer.get_bus_index("UI")
    if bus_idx >= 0:
        AudioServer.set_bus_volume_db(bus_idx, linear_to_db(ui_volume * master_volume))
```

**Step 2: Register Autoload**
Add to `project.godot`:
```ini
[autoload]
AudioManager="*res://scripts/AudioManager.gd"
```

**Step 3: Create Placeholder Audio Files**
Generate or acquire `.ogg` files for each sound. For development, can use:
- sfxr/bfxr for retro sounds
- freesound.org for CC0 effects
- AI generation tools

Recommended specifications:
- Format: OGG Vorbis
- Sample rate: 44100 Hz
- Mono for SFX, Stereo for music
- Normalize to -3dB peak

**Step 4: Integration Points**

Add to `MapViewMultiplayer.gd`:
```gdscript
func _select_unit(unit_id: int) -> void:
    selected_unit_id = unit_id
    selected_city_id = -1
    _update_overlays()
    unit_selected.emit(unit_id)
    AudioManager.play("unit_select")  # ADD
    queue_redraw()
```

Add to `MultiplayerGame.gd`:
```gdscript
func _handle_battle_event(event: Dictionary) -> void:
    # ... existing combat effects code ...
    AudioManager.play("attack_melee", 0.1)  # ADD with pitch variation

func _on_turn_started(active_player: int, turn: int, time_ms: int) -> void:
    # ... existing code ...
    if active_player == my_player_id:
        AudioManager.play("turn_start")  # ADD
```

Add to `GameHUD.gd`:
```gdscript
func _on_end_turn_pressed() -> void:
    AudioManager.play("ui_click")  # ADD
    end_turn_pressed.emit()
```

Add to `CombatEffects.gd`:
```gdscript
func show_death_effect(pos: Vector2, unit_color: Color) -> void:
    AudioManager.play("unit_death", 0.15)  # ADD
    # ... existing code ...
```

Add to `ResearchPanel.gd` when tech selected:
```gdscript
func _on_tech_selected(tech_id: int) -> void:
    AudioManager.play("ui_click")
    # ...
```

**Step 5: Volume Settings UI (Optional)**
Add to `MainMenu.gd` or create Settings panel:
```gdscript
@onready var sfx_slider: HSlider = $VBox/SFXSlider
@onready var music_slider: HSlider = $VBox/MusicSlider

func _ready() -> void:
    sfx_slider.value_changed.connect(_on_sfx_changed)
    music_slider.value_changed.connect(_on_music_changed)

func _on_sfx_changed(value: float) -> void:
    AudioManager.set_sfx_volume(value / 100.0)

func _on_music_changed(value: float) -> void:
    AudioManager.set_music_volume(value / 100.0)
```

---

## Execution Order

### Phase 1: Sound Effects (1-2 hours)
1. Create AudioManager.gd singleton
2. Register autoload in project.godot
3. Create assets/audio/ directory with placeholder sounds
4. Add play() calls to existing scripts
5. Test all sound triggers

### Phase 2: Victory/Defeat (2-3 hours)
1. Create GameEndScreen.gd
2. Create GameEndScreen.tscn with layout
3. Add AnimationPlayer with entrance animations
4. Add game_ended signal to NetworkClient
5. Integrate into MultiplayerGame
6. Test victory and defeat flows

### Phase 3: Minimap (2-3 hours)
1. Create Minimap.gd with core rendering
2. Create Minimap.tscn scene
3. Add viewport tracking to MapViewMultiplayer
4. Integrate into GameHUD
5. Connect click-to-navigate
6. Performance optimization pass

---

## Testing Checklist

### Minimap
- [ ] Terrain colors match main map
- [ ] Cities visible at correct positions
- [ ] Viewport rectangle updates when panning
- [ ] Click navigates to correct hex
- [ ] Performance acceptable on 128x128 map
- [ ] Handles wrap-around maps correctly

### Victory/Defeat
- [ ] Victory shows correct type
- [ ] Defeat shows correct reason
- [ ] Statistics populate correctly
- [ ] Animations play smoothly
- [ ] Return to Menu works
- [ ] Input disabled during display

### Sound Effects
- [ ] All sounds play at appropriate times
- [ ] No audio clipping or distortion
- [ ] Multiple sounds can overlap
- [ ] Volume controls work
- [ ] No errors for missing sound files
- [ ] Combat sounds have pitch variation

---

## Asset Requirements

### Audio Files Needed
```
assets/audio/
├── ui_click.ogg      (~0.1s, click/tap)
├── ui_open.ogg       (~0.3s, whoosh)
├── ui_close.ogg      (~0.2s, soft close)
├── ui_error.ogg      (~0.3s, buzz/error)
├── unit_select.ogg   (~0.2s, selection ping)
├── unit_move.ogg     (~0.5s, footsteps/movement)
├── attack_melee.ogg  (~0.4s, sword clash)
├── attack_ranged.ogg (~0.5s, arrow whoosh)
├── unit_death.ogg    (~0.6s, death cry)
├── city_founded.ogg  (~1.0s, fanfare)
├── city_captured.ogg (~0.8s, conquest horn)
├── production_complete.ogg (~0.5s, completion chime)
├── turn_start.ogg    (~0.4s, notification)
├── tech_complete.ogg (~0.8s, discovery fanfare)
├── victory.ogg       (~3.0s, victory music sting)
└── defeat.ogg        (~3.0s, defeat/somber sting)
```

Total: 16 sound files, ~10-15 KB each for .ogg
