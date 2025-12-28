# Backbay Imperium Audio Asset Specifications

## Technical Requirements (All Files)

| Property | Value |
|----------|-------|
| Format | OGG Vorbis (.ogg) |
| Sample Rate | 44.1 kHz |
| Bit Depth | 16-bit |
| Channels | Mono (SFX/UI) or Stereo (Music) |
| Loudness | -14 LUFS integrated |
| Peak | -1 dBTP max |
| Fade | 10ms fade-in/out on all clips |

---

## UI Sounds (Bus: UI)

### ui_click.ogg
- **Duration**: 50-100ms
- **Volume**: -6 dB
- **Description**: Crisp button press feedback
- **Style**: Subtle mechanical click with slight tonal quality
- **Reference**: Similar to Civilization VI menu clicks

### ui_open.ogg
- **Duration**: 150-250ms
- **Volume**: -8 dB
- **Description**: Panel/menu opening
- **Style**: Soft swoosh with rising pitch, parchment unfurl quality
- **Layers**: Subtle paper texture + tonal chime

### ui_close.ogg
- **Duration**: 100-200ms
- **Volume**: -10 dB
- **Description**: Panel/menu closing
- **Style**: Inverse of ui_open, falling pitch, gentle whoosh
- **Layers**: Soft thud/settle sound

### ui_error.ogg
- **Duration**: 200-300ms
- **Volume**: -4 dB
- **Description**: Invalid action feedback
- **Style**: Low buzz/thunk, clearly negative but not jarring
- **Notes**: Avoid harsh beeps; prefer muffled wooden knock

---

## Unit Sounds (Bus: SFX)

### unit_select.ogg
- **Duration**: 100-200ms
- **Volume**: -8 dB
- **Description**: Unit selected by player
- **Style**: Light metallic chime, acknowledging tone
- **Variation**: Pitch variation ±5% applied in code

### unit_move.ogg
- **Duration**: 200-400ms
- **Volume**: -10 dB
- **Description**: Unit movement step sound
- **Style**: Footstep/march sound, generic enough for all unit types
- **Notes**: Should loop cleanly for multi-tile movement
- **Variation**: Pitch variation ±10% applied in code

### unit_move_complete.ogg
- **Duration**: 150-250ms
- **Volume**: -12 dB
- **Description**: Unit reached destination
- **Style**: Soft settling sound, subtle confirmation
- **Notes**: Low priority, subtle audio bookmark

---

## Combat Sounds (Bus: SFX)

### attack_melee.ogg
- **Duration**: 300-500ms
- **Volume**: -4 dB
- **Description**: Melee unit attacking
- **Style**: Sword clash, impact, metallic ring
- **Layers**: Initial contact + resonance tail
- **Variation**: Pitch variation ±10% applied in code

### attack_ranged.ogg
- **Duration**: 400-600ms
- **Volume**: -6 dB
- **Description**: Ranged unit attacking (archers, catapults)
- **Style**: Arrow whoosh + distant impact
- **Layers**: Release sound + flight + hit
- **Notes**: Can be cut short if target is close

### attack_siege.ogg
- **Duration**: 600-900ms
- **Volume**: -4 dB
- **Description**: Siege weapon firing
- **Style**: Heavy mechanical creak + massive impact
- **Layers**: Tension release + projectile + destruction

### unit_death.ogg
- **Duration**: 400-600ms
- **Volume**: -3 dB
- **Description**: Unit eliminated
- **Style**: Dramatic finality, thud with reverb tail
- **Notes**: Generic enough for any unit type
- **Variation**: Pitch variation ±15% applied in code

### unit_damaged.ogg
- **Duration**: 200-300ms
- **Volume**: -6 dB
- **Description**: Unit took damage but survived
- **Style**: Lighter impact than death, armor clang
- **Notes**: Should feel distinctly different from death sound

---

## City Sounds (Bus: SFX)

### city_founded.ogg
- **Duration**: 1000-1500ms
- **Volume**: -4 dB
- **Description**: New city established
- **Style**: Triumphant horn fanfare + settling/building
- **Layers**: Brass stab + crowd murmur + construction
- **Notes**: Celebratory, marks major game moment

### city_captured.ogg
- **Duration**: 1200-1800ms
- **Volume**: -2 dB
- **Description**: Enemy city captured
- **Style**: Dramatic drums + victory brass + crowd
- **Layers**: War drums crescendo + fanfare + cheering
- **Notes**: More intense than city_founded

