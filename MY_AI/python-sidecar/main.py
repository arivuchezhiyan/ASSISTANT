from __future__ import annotations

import base64
import io
import math
import os
import struct
import subprocess
import tempfile
from typing import Optional
import wave

import psutil
import pyperclip
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="MY_AI Python Sidecar", version="0.1.0")


class LaunchRequest(BaseModel):
    app_path: str = Field(..., min_length=1)
    args: list[str] = Field(default_factory=list, max_length=16)


class ClipboardWriteRequest(BaseModel):
    text: str


class ProcessCheckRequest(BaseModel):
    process_name: str = Field(..., min_length=1)


class WindowFocusRequest(BaseModel):
    window_title: str = Field(..., min_length=1)


class SttRequest(BaseModel):
    audio_path: Optional[str] = None
    audio_base64: Optional[str] = None
    language: Optional[str] = None
    prompt: Optional[str] = None
    text_fallback: Optional[str] = None


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: Optional[str] = None
    rate: Optional[int] = None
    format: str = "wav"


_WHISPER_MODEL = None


def _is_whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except Exception:
        return False


def _safe_env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _load_whisper_model():
    global _WHISPER_MODEL
    if _WHISPER_MODEL is not None:
        return _WHISPER_MODEL

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"faster-whisper unavailable: {exc}",
        ) from exc

    model_name = os.getenv("STT_MODEL", "small.en")
    compute_type = os.getenv("STT_COMPUTE_TYPE", "int8")
    _WHISPER_MODEL = WhisperModel(model_name, compute_type=compute_type)
    return _WHISPER_MODEL


def _build_tone_wav_bytes(text: str, sample_rate_hz: int = 22050) -> bytes:
    # Fallback TTS: generate a short tone so downstream playback pipeline can be validated.
    duration_seconds = max(0.2, min(4.0, len(text) * 0.04))
    frequency_hz = 440.0
    amplitude = 12000
    sample_count = int(sample_rate_hz * duration_seconds)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate_hz)
        for i in range(sample_count):
            angle = 2.0 * 3.141592653589793 * frequency_hz * (i / sample_rate_hz)
            sample = int(amplitude * math.sin(angle))
            wav_file.writeframesraw(struct.pack("<h", sample))
    return buffer.getvalue()


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "sidecar": "python",
        "stt_model": os.getenv("STT_MODEL", "small.en"),
        "stt_available": "true" if _is_whisper_available() else "false",
        "tts_engine": "fallback_tone",
    }


@app.get("/voice/capabilities")
def voice_capabilities() -> dict[str, str | bool | int]:
    return {
        "stt_available": _is_whisper_available(),
        "stt_model": os.getenv("STT_MODEL", "small.en"),
        "tts_engine": "fallback_tone",
        "tts_sample_rate_hz": 22050,
        "max_text_fallback_chars": 4096,
    }


@app.get("/resource/summary")
def resource_summary() -> dict[str, float]:
    vm = psutil.virtual_memory()
    return {
        "ram_total_gb": vm.total / (1024**3),
        "ram_used_gb": vm.used / (1024**3),
        "ram_percent": vm.percent,
    }


@app.post("/system/open-app")
def open_app(req: LaunchRequest) -> dict[str, str]:
    if len(req.app_path.strip()) == 0:
        raise HTTPException(status_code=400, detail="app_path is required")
    if any(len(arg) > 256 for arg in req.args):
        raise HTTPException(status_code=400, detail="arg too long")
    try:
        subprocess.Popen([req.app_path, *req.args])
        return {"status": "launched"}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"launch failed: {exc}") from exc


@app.post("/system/clipboard/write")
def clipboard_write(req: ClipboardWriteRequest) -> dict[str, str]:
    try:
        pyperclip.copy(req.text)
        return {"status": "ok"}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"clipboard write failed: {exc}") from exc


@app.get("/system/clipboard/read")
def clipboard_read() -> dict[str, str]:
    try:
        return {"text": pyperclip.paste()}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"clipboard read failed: {exc}") from exc


@app.post("/system/process/exists")
def process_exists(req: ProcessCheckRequest) -> dict[str, bool]:
    target = req.process_name.lower()
    for process in psutil.process_iter(["name"]):
        name: Optional[str] = process.info.get("name")
        if name and name.lower() == target:
            return {"exists": True}
    return {"exists": False}


@app.post("/system/window/focus")
def window_focus(req: WindowFocusRequest) -> dict[str, bool]:
    if os.name != "nt":
        raise HTTPException(status_code=400, detail="window focus is currently supported on Windows only")

    # AppActivate returns True when a window matching the title is focused.
    ps_script = (
        "$wshell = New-Object -ComObject wscript.shell;"
        f"$ok = $wshell.AppActivate('{req.window_title}');"
        "if ($ok) { exit 0 } else { exit 1 }"
    )

    completed = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_script],
        capture_output=True,
        text=True,
    )
    return {"focused": completed.returncode == 0}


@app.post("/voice/stt/transcribe")
def stt_transcribe(req: SttRequest) -> dict[str, Optional[str]]:
    if req.text_fallback:
        if len(req.text_fallback) > 4096:
            raise HTTPException(status_code=400, detail="text_fallback too long")
        return {
            "text": req.text_fallback.strip(),
            "language": req.language,
            "model": "fallback",
        }

    if req.audio_path and req.audio_base64:
        raise HTTPException(status_code=400, detail="provide only one of audio_path or audio_base64")

    model = _load_whisper_model()

    input_path = req.audio_path
    temp_path: Optional[str] = None
    if not input_path:
        if not req.audio_base64:
            raise HTTPException(status_code=400, detail="audio_path or audio_base64 is required")
        try:
            audio_bytes = base64.b64decode(req.audio_base64)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"invalid audio_base64: {exc}") from exc
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        try:
            tmp.write(audio_bytes)
            temp_path = tmp.name
            input_path = temp_path
        finally:
            tmp.close()

    try:
        if not os.path.exists(input_path):
            raise HTTPException(status_code=400, detail=f"audio path not found: {input_path}")

        segments, info = model.transcribe(
            input_path,
            language=req.language,
            initial_prompt=req.prompt,
        )
        text = "".join(segment.text for segment in segments).strip()
        if not text:
            raise HTTPException(status_code=422, detail="empty transcript")
        return {
            "text": text,
            "language": getattr(info, "language", req.language),
            "model": os.getenv("STT_MODEL", "small.en"),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"stt failed: {exc}") from exc
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/voice/tts/synthesize")
def tts_synthesize(req: TtsRequest) -> dict[str, Optional[str] | int]:
    if req.format.lower() != "wav":
        raise HTTPException(status_code=400, detail="only wav format is supported")

    try:
        wav_bytes = _build_tone_wav_bytes(req.text)
        return {
            "audio_base64": base64.b64encode(wav_bytes).decode("ascii"),
            "format": "wav",
            "sample_rate_hz": 22050,
            "engine": "fallback_tone",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"tts failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    port = _safe_env_int("PYTHON_SIDECAR_PORT", 7823)
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=False)
