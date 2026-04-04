import type { Message } from 'src/types/message.js'

import { DiskVectorStoreAdapter } from './vectorStore.js'
import { inferMemoryScope } from './rankingScorer.js'

function hashEmbed(text: string): number[] {
  const vector = new Array<number>(32).fill(0)
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    const slot = i % vector.length
    vector[slot] += (code % 97) / 97
  }
  return vector
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map(block => {
        if (typeof block === 'string') return block
        if (
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          (block as { type?: string }).type === 'text' &&
          'text' in block &&
          typeof (block as { text?: unknown }).text === 'string'
        ) {
          return (block as { text: string }).text
        }
        return ''
      })
      .join('\n')
  }
  return ''
}

function trimText(input: string, maxLen = 1200): string {
  const normalized = input.trim()
  if (normalized.length <= maxLen) return normalized
  return normalized.slice(0, maxLen)
}

function getLastUserText(messages: readonly Message[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg.type !== 'user') continue
    const text = trimText(toText(msg.message.content))
    if (text.length > 0) return text
  }
  return ''
}

function getLastAssistantText(messages: readonly Message[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg.type !== 'assistant') continue
    const text = trimText(toText(msg.message.content))
    if (text.length > 0) return text
  }
  return ''
}

export async function extractAndStoreTurnMemory(
  messages: readonly Message[],
  sessionId: string,
  store = new DiskVectorStoreAdapter(),
): Promise<number> {
  const userText = getLastUserText(messages)
  const assistantText = getLastAssistantText(messages)

  const entries: Array<{
    id: string
    vector: number[]
    text: string
    metadata: Record<string, string>
  }> = []

  const now = Date.now()

  if (userText.length > 0) {
    entries.push({
      id: `${sessionId}:u:${now}`,
      vector: hashEmbed(userText),
      text: userText,
      metadata: {
        role: 'user',
        sessionId,
        scope: inferMemoryScope(userText),
      },
    })
  }

  if (assistantText.length > 0) {
    entries.push({
      id: `${sessionId}:a:${now}`,
      vector: hashEmbed(assistantText),
      text: assistantText,
      metadata: {
        role: 'assistant',
        sessionId,
        scope: inferMemoryScope(assistantText),
      },
    })
  }

  if (entries.length === 0) return 0

  await store.upsert('session_memory', entries)
  return entries.length
}