### production_complete.ogg
- **Duration**: 500-800ms
- **Volume**: -6 dB
- **Description**: City finished producing unit/building
- **Style**: Anvil ring + workshop sounds
- **Layers**: Metal clang + brief fanfare
- **Notes**: Satisfying but not attention-grabbing

---

## Game Event Sounds (Bus: SFX/Music)

### turn_start.ogg
- **Duration**: 400-600ms
- **Volume**: -4 dB
- **Description**: Player's turn begins
- **Style**: Attention-getting tonal sweep upward
- **Notes**: Should wake up distracted players
- **Bus**: SFX

### turn_end.ogg
- **Duration**: 200-300ms
- **Volume**: -8 dB
- **Description**: Player ended their turn
- **Style**: Soft confirmation, page turn quality
- **Notes**: Low-key acknowledgment
- **Bus**: SFX

### tech_complete.ogg
- **Duration**: 800-1200ms
- **Volume**: -4 dB
- **Description**: Technology research completed
- **Style**: Enlightenment chime + scholarly fanfare
- **Layers**: Bell/chime + brief orchestral flourish
- **Notes**: Celebratory, knowledge-themed
- **Bus**: SFX

### victory.ogg
- **Duration**: 4000-6000ms
- **Volume**: 0 dB
- **Volume**: 0 dB
- **Description**: Player won the game
- **Style**: Full orchestral victory fanfare
- **Layers**: Brass fanfare + strings + percussion + choir
- **Notes**: Epic, triumphant, emotionally satisfying climax
- **Bus**: Music

### defeat.ogg
- **Duration**: 3000-5000ms
- **Volume**: 0 dB
- **Description**: Player lost the game
- **Style**: Somber orchestral piece
- **Layers**: Low strings + muted brass + fading drums
- **Notes**: Dignified defeat, not depressing
- **Bus**: Music

---

## Future Expansion (Not Yet Implemented)

### Ambient/Environmental
| Asset | Duration | Description |
|-------|----------|-------------|
| amb_plains.ogg | 30s loop | Wind, distant birds |
| amb_forest.ogg | 30s loop | Rustling leaves, wildlife |
| amb_ocean.ogg | 30s loop | Waves, seagulls |
| amb_mountain.ogg | 30s loop | Wind howl, echoes |
| amb_desert.ogg | 30s loop | Dry wind, sand |

### Music Tracks
| Asset | Duration | Description |
|-------|----------|-------------|
| music_main_theme.ogg | 2-3min | Main menu theme |
| music_peace.ogg | 3-4min | Peaceful gameplay loop |
| music_tension.ogg | 3-4min | Pre-war/conflict theme |
| music_battle.ogg | 3-4min | Active combat theme |

### Additional SFX
| Asset | Duration | Description |
|-------|----------|-------------|
| war_declared.ogg | 1s | War declaration notification |
| peace_treaty.ogg | 1s | Peace established |
| great_person.ogg | 1s | Great person born |
| wonder_complete.ogg | 2s | Wonder construction complete |
| era_advance.ogg | 1.5s | Advancing to new era |
| notification.ogg | 0.3s | Generic notification |

---

## File Naming Convention

```
{category}_{action}.ogg
```

Categories:
- `ui_` - User interface
- `unit_` - Unit-related
- `attack_` - Combat attacks
- `city_` - City events
- `tech_` - Technology
- `amb_` - Ambient
- `music_` - Background music

---

## Audio Bus Configuration

```
Master
├── SFX (sfx_volume: 0.8)
│   ├── Unit sounds
│   ├── Combat sounds
│   ├── City sounds
│   └── Game events
├── UI (ui_volume: 0.7)
│   └── Interface sounds
└── Music (music_volume: 0.5)
    ├── Victory/Defeat stings
    └── Background music
```

---

## Generation Notes

For AI audio generation (e.g., Suno, Udio, ElevenLabs SFX):

**Prompt Template for SFX:**
```
Create a {duration} {style} sound effect for a 4X strategy game.
{detailed_description}
Style: orchestral/medieval/ancient civilization aesthetic
Quality: Clean, professional game audio
```

**Prompt Template for Music:**
```
Compose a {duration} {mood} orchestral piece for a 4X strategy game.
{detailed_description}
Instrumentation: Full orchestra with emphasis on {instruments}
Style: Epic, cinematic, similar to Civilization game soundtracks
Must loop seamlessly from end to start.
```
