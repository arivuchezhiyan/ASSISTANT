import type { ComplexityScore } from './complexityEstimator.js'
import type { IntentSignal } from './intentClassifier.js'

export type LocalModelRouteInput = {
  intent: IntentSignal
  complexity: ComplexityScore
  governorMode?: 'full' | 'reduced' | 'minimal' | 'emergency'
}

export type LocalModelRoute = {
  primaryModel?: string
  fallbackModel?: string
  routeCode: number
}

function getGovernorModeFromEnv():
  | 'full'
  | 'reduced'
  | 'minimal'
  | 'emergency'
  | undefined {
  const raw = process.env.RESOURCE_GOVERNOR_MODE
  if (
    raw === 'full' ||
    raw === 'reduced' ||
    raw === 'minimal' ||
    raw === 'emergency'
  ) {
    return raw
  }
  return undefined
}

export function resolveLocalModelRoute(
  input: LocalModelRouteInput,
): LocalModelRoute {
  const defaultModel = process.env.DEFAULT_MAIN_MODEL
  const codeModel = process.env.CODE_MODEL
  const tinyModel = process.env.FALLBACK_MODEL || process.env.INTENT_MODEL

  const governorMode = input.governorMode ?? getGovernorModeFromEnv()

  // Governor safety first: minimal/emergency always force tiny route.
  if (governorMode === 'minimal' || governorMode === 'emergency') {
    return {
      primaryModel: tinyModel || defaultModel,
      fallbackModel: tinyModel || defaultModel,
      routeCode: 1,
    }
  }

  // Code-heavy tasks prefer code model when complexity is elevated.
  if (
    (input.intent.category === 'code' || input.intent.category === 'unreal') &&
    input.complexity.level !== 'low'
  ) {
    return {
      primaryModel: codeModel || defaultModel,
      fallbackModel: tinyModel || defaultModel,
      routeCode: 2,
    }
  }

  // Default path for chat/automation/analysis.
  return {
    primaryModel: defaultModel,
    fallbackModel: tinyModel || defaultModel,
    routeCode: 3,
  }
}
