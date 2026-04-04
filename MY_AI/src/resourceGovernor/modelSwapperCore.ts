import type { GovernorMode } from './types.js'

export type ModelSwapperState = {
  lastAppliedMode: GovernorMode | null
  lastAppliedModel: string | null
}

export function createModelSwapperState(): ModelSwapperState {
  return {
    lastAppliedMode: null,
    lastAppliedModel: null,
  }
}

export function getModelForMode(mode: GovernorMode): string | undefined {
  const full = process.env.GOVERNOR_MODEL_FULL || process.env.DEFAULT_MAIN_MODEL
  const reduced =
    process.env.GOVERNOR_MODEL_REDUCED || process.env.DEFAULT_MAIN_MODEL
  const minimal =
    process.env.GOVERNOR_MODEL_MINIMAL ||
    process.env.FALLBACK_MODEL ||
    process.env.INTENT_MODEL

  switch (mode) {
    case 'full':
      return full
    case 'reduced':
      return reduced || full
    case 'minimal':
    case 'emergency':
      return minimal || reduced || full
  }
}

export function applyModeToSwapperState(
  state: ModelSwapperState,
  mode: GovernorMode,
): { model?: string; changed: boolean } {
  process.env.RESOURCE_GOVERNOR_MODE = mode
  const model = getModelForMode(mode)
  if (!model) {
    return { changed: false }
  }

  if (state.lastAppliedMode === mode && state.lastAppliedModel === model) {
    return { model, changed: false }
  }

  state.lastAppliedMode = mode
  state.lastAppliedModel = model
  return { model, changed: true }
}
