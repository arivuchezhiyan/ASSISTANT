export type SidecarSttRequest = {
  audioPath?: string
  audioBase64?: string
  language?: string
  prompt?: string
  textFallback?: string
}

export type SidecarSttResponse = {
  text: string
  language?: string | null
  model?: string | null
}

function getSidecarBaseUrl(): string {
  const port = process.env.PYTHON_SIDECAR_PORT || '7823'
  return `http://127.0.0.1:${port}`
}

export async function transcribeWithSidecar(
  request: SidecarSttRequest,
): Promise<SidecarSttResponse> {
  const response = await fetch(`${getSidecarBaseUrl()}/voice/stt/transcribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_path: request.audioPath,
      audio_base64: request.audioBase64,
      language: request.language,
      prompt: request.prompt,
      text_fallback: request.textFallback,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`STT sidecar request failed (${response.status}): ${detail}`)
  }

  const payload = (await response.json()) as SidecarSttResponse
  if (!payload.text || payload.text.trim().length === 0) {
    throw new Error('STT sidecar returned an empty transcript')
  }

  return payload
}
