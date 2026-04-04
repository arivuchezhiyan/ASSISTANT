import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'

export type IntentComplexity = 'low' | 'medium' | 'high'

export type IntentCategory =
  | 'system'
  | 'code'
  | 'unreal'
  | 'analysis'
  | 'chat'

export type IntentSignal = {
  category: IntentCategory
  complexity: IntentComplexity
}

function normalizeText(input: string): string {
  return input.trim().toLowerCase()
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term))
}

export function promptToText(prompt: string | ContentBlockParam[]): string {
  if (typeof prompt === 'string') return prompt

  const parts: string[] = []
  for (const block of prompt) {
    if (block.type !== 'text') continue
    if (typeof block.text === 'string' && block.text.length > 0) {
      parts.push(block.text)
    }
  }

  return parts.join('\n')
}

export function classifyIntent(promptText: string): IntentSignal {
  const text = normalizeText(promptText)

  const isSystem = hasAny(text, [
    'open ',
    'launch ',
    'start ',
    'run ',
    'close ',
    'kill process',
    'terminal',
    'powershell',
  ])

  const isCode = hasAny(text, [
    'bug',
    'fix',
    'refactor',
    'typescript',
    'javascript',
    'python',
    'c++',
    'compile',
    'build',
    'test',
    'function',
    'class ',
    'code',
  ])

  const isUnreal = hasAny(text, [
    'unreal',
    'uproject',
    'blueprint',
    'unrealbuildtool',
    'uat',
    'actor',
    'component',
  ])

  const isAnalysis = hasAny(text, [
    'analyze',
    'architecture',
    'design',
    'compare',
    'tradeoff',
    'optimize',
    'plan',
  ])

  if (isUnreal) {
    return { category: 'unreal', complexity: 'high' }
  }
  if (isCode) {
    return { category: 'code', complexity: 'high' }
  }
  if (isAnalysis) {
    return { category: 'analysis', complexity: 'medium' }
  }
  if (isSystem) {
    return { category: 'system', complexity: 'low' }
  }
  return { category: 'chat', complexity: 'low' }
}
