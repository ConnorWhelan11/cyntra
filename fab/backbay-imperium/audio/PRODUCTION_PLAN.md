# Backbay Imperium Audio Production Plan

## Executive Summary

57 audio assets across 6 categories for a Civ-style 4X strategy game.
Estimated production time: 40-50 hours.
Primary tool: Suno v4 for themes, Stable Audio for ambiance, ElevenLabs for SFX.

---

## Part 1: Style Establishment (Do This First)

Before generating production assets, establish the sonic identity.

### 1.1 Reference Tracks

Listen to these for calibration (don't copy, absorb the vibe):

| Reference | What to Learn |
|-----------|---------------|
| **Christopher Tin - Baba Yetu** | Civ opening grandeur, cultural authenticity |
| **Geoff Knorr - Civ 5 menu theme** | Contemplative pacing, warmth |
| **Austin Wintory - Journey OST** | Minimalism, emotional arc without bombast |
| **BBC Planet Earth scores** | Documentary gravitas, nature dignity |
| **Ennio Morricone - The Mission** | Period instruments, sacred + human |

### 1.2 Anti-References (What to Avoid)

| Avoid | Why |
|-------|-----|
| Hans Zimmer BRAAAM | Too aggressive, too modern |
| Generic fantasy RPG | Overused tropes, lacks distinction |
| Mobile game soundtracks | Too bright, too arcade |
| Trailer music libraries | Designed for impact, not contemplation |
| Overly ethnic stereotypes | Sitar + tabla ≠ authentic India |

### 1.3 Style Test Batch

Generate 10 test tracks before production to calibrate:

```
Test Prompt A (Ancient baseline):
"Ancient civilization orchestral theme, lyres and frame drums,
mysterious yet hopeful, museum documentary style, warm earth
tones, contemplative 70 BPM, no vocals, classical recording quality"

Test Prompt B (Classical baseline):
"Roman Empire theme, brass fanfares with restraint, majestic
but not bombastic, Elgar-inspired nobility, warm orchestral,
dignified 80 BPM, cinematic documentary style"

Test Prompt C (War variant test):
"Strategic war music, tense but controlled, military drums,
minor key strings, building intensity without chaos, chess-game
tension not action-movie violence, 85 BPM"
```

**Evaluation criteria for test batch:**
- [ ] Warmth: Does it feel like afternoon sunlight, not fluorescent?
- [ ] Tempo: Can you think strategically while listening?
- [ ] Fatigue: Would this annoy after 30 minutes?
- [ ] Authenticity: Does it feel researched, not clichéd?
- [ ] Loop potential: Does it have a natural return point?

Pick the 2-3 best test tracks. These become your **style anchors**.
Reference them in future prompts: "Similar warmth and pacing to [anchor track]"

---

## Part 2: Production Phases

### Phase 1: Era Main Themes (Priority: Critical)

**Why first:** 80% of gameplay uses these. They define the game's feel.

| Track | Prompt Strategy | Risk Level |
|-------|-----------------|------------|
| `ancient_main` | Lyres, pentatonic, dawn-of-civilization | Low |
| `classical_main` | Roman brass, Greek modes, order | Low |
| `medieval_main` | Church organ + hurdy-gurdy, Gothic | Medium |
| `renaissance_main` | Harpsichord, baroque, Vivaldi-lite | Low |
| `industrial_main` | Full romantic orchestra, Victorian | Low |
| `modern_main` | Cinematic + subtle synth, global | Medium |

**Workflow per track:**
1. Generate 5 variations in Suno
2. Quick filter (30 sec listen each) → keep 2-3
3. Full listen on headphones → pick 1
4. Edit for loop point (find natural phrase end ~2:30-3:30)
5. Normalize to -14 LUFS
6. Export as OGG 192kbps

**Prompt template:**
```
[Era] civilization orchestral theme, [primary instruments],
[mood adjectives], museum documentary quality, [tempo] BPM,
no vocals, warm classical recording, [specific style reference]
```

**Estimated time:** 6 tracks × 1.5 hrs = 9 hours

---

### Phase 2: UI Sound Effects (Priority: Critical)

**Why second:** Immediate player feedback. Bad UI sounds ruin the feel.

**Tool:** ElevenLabs Sound Effects or Audiogen (NOT Suno)

| Category | Sounds | Character |
|----------|--------|-----------|
| Navigation | click, hover, tab, menu | Soft, woody, leather |
| Notifications | turn, research, production | Chimes, crystalline, warm |
| Combat | select, move, attack, death | Military, brief, professional |
| Resources | gold, discovery | Satisfying, not casino-like |

**Style guide for SFX:**
- Duration: 0.1s - 1.5s (short and functional)
- No reverb tails (keeps UI snappy)
- Warm frequencies (avoid harsh highs)
- Consistent volume across set
- Think: luxury leather goods, not plastic buttons

**Prompt approach for ElevenLabs:**
```
"Soft wooden button click, luxury interface, warm tone,
no reverb, 0.15 seconds, refined and minimal"

"Research discovery chime, eureka moment, crystalline and
magical, brief sparkle, 1 second, scholarly achievement"
```

**Estimated time:** 18 sounds × 20 min = 6 hours

---

### Phase 3: Era Peace/War Variants (Priority: High)

**Why third:** Adds dynamic range to gameplay without new eras.

Generate variants that share DNA with main themes:

| Base Theme | Peace Variant | War Variant |
|------------|---------------|-------------|
| Same key signature | Softer orchestration | Add percussion layer |
| Same tempo (±5 BPM) | Woodwinds lead | Brass leads |
| Same motifs | Major inflections | Minor inflections |
| Same instruments | Reduced dynamics | Building intensity |

**Prompt modification technique:**
```
# Peace variant (add to main prompt):
"...peaceful and pastoral, domestic prosperity, afternoon
sunlight, strings lead, reduced percussion, hopeful..."

# War variant (add to main prompt):
"...strategic tension, military undertones, building drums,
minor key shift, controlled intensity, chess-game stakes..."
```

**Critical:** War music should NOT be action music. This is turn-based.
Think: "tense anticipation" not "explosions happening now"

**Estimated time:** 12 tracks × 1 hr = 12 hours

---

### Phase 4: Civilization Motifs (Priority: High)

**Why fourth:** Essential for diplomacy encounters; cultural identity.

**Risk assessment by civ:**

| Civ | Instruments | Difficulty | Notes |
|-----|-------------|------------|-------|
| Rome | Brass fanfare | Easy | Well-known sound |
| Greece | Lyre, aulos | Easy | Classical modes work |
| Egypt | Ney, sistrum | Medium | Avoid mummy-movie clichés |
| Persia | Santur, tar | Medium | Reference Iranian classical |
| China | Erhu, pipa | Easy | AI handles well |
| England | Elgar brass | Easy | Clear reference |
| Arabia | Oud, maqam | Hard | Avoid orientalism |
| Aztec | Huehuetl, ocarina | Hard | Very specific, unfamiliar |
| India | Sitar, tabla | Medium | Avoid Bollywood unless intentional |
| Japan | Koto, shakuhachi | Easy | Well-documented |
| Russia | Balalaika, choir | Easy | Distinctive sound |
| Germany | Prussian brass | Easy | Clear reference |

**High-risk civ strategies:**

**Arabia:** Reference specific traditions
```
"Arabian classical music motif, oud and qanun, Andalusian
maqam influence, scholarly and refined, Alhambra palace,
NOT belly dance or action movie Middle East, dignified"
```

**Aztec:** Be very specific
```
"Pre-Columbian Mesoamerican music, huehuetl log drum and
clay ocarinas, ceremonial and ancient, jungle temple,
NOT Hollywood tribal, authentic archaeological inspiration"
```

**Estimated time:** 12 motifs × 45 min = 9 hours

---

### Phase 5: Wonder Fanfares (Priority: Medium)

**Why fifth:** Achievement moments; high visibility but infrequent.

These are stingers (15-25 seconds), not full tracks.

**Structure for fanfares:**
1. Attention-grab (0-3 sec): Distinctive opening
2. Build (3-12 sec): Rising energy
3. Climax (12-18 sec): Peak triumphant moment
4. Resolution (18-25 sec): Definitive ending, not fade

**General wonder fanfare:**
```
"Triumphant orchestral fanfare, World Wonder achievement,
brass and timpani, 20 seconds, victorious and grand,
definitive ending not fade, civilization milestone"
```

**Wonder-specific additions:**
- Pyramids: Egyptian mysticism, ancient horns
- Colosseum: Crowd roar hint, gladiatorial
- Notre Dame: Church bells, organ, choir hint
- Great Library: Scholarly revelation, harps
- Machu Picchu: Andean winds, mountain height

**Estimated time:** 13 fanfares × 30 min = 6.5 hours

---

### Phase 6: Ambiance Loops (Priority: Low)

**Why sixth:** Polish layer; plays under music at low volume.

**Tool recommendation:** Stable Audio (better for environmental)

Suno struggles with:
- Abstract non-melodic content
- Seamless 3-minute loops
- Subtle, non-intrusive textures

**Alternative approach:** Curate from royalty-free libraries
- Freesound.org (CC0 field recordings)
- Artlist (licensed, high quality)
- BBC Sound Effects Archive

**If generating:**
```
"Environmental ambiance, [terrain type], field recording style,
non-musical, subtle and atmospheric, 3 minutes, seamless loop,
[specific sounds: birds, wind, waves, etc.]"
```

**Post-processing required:**
1. Find clean loop point (2:30-3:00)
2. Crossfade ends (500ms overlap)
3. Normalize to -20 LUFS (under music)
4. Remove any tonal/melodic elements

**Estimated time:** 9 loops × 1 hr = 9 hours

---

### Phase 7: Gameplay State Music (Priority: Low)

**Why last:** Secondary screens (diplomacy, city view, tech tree).

These support specific UI contexts:

| State | Duration | Mood | Tempo |
|-------|----------|------|-------|
| Diplomacy | 2:00-2:30 | Formal, tense | 75 BPM |
| City View | 2:00-2:30 | Productive, warm | 80 BPM |
| Tech Tree | 2:00-2:30 | Curious, scholarly | 70 BPM |
| Victory | 1:30-2:00 | Triumphant, final | 90 BPM |
| Defeat | 1:30-2:00 | Somber, dignified | 60 BPM |

**Victory and Defeat are special:**
- Non-looping (play once)
- Emotional arc (build → peak or descend → resolve)
- Definitive endings

**Estimated time:** 5 tracks × 1.5 hrs = 7.5 hours

---

## Part 3: Technical Pipeline

### 3.1 Folder Structure

```
fab/backbay-imperium/audio/
├── PRODUCTION_PLAN.md          # This document
├── audio_asset_spec.yaml       # Technical spec
├── raw/                        # Unedited Suno outputs
│   ├── era_themes/
│   ├── civ_motifs/
│   ├── fanfares/
│   └── rejected/               # Keep for reference
├── edited/                     # Post-production files
│   ├── music/                  # Looped, normalized
│   ├── ambiance/
│   └── sfx/
├── final/                      # Game-ready exports
│   ├── music/                  # .ogg 192kbps
│   ├── ambiance/               # .ogg 128kbps
│   └── sfx/                    # .wav 16-bit
└── reference/                  # Style anchors, inspirations
```

### 3.2 Naming Convention

```
[category]_[era/civ]_[variant]_[version].ext

Examples:
theme_ancient_main_v1.ogg
theme_classical_war_v2.ogg
motif_rome_v1.ogg
fanfare_pyramids_v1.ogg
amb_desert_v1.ogg
sfx_click_v1.wav
```

### 3.3 Quality Checklist Per Asset

```
[ ] Generated from approved prompt
[ ] Matches style anchor warmth
[ ] Tempo appropriate for category
[ ] Loop point edited (if applicable)
[ ] Normalized to target LUFS
[ ] No clipping or artifacts
[ ] Exported to correct format
[ ] Named correctly
[ ] Tested in game context (if possible)
```

### 3.4 Loudness Standards

| Category | Target LUFS | Peak dBFS |
|----------|-------------|-----------|
| Era themes | -14 LUFS | -1 dBFS |
| Civ motifs | -14 LUFS | -1 dBFS |
| Fanfares | -12 LUFS | -0.5 dBFS |
| Ambiance | -20 LUFS | -3 dBFS |
| UI SFX | -12 LUFS | -1 dBFS |

Use a loudness meter plugin. Free option: Youlean Loudness Meter.

---

## Part 4: Prompt Engineering Guide

### 4.1 Effective Suno Prompt Structure

```
[Genre/Style], [Primary Instruments], [Mood Adjectives],
[Tempo] BPM, [Technical Qualities], [Anti-Patterns to Avoid]
```

**Good example:**
```
"Ancient Mediterranean orchestral theme, lyres and aulos flutes,
mysterious yet hopeful and warm, 70 BPM, museum documentary
quality, no vocals, NOT action movie or epic trailer style"
```

**Bad example:**
```
"Epic ancient music"
(Too vague, will get generic output)
```

### 4.2 Instrument Specificity

Instead of: | Say: |
|-----------|------|
| "strings" | "warm cello and viola, chamber orchestra" |
| "drums" | "frame drums and darbuka, not kit drums" |
| "flute" | "wooden ney flute, breathy and ancient" |
| "brass" | "French horns and trombones, noble not aggressive" |

### 4.3 Mood Descriptors That Work

**Warm/Contemplative:** (use these)
- Dignified, scholarly, majestic, hopeful
- Pastoral, serene, noble, refined
- Contemplative, measured, warm, earthy

**Avoid:** (too generic or wrong vibe)
- Epic, powerful, intense, dramatic
- Beautiful, amazing, awesome
- Dark, scary, ominous (unless war variant)

### 4.4 The "NOT" Technique

Explicitly exclude unwanted elements:
```
"...NOT action movie, NOT trailer music, NOT Hans Zimmer,
NOT generic fantasy, NOT video game boss battle..."
```

### 4.5 Iteration Strategy

**Round 1:** Generate 5 variations, pick best 2
**Round 2:** Refine prompt based on what worked, generate 3 more
**Round 3:** If still not right, identify specific issue and address

Common issues and fixes:
- Too fast → Add "contemplative, 70 BPM, measured pace"
- Too aggressive → Add "restrained, dignified, NOT action"
- Wrong instruments → Be very specific, name exact instruments
- Too synthetic → Add "acoustic recording, classical orchestra"

---

## Part 5: Schedule Template

### Week 1: Foundation
- [ ] Day 1-2: Style test batch (10 tracks)
- [ ] Day 2: Evaluate and select style anchors
- [ ] Day 3-4: Era main themes (6 tracks)
- [ ] Day 5: UI SFX complete (18 sounds)

### Week 2: Core Expansion
- [ ] Day 1-3: Era peace/war variants (12 tracks)
- [ ] Day 4-5: Begin civ motifs (6 of 12)

### Week 3: Cultural & Polish
- [ ] Day 1-2: Complete civ motifs (6 remaining)
- [ ] Day 3: Wonder fanfares (13 stingers)
- [ ] Day 4-5: Ambiance loops (9 loops)

### Week 4: Final & Integration
- [ ] Day 1-2: Gameplay state music (5 tracks)
- [ ] Day 3-4: Full quality pass, normalization
- [ ] Day 5: Integration testing, final exports

---

## Part 6: Budget Considerations

### Suno Pricing (as of late 2024)
- Free tier: 50 credits/month (10 songs)
- Pro: $10/month, 500 credits (100 songs)
- Premier: $30/month, 2000 credits (400 songs)

**Recommendation:** Premier for one month ($30)
- 400 generations covers all tracks with iteration room
- Cancel after production complete

### Alternative Tools

| Tool | Cost | Best For |
|------|------|----------|
| Udio | $10/month | Complex arrangements |
| Stable Audio | Free tier available | Ambiance, abstract |
| ElevenLabs SFX | Pay per use | UI sounds |
| AIVA | $15/month | Stems, dynamic music |

### Free Options
- Freesound.org: CC0 field recordings for ambiance
- Incompetech: Royalty-free music (not AI, but usable)
- Pixabay: Some usable ambient tracks

---

## Part 7: Risk Mitigation

### Risk: Inconsistent Quality Across Tracks

**Mitigation:**
- Establish style anchors before production
- Reference anchors in prompts
- Batch similar tracks together (all ancient in one session)
- Use same loudness/EQ chain on all

### Risk: Cultural Inauthenticity

**Mitigation:**
- Research actual traditional music before prompting
- Use specific instrument names, not generic "ethnic"
- Listen to reference recordings first
- When in doubt, go abstract rather than stereotypical

### Risk: Loop Points Don't Work

**Mitigation:**
- Generate slightly long (3:30-4:00)
- Look for phrase endings around 2:30-3:00
- Use 100-200ms crossfade at loop point
- Test loops in game context before finalizing

### Risk: AI-Generated Music Sounds "AI"

**Mitigation:**
- Be very specific in prompts (generic = generic output)
- Layer with real recorded elements where needed
- Use post-processing (subtle tape saturation, room verb)
- Avoid the "Suno" instruments it defaults to

---

## Appendix A: All Prompts (Copy-Paste Ready)

### Era Main Themes

```
ANCIENT_MAIN:
Ancient Mediterranean civilization theme, lyres and frame drums,
aulos flutes, mysterious yet hopeful, warm earth tones, dawn of
civilization, museum documentary quality, 70 BPM, no vocals,
NOT epic trailer, NOT action movie, contemplative and dignified

CLASSICAL_MAIN:
Roman Empire orchestral theme, noble brass fanfares with restraint,
Greek kithara hints, majestic civilization at height, marble halls,
dignified and ordered, 80 BPM, Elgar-inspired warmth, no vocals,
NOT bombastic, scholarly grandeur

MEDIEVAL_MAIN:
Medieval Gothic civilization theme, church organ undertones,
hurdy-gurdy and lute, Gregorian hints, stone cathedrals and
candlelight, faith and feudalism, 70 BPM, dark but hopeful,
monastery bells distant, no vocals, NOT fantasy adventure

RENAISSANCE_MAIN:
Renaissance civilization theme, harpsichord and viols, baroque
elegance, age of discovery, Vivaldi-inspired clarity, scientific
awakening, 80 BPM, warm and sophisticated, no vocals, courtly
and refined, NOT dramatic, intellectual optimism

INDUSTRIAL_MAIN:
Victorian industrial era theme, full romantic orchestra, brass
and strings, progress and empire, train-age rhythm hints,
Elgar nobility, 90 BPM, powerful but dignified, no vocals,
NOT steampunk action, documentary grandeur

MODERN_MAIN:
Modern era civilization theme, cinematic orchestra, subtle
electronic textures, global scale, space age wonder, UN dignity,
95 BPM, hopeful yet uncertain, no vocals, NOT action movie,
documentary gravitas, 21st century contemplation
```

### Peace/War Variants

```
[ERA]_PEACE (add to main prompt):
...peaceful variant, pastoral and serene, domestic prosperity,
afternoon sunlight warmth, strings lead over brass, reduced
percussion, major key inflections, hopeful and productive...

[ERA]_WAR (add to main prompt):
...strategic war variant, building tension, military drums added,
minor key shifts, brass takes lead, controlled intensity,
chess-game stakes not action chaos, menacing but measured...
```

### Civilization Motifs

```
CIV_ROME:
Roman Empire musical motif, brass fanfares, military drums,
Latin dignity, SPQR grandeur, 45 seconds, loopable, noble and
powerful, no vocals, NOT gladiator action, senatorial dignity

CIV_GREECE:
Ancient Greek musical motif, lyre and kithara, aulos flute,
Dorian mode, Athenian philosophy, Olympic nobility, 45 seconds,
loopable, contemplative and refined, no vocals

CIV_EGYPT:
Ancient Egyptian musical motif, ney flute melody, sistrum,
frame drums, Nile eternal flow, pyramid mystery, 45 seconds,
loopable, sacred and ancient, no vocals, NOT mummy movie

CIV_PERSIA:
Persian Empire musical motif, santur and tar, daf frame drum,
maqam scales, Persepolis gardens, silk road wealth, 45 seconds,
loopable, ornate and elegant, no vocals, Zoroastrian dignity

CIV_CHINA:
Chinese Empire musical motif, erhu and pipa, guzheng,
pentatonic scale, Forbidden City grandeur, jade and silk,
45 seconds, loopable, scholarly and eternal, no vocals

CIV_ENGLAND:
British Empire musical motif, noble brass, Elgar-style strings,
Rule Britannia dignity, naval power, 45 seconds, loopable,
Victorian pride, no vocals, NOT pompous, refined strength

CIV_ARABIA:
Arabian Caliphate musical motif, oud and qanun, riq percussion,
Andalusian maqam, Baghdad wisdom, scholarly and spiritual,
45 seconds, loopable, no vocals, NOT belly dance or action movie,
Alhambra palace elegance

CIV_AZTEC:
Aztec Empire musical motif, huehuetl log drums, teponaztli,
clay ocarinas, Tenochtitlan temples, pre-Columbian ceremonial,
45 seconds, loopable, no vocals, NOT Hollywood tribal,
jungle ritual dignity

CIV_INDIA:
Indian Empire musical motif, sitar and tabla, tanpura drone,
raga-inspired, Mughal grandeur, Ganges spirituality,
45 seconds, loopable, ornate and meditative, no vocals,
dharmic wisdom

CIV_JAPAN:
Japanese Shogunate musical motif, shakuhachi and koto,
taiko accents, Edo refinement, samurai honor, zen simplicity,
45 seconds, loopable, controlled beauty, no vocals,
cherry blossom contemplation

CIV_RUSSIA:
Russian Empire musical motif, balalaika, bayan accordion hints,
Slavic choir, winter vastness, Orthodox bells, Tchaikovsky echoes,
45 seconds, loopable, powerful and soulful, melancholic nobility

CIV_GERMANY:
German States musical motif, Prussian brass discipline,
Bach counterpoint hints, Gothic cathedral, Rhine romanticism,
45 seconds, loopable, orderly and powerful, no vocals,
intellectual rigor
```

---

## Appendix B: Post-Production Checklist

### Per-Track Processing Chain

1. **Import** raw Suno output to DAW (Audacity free, Logic/Ableton better)
2. **Trim** silence from start/end
3. **Find loop point** (if applicable):
   - Listen for natural phrase endings
   - Mark potential loop points
   - Test crossfade (100-200ms)
4. **Normalize** to target LUFS (use meter plugin)
5. **EQ** if needed:
   - Gentle high-pass at 40Hz (remove rumble)
   - Slight warmth boost around 200-400Hz
   - Tame harshness at 2-4kHz if present
6. **Compression** (gentle):
   - Ratio 2:1 or less
   - Only if dynamics too extreme
7. **Export**:
   - Music: OGG Vorbis 192kbps
   - Ambiance: OGG Vorbis 128kbps
   - SFX: WAV 16-bit 44.1kHz

### Final Quality Pass

- [ ] All tracks at target loudness (±1 LUFS)
- [ ] No clipping on any track
- [ ] All loops tested (30+ second listen)
- [ ] Naming convention consistent
- [ ] Folder structure correct
- [ ] Manifest file updated

---

## Sign-Off

This plan covers ~57 audio assets totaling approximately 75 minutes of content.

**Estimated total production time:** 40-50 hours over 4 weeks

**Recommended approach:** Complete Phase 1-2 first (era themes + UI SFX),
then playtest with those before completing remaining phases. This validates
the style direction before committing to all 57 assets.

Good luck. Make it warm.
