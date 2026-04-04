import type { IntentSignal } from './intentClassifier.js'

export type ComplexityScore = {
  level: 'low' | 'medium' | 'high'
  score: number
}

export function estimateComplexity(
  promptText: string,
  intent: IntentSignal,
): ComplexityScore {
  const lengthScore = Math.min(6, Math.floor(promptText.length / 300))

  let score = lengthScore
  if (intent.category === 'code' || intent.category === 'unreal') score += 3
  if (intent.category === 'analysis') score += 2
  if (/(multi-step|step by step|architecture|benchmark|optimi[sz]e)/i.test(promptText)) {
    score += 2
  }

  if (score >= 7) return { level: 'high', score }
  if (score >= 4) return { level: 'medium', score }
  return { level: 'low', score }
}
