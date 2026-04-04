import {
  type SidecarSttRequest,
  type SidecarSttResponse,
  transcribeWithSidecar,
} from './sttAdapter.js'
import {
  type SidecarTtsRequest,
  type SidecarTtsResponse,
  synthesizeSpeechWithSidecar,
} from './ttsAdapter.js'

export type VoiceBackend = 'sidecar' | 'anthropic'

function readBackendEnv(value: string | undefined): VoiceBackend {
  if (value === 'anthropic') return 'anthropic'
  return 'sidecar'
}

export function getWakeHotkeyDisplay(): string {
  return process.env.VOICE_WAKE_HOTKEY_DISPLAY || 'Space'
}

export function getSttBackend(): VoiceBackend {
  return readBackendEnv(process.env.VOICE_STT_BACKEND)
}

export function getTtsBackend(): VoiceBackend {
  return readBackendEnv(process.env.VOICE_TTS_BACKEND)
}

export async function routeSttTranscription(
  request: SidecarSttRequest,
): Promise<SidecarSttResponse> {
  const backend = getSttBackend()
  if (backend === 'sidecar') {
    return transcribeWithSidecar(request)
  }

  if (request.textFallback && request.textFallback.trim().length > 0) {
    return {
      text: request.textFallback.trim(),
      language: request.language ?? null,
      model: 'anthropic_stub',
    }
  }

  throw new Error('Anthropic STT routing is not implemented in this phase')
}

export async function routeTtsSynthesis(
  request: SidecarTtsRequest,
): Promise<SidecarTtsResponse> {
  const backend = getTtsBackend()
  if (backend === 'sidecar') {
    return synthesizeSpeechWithSidecar(request)
  }

  throw new Error('Anthropic TTS routing is not implemented in this phase')
}
