import { describe, expect, test } from 'bun:test'

import { classifyIntent, promptToText } from './intentClassifier.js'

describe('intent classifier', () => {
  test('detects unreal intent with higher priority than code', () => {
    const intent = classifyIntent('Fix Unreal Actor compile error in uproject')
    expect(intent.category).toBe('unreal')
    expect(intent.complexity).toBe('high')
  })

  test('detects system command intent when no code signal is present', () => {
    const intent = classifyIntent('Open terminal and launch powershell')
    expect(intent.category).toBe('system')
  })

  test('defaults to chat for generic prompt', () => {
    const intent = classifyIntent('How are you today?')
    expect(intent.category).toBe('chat')
    expect(intent.complexity).toBe('low')
  })

  test('normalizes content block prompts', () => {
    const text = promptToText([
      { type: 'text', text: 'first line' },
      { type: 'text', text: 'second line' },
    ])
    expect(text).toBe('first line\nsecond line')
  })
})
