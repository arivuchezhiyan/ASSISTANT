# Voice UI (Jarvis-style)

## Run

1. Start sidecar and CLI health check:

powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-ai.ps1 -CheckOnly

2. Run UI server:

python -m http.server 8091 -d "C:\Users\arivu\Downloads\AI_CODE\MY_AI\web-ui"

3. Open in browser:

http://127.0.0.1:8091/index.html

## UX Flow

1. Set assistant name (custom wake name).
2. Set wake prefix (Hey, Ok, or Hello).
3. Click Start Listening.
4. Say wake phrase, for example: Hey Jarvis.
5. Assistant greets and asks what to do.
6. Speak command, transcript appears live.
7. Analysis panel shows intent, confidence, entities, and action plan.

## Notes

- Browser speech recognition requires microphone permission and a supported browser.
- System actions are routed to local sidecar endpoint when reachable.
- If sidecar is down, UI still performs analysis and simulated response.
