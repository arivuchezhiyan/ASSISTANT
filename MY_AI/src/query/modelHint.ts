import type { ComplexityScore } from './complexityEstimator.js'
import type { IntentSignal } from './intentClassifier.js'

export function getModelHint(
  intent: IntentSignal,
  complexity: ComplexityScore,
): string | undefined {
  const defaultModel = process.env.DEFAULT_MAIN_MODEL
  const codeModel = process.env.CODE_MODEL
  const tinyModel = process.env.FALLBACK_MODEL || process.env.INTENT_MODEL

  if (intent.category === 'system' && complexity.level === 'low') {
    return tinyModel || defaultModel
  }

  if (intent.category === 'code' || intent.category === 'unreal') {
    if (complexity.level === 'high') {
      return codeModel || defaultModel
    }
    return defaultModel
  }

  if (intent.category === 'analysis' && complexity.level === 'high') {
    return codeModel || defaultModel
  }

  return defaultModel
}
