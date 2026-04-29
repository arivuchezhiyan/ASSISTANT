# JARVIS — Complete Setup & Usage Guide

## What JARVIS Does

| Feature | Description |
|---|---|
| 🚀 Boot greeting | Speaks to you like Iron Man's JARVIS on every Windows login |
| 🌦️ Weather + Forecast | Auto-fetches local weather and speaks the 5-day forecast |
| 🎙️ Wake word | Say **"Hey Jarvis"** — it activates from any state |
| 🖥️ App control | Open/close/control any app on your PC by voice |
| 🎮 Unreal Engine | Create projects, place cubes, scale planes — all by voice |
| 🌐 Web control | Google searches, YouTube, open any website |
| 🤖 AI brain | Powered by Ollama (local LLM) for open-ended questions |
| 📸 Screenshot | "Hey Jarvis, take a screenshot" |
| 🔊 Volume | "Hey Jarvis, increase volume" |
| 💻 Terminal | "Hey Jarvis, run ipconfig" |

---

## Step 1 — Install Python dependencies

```bash
cd C:\Users\arivu\Downloads\AI_CODE\MY_AI\jarvis
pip install -r requirements.txt
```

> If `pyaudio` fails on Windows, install it via:
> ```
> pip install pipwin
> pipwin install pyaudio
> ```

---

## Step 2 — Install Ollama (for full AI intelligence)

1. Download **Ollama** from [https://ollama.com/download](https://ollama.com/download)
2. Install it (it runs as a background service automatically)
3. Pull the AI model:
```bash
ollama pull llama3
```
> You can also use `mistral`, `phi3`, `gemma3` — edit `OLLAMA_MODEL` in `jarvis_main.py`

---

## Step 3 — Run JARVIS now (test)

Open PowerShell in `C:\Users\arivu\Downloads\AI_CODE\MY_AI` and run:

```bash
python -m jarvis.jarvis_main
```

You'll see the boot animation and hear JARVIS greet you with weather info.

---

## Step 4 — Auto-start on Windows login

Run once as Administrator:

```powershell
cd C:\Users\arivu\Downloads\AI_CODE\MY_AI\jarvis
powershell -ExecutionPolicy Bypass -File .\install_startup.ps1
```

After this, **JARVIS wakes up automatically every time you turn on your laptop**.

---

## Voice Commands You Can Say

After saying **"Hey Jarvis"**:

### Weather
- *"What's the weather today?"*
- *"Give me the forecast for this week"*
- *"Will it rain tomorrow?"*

### Date & Time
- *"What time is it?"*
- *"What's today's date?"*

### Apps
- *"Open Chrome"*
- *"Open VS Code"*
- *"Launch Notepad"*
- *"Close Notepad"*

### Unreal Engine
- *"Open Unreal Engine"*
- *"Create a new project named Project204"*
- *"Place a cube in the scene"*
- *"Increase the plane length to 5 and breadth to 3"*

### Web
- *"Search for Unreal Engine navmesh tutorial"*
- *"Search YouTube for Python tutorial"*
- *"Open github.com"*

### System
- *"Take a screenshot"*
- *"Increase volume"*
- *"Mute"*
- *"Run ipconfig"*
- *"Run dir C:\Users"*

### AI Questions (requires Ollama)
- *"What is quantum computing?"*
- *"How do I make a loop in Python?"*
- *"Explain black holes"*
- Anything — JARVIS uses a local LLM to answer

---

## File Structure

```
jarvis/
├── jarvis_main.py          ← Entry point / run this
├── install_startup.ps1     ← Auto-start installer (run as Admin once)
├── requirements.txt        ← Python dependencies
├── __init__.py
├── data/
│   ├── jarvis_memory/      ← Persistent vector memory (ChromaDB)
│   └── checkpoints/        ← Session checkpoints (crash recovery)
└── core/
    ├── __init__.py
    ├── boot.py             ← Boot animation + greeting
    ├── voice.py            ← TTS, STT, wake-word
    ├── weather.py          ← Free weather API (no key needed)
    ├── automation.py       ← Desktop + Unreal Engine automation
    ├── brain.py            ← Command parser + Ollama AI
    └── checkpoint.py       ← Crash recovery + resumable checkpoints
```

---

## Crash Recovery & Checkpoints

JARVIS automatically checkpoints its session state every 2 minutes. If the system crashes or is killed unexpectedly:

1. **On next launch**, JARVIS detects the stale session lock file
2. **Loads the last checkpoint** — including conversation history and context
3. **Restores your session** automatically and announces the recovery via voice

This means you never lose your conversation context, even after a power failure or blue screen.

**How it works:**
- A `session.lock` file tracks the running PID
- On clean shutdown (`Ctrl+C`), the lock is removed and a `.clean_exit` marker is written
- If JARVIS starts and finds a lock with a dead PID and no clean exit marker → **crash detected**
- Checkpoint history is pruned to the last 10 snapshots

---

## Updating Unreal Engine Path

Edit `jarvis/core/automation.py`, find `APP_MAP` and update the Unreal Engine path:

```python
"unreal engine": r"C:\Program Files\Epic Games\UE_5.4\Engine\Binaries\Win64\UnrealEditor.exe",
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| No microphone input | Check Windows mic permissions: Settings → Privacy → Microphone |
| PyAudio install error | `pip install pipwin` then `pipwin install pyaudio` |
| TTS not speaking | Check Windows has TTS voices: Settings → Speech |
| Ollama not responding | Run `ollama serve` in a terminal, then try again |
| Wake word not detected | Speak clearly; check mic is the default input device |
