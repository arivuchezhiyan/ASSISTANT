export type OpenAppRequest = {
  appPath: string
  args?: string[]
}

export type WindowFocusRequest = {
  windowTitle: string
}

export type SidecarHealth = {
  status: string
  sidecar?: string
  stt_model?: string
  tts_engine?: string
}

function getSidecarBaseUrl(): string {
  const port = process.env.PYTHON_SIDECAR_PORT || '7823'
  return `http://127.0.0.1:${port}`
}

function getSidecarTimeoutMs(): number {
  const raw = process.env.PYTHON_SIDECAR_TIMEOUT_MS
  const parsed = raw ? Number(raw) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3000
  }
  return Math.floor(parsed)
}

function normalizeErrorMessage(
  endpoint: string,
  status: number,
  payloadText: string,
): string {
  try {
    const payload = JSON.parse(payloadText) as { detail?: unknown }
    if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
      return `Sidecar ${endpoint} failed (${status}): ${payload.detail}`
    }
  } catch {
    // Fall through to raw text fallback.
  }

  const detail = payloadText.trim()
  return detail.length > 0
    ? `Sidecar ${endpoint} failed (${status}): ${detail}`
    : `Sidecar ${endpoint} failed (${status})`
}

async function sidecarRequest<TResponse>(
  endpoint: string,
  init?: RequestInit,
): Promise<TResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getSidecarTimeoutMs())
  try {
    const response = await fetch(`${getSidecarBaseUrl()}${endpoint}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.headers ?? {}),
      },
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(normalizeErrorMessage(endpoint, response.status, detail))
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('application/json')) {
      return (await response.json()) as TResponse
    }

    return undefined as TResponse
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Sidecar ${endpoint} request timed out after ${getSidecarTimeoutMs()}ms`,
      )
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function getSidecarHealth(): Promise<SidecarHealth> {
  return sidecarRequest<SidecarHealth>('/health')
}

export async function openAppWithSidecar(req: OpenAppRequest): Promise<void> {
  await sidecarRequest<void>('/system/open-app', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      app_path: req.appPath,
      args: req.args ?? [],
    }),
  })
}

export async function writeClipboardWithSidecar(text: string): Promise<void> {
  await sidecarRequest<void>('/system/clipboard/write', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })
}

export async function readClipboardWithSidecar(): Promise<string> {
  const payload = await sidecarRequest<{ text?: string }>(
    '/system/clipboard/read',
  )
  return payload.text ?? ''
}

export async function focusWindowWithSidecar(
  req: WindowFocusRequest,
): Promise<boolean> {
  const payload = await sidecarRequest<{ focused?: boolean }>(
    '/system/window/focus',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ window_title: req.windowTitle }),
    },
  )
  return payload.focused === true
}
