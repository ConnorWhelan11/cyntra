# Audio Generator Setup

Automated audio generation for Backbay Imperium using Suno + ElevenLabs.

## Prerequisites

- Python 3.10+
- Suno Pro/Premier subscription ($10-30/month)
- 2Captcha account (~$3 for 1000 solves)
- ElevenLabs account (free tier works for SFX)

## Quick Start

```bash
# 1. Install dependencies
pip install httpx pyyaml

# 2. Set up Suno API (see below)
# 3. Set environment variables
export SUNO_API_URL="http://localhost:3000"
export ELEVENLABS_API_KEY="your_key_here"

# 4. Check APIs are working
python generator/generate.py --check

# 5. Generate!
python generator/generate.py --phase style_tests
```

---

## Part 1: Suno API Setup (gcui-art/suno-api)

### 1.1 Clone and Install

```bash
# Clone the repo
git clone https://github.com/gcui-art/suno-api.git
cd suno-api

# Install dependencies
npm install
```

### 1.2 Get Your Suno Cookie

1. Go to [suno.com/create](https://suno.com/create) and log in
2. Open DevTools (F12) → Network tab
3. Refresh the page
4. Find a request with `?__clerk_api_version` in the URL
5. Click it → Headers tab → Copy the entire `Cookie` value

### 1.3 Get 2Captcha API Key

1. Create account at [2captcha.com](https://2captcha.com)
2. Add $3-5 balance (goes a long way)
3. Go to Dashboard → Get API Key

### 1.4 Configure Environment

Create `.env` in the suno-api folder:

```env
SUNO_COOKIE=<your_full_cookie_string>
TWOCAPTCHA_KEY=<your_2captcha_api_key>
BROWSER=chromium
BROWSER_GHOST_CURSOR=false
BROWSER_LOCALE=en
BROWSER_HEADLESS=true
```

### 1.5 Start the Server

```bash
npm run dev
```

Test it's working:
```bash
curl http://localhost:3000/api/get_limit
# Should return: {"credits_left": 50, ...}
```

### 1.6 Cost Estimate

- **Suno Premier**: $30/month = 2000 credits (400 songs)
- **2Captcha**: ~$0.003 per solve, maybe 50-100 solves needed = ~$0.30
- **Total for project**: ~$30-35

---

## Part 2: ElevenLabs Setup

### 2.1 Get API Key

1. Create account at [elevenlabs.io](https://elevenlabs.io)
2. Go to Profile → API Keys
3. Create new API key

### 2.2 Set Environment Variable

```bash
export ELEVENLABS_API_KEY="your_key_here"
```

### 2.3 Cost Estimate

- **Free tier**: 10,000 characters/month
- **Sound effects**: ~40 credits per second of audio
- **18 UI sounds × ~1 sec avg = ~720 credits**
- **6 ambiance × 30 sec = ~7,200 credits**

Free tier should cover UI SFX. May need Starter ($5/mo) for ambiance.

---

## Part 3: Running Generation

### Check APIs

```bash
cd fab/backbay-imperium/audio
python generator/generate.py --check
```

Expected output:
```
API Status:
  suno: OK
  elevenlabs: OK

Suno Credits: 400
ElevenLabs: 1234/10000 characters used
```

### Generate by Phase

```bash
# Style tests first (calibration)
python generator/generate.py --phase style_tests

# Then production phases
python generator/generate.py --phase era_themes
python generator/generate.py --phase ui_sfx
python generator/generate.py --phase civ_motifs
python generator/generate.py --phase fanfares
python generator/generate.py --phase ambiance
```

### Generate Everything

```bash
python generator/generate.py --all
```

---

## Part 4: Output Structure

After generation:

```
fab/backbay-imperium/audio/
├── raw/
│   ├── style_tests/
│   │   ├── style_01_ancient_a.mp3
│   │   ├── style_01_ancient_b.mp3
│   │   └── ...
│   ├── era_themes/
│   │   ├── ancient_main_v1.mp3
│   │   ├── ancient_main_v2.mp3
│   │   └── ...
│   ├── civ_motifs/
│   ├── fanfares/
│   ├── sfx/
│   └── ambiance/
├── edited/      # Post-processed files
└── final/       # Game-ready exports
```

---

## Part 5: Post-Processing

After generation, you'll need to:

1. **Listen and select** best variants
2. **Edit loop points** (find natural phrase endings)
3. **Normalize loudness** (-14 LUFS for music)
4. **Export to OGG** for game integration

Recommended tools:
- **Audacity** (free) - Basic editing
- **ffmpeg** - Batch format conversion
- **Youlean Loudness Meter** - LUFS normalization

### Batch Convert to OGG

```bash
# Convert all selected MP3s to OGG
for f in final/music/*.mp3; do
    ffmpeg -i "$f" -c:a libvorbis -q:a 6 "${f%.mp3}.ogg"
done
```

---

## Troubleshooting

### Suno API returns 401

Your cookie expired. Get a fresh one from suno.com.

### Suno API stuck on captcha

- Check 2Captcha balance
- Try `BROWSER_HEADLESS=false` to see what's happening
- macOS gets fewer captchas than Linux/Windows

### ElevenLabs rate limit

Free tier is limited. Wait or upgrade to Starter.

### Generation times out

Suno can be slow. Increase `max_wait` in config.yaml.

---

## Alternative: Semi-Automated Mode

If you prefer more control, use the prompts from `config.yaml` manually:

1. Open [suno.com](https://suno.com)
2. Copy prompts from `config.yaml`
3. Generate → Download
4. Name files according to convention

The `generate.py` script is just convenience - you can always fall back to manual.
