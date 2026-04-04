export type SidecarTtsRequest = {
  text: string
  voice?: string
  rate?: number
  format?: 'wav'
}

export type SidecarTtsResponse = {
  audioBase64: string
  format: 'wav'
  sampleRateHz: number
  engine: string
}

function getSidecarBaseUrl(): string {
  const port = process.env.PYTHON_SIDECAR_PORT || '7823'
  return `http://127.0.0.1:${port}`
}

export async function synthesizeSpeechWithSidecar(
  request: SidecarTtsRequest,
): Promise<SidecarTtsResponse> {
  const response = await fetch(`${getSidecarBaseUrl()}/voice/tts/synthesize`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      text: request.text,
      voice: request.voice,
      rate: request.rate,
      format: request.format ?? 'wav',
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`TTS sidecar request failed (${response.status}): ${detail}`)
  }

  const payload = (await response.json()) as {
    audio_base64?: string
    format?: 'wav'
    sample_rate_hz?: number
    engine?: string
  }

  if (!payload.audio_base64 || payload.audio_base64.trim().length === 0) {
    throw new Error('TTS sidecar returned empty audio')
  }

  return {
    audioBase64: payload.audio_base64,
    format: payload.format ?? 'wav',
    sampleRateHz: payload.sample_rate_hz ?? 22050,
    engine: payload.engine ?? 'unknown',
  }
}
