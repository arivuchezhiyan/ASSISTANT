import { registerCleanup } from 'src/utils/cleanupRegistry.js'
import { isEnvTruthy } from 'src/utils/envUtils.js'

import {
  decideGovernorMode,
  getGovernorThresholds,
  getModeConfig,
  getModeReason,
} from './modes.js'
import { sampleResources } from './monitor.js'
import type { GovernorCallbacks, GovernorState } from './types.js'

function getPollIntervalMs(): number {
  const raw = process.env.POLL_INTERVAL_MS
  const parsed = raw ? Number(raw) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5000
  }
  return parsed
}

export function isResourceGovernorEnabled(): boolean {
  return isEnvTruthy(process.env.RESOURCE_GOVERNOR_ENABLED)
}

export function startResourceGovernor(callbacks: GovernorCallbacks = {}): () => void {
  if (!isResourceGovernorEnabled()) {
    return () => {}
  }

  const thresholds = getGovernorThresholds()
  let current: GovernorState | null = null
  let stopped = false

  const runOneSample = async () => {
    if (stopped) return

    const snapshot = await sampleResources()
    const mode = decideGovernorMode(snapshot, thresholds)
    const next: GovernorState = {
      mode,
      snapshot,
      reason: getModeReason(mode, snapshot, thresholds),
      modeConfig: getModeConfig(mode),
    }

    callbacks.onSample?.(next)

    if (!current || current.mode !== next.mode) {
      callbacks.onModeChange?.(next, current)
    }

    current = next
  }

  void runOneSample()
  const timer = setInterval(() => {
    void runOneSample()
  }, getPollIntervalMs())

  const stop = () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }

  registerCleanup(async () => {
    stop()
  })

  return stop
}
