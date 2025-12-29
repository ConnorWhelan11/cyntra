#!/bin/bash
# Generate placeholder audio files for Backbay Imperium
# These are short silent/tone OGG files as placeholders

AUDIO_DIR="../client/assets/audio"
cd "$(dirname "$0")"
mkdir -p "$AUDIO_DIR"

# Function to generate a short tone placeholder
generate_tone() {
    local name=$1
    local duration=$2
    local freq=${3:-440}  # Default A4 note

    ffmpeg -y -f lavfi -i "sine=frequency=${freq}:duration=${duration}" \
        -c:a libvorbis -q:a 3 \
        "$AUDIO_DIR/${name}.ogg" 2>/dev/null
    echo "Generated: ${name}.ogg (${duration}s, ${freq}Hz)"
}

# Function to generate silence
generate_silence() {
    local name=$1
    local duration=$2

    ffmpeg -y -f lavfi -i "anullsrc=r=44100:cl=mono" -t "$duration" \
        -c:a libvorbis -q:a 3 \
        "$AUDIO_DIR/${name}.ogg" 2>/dev/null
    echo "Generated: ${name}.ogg (${duration}s silence)"
}

# Function to generate a simple click (very short high freq)
generate_click() {
    local name=$1

    ffmpeg -y -f lavfi -i "sine=frequency=2000:duration=0.05" \
        -af "afade=t=out:st=0.03:d=0.02" \
        -c:a libvorbis -q:a 3 \
        "$AUDIO_DIR/${name}.ogg" 2>/dev/null
    echo "Generated: ${name}.ogg (click)"
}

# Function to generate a descending tone (for close/error)
generate_descend() {
    local name=$1
    local duration=$2

    ffmpeg -y -f lavfi -i "sine=frequency=800:duration=${duration}" \
        -af "asetrate=44100*0.8,atempo=1.25,afade=t=out:st=0:d=${duration}" \
        -c:a libvorbis -q:a 3 \
        "$AUDIO_DIR/${name}.ogg" 2>/dev/null
    echo "Generated: ${name}.ogg (descending tone)"
}

# Function to generate an ascending tone (for open/complete)
generate_ascend() {
    local name=$1
    local duration=$2

    ffmpeg -y -f lavfi -i "sine=frequency=400:duration=${duration}" \
        -af "asetrate=44100*1.2,atempo=0.833,afade=t=in:st=0:d=0.05,afade=t=out:st=0.1:d=0.1" \
        -c:a libvorbis -q:a 3 \
        "$AUDIO_DIR/${name}.ogg" 2>/dev/null
    echo "Generated: ${name}.ogg (ascending tone)"
}

echo "Generating placeholder audio files..."
echo ""

# UI Sounds
generate_click "ui_click"
generate_ascend "ui_open" 0.2
generate_descend "ui_close" 0.15
generate_descend "ui_error" 0.25

# Unit Sounds
generate_tone "unit_select" 0.15 660
generate_tone "unit_move" 0.3 330
generate_tone "unit_move_complete" 0.2 440

# Combat Sounds
generate_tone "attack_melee" 0.4 220
generate_tone "attack_ranged" 0.5 550
generate_tone "attack_siege" 0.7 110
generate_descend "unit_death" 0.5
generate_tone "unit_damaged" 0.25 330

# City Sounds
generate_ascend "city_founded" 1.0
generate_ascend "city_captured" 1.2
generate_tone "production_complete" 0.6 880

# Game Event Sounds
generate_ascend "turn_start" 0.4
generate_click "turn_end"
generate_ascend "tech_complete" 0.8

# Victory/Defeat (longer)
generate_ascend "victory" 3.0
generate_descend "defeat" 3.0

echo ""
echo "Done! Generated $(ls -1 "$AUDIO_DIR"/*.ogg 2>/dev/null | wc -l | tr -d ' ') audio files."
echo "Location: $AUDIO_DIR/"
