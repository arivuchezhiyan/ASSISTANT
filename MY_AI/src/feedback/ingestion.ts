import { appendFile, mkdir } from 'fs/promises'
import path from 'path'

type TurnMessage = {
  type: string
  message?: {
    content?: unknown
  }
}

export type FeedbackOutcome = 'success' | 'error'

export type FeedbackIngestionRecord = {
  id: string
  sessionId: string
  timestamp: string
  outcome: FeedbackOutcome
  userText: string
  assistantText: string
  privacy: {
    redactionCount: number
  }
  source: 'query-engine'
}

type SanitizationResult = {
  text: string
  redactionCount: number
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

function trimText(input: string, maxLen = 1600): string {
  const normalized = input.trim()
  if (normalized.length <= maxLen) return normalized
  return normalized.slice(0, maxLen)
}

function getLastTextByRole(
  messages: readonly TurnMessage[],
  role: 'user' | 'assistant',
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg.type !== role) continue
    const text = trimText(toText(msg.message.content))
    if (text.length > 0) return text
  }
  return ''
}

function sanitizeText(input: string): SanitizationResult {
  let output = input
  let redactionCount = 0

  const redactions: Array<{ pattern: RegExp; replacement: string }> = [
    {
      pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      replacement: '[REDACTED_EMAIL]',
    },
    {
      pattern: /\bBearer\s+[A-Za-z0-9._-]+/gi,
      replacement: 'Bearer [REDACTED_TOKEN]',
    },
    {
      pattern: /(api[_-]?key\s*[:=]\s*)([^\s"']+)/gi,
      replacement: '$1[REDACTED_KEY]',
    },
    {
      pattern: /(password\s*[:=]\s*)([^\s"']+)/gi,
      replacement: '$1[REDACTED_PASSWORD]',
    },
  ]

  for (const redaction of redactions) {
    output = output.replace(redaction.pattern, () => {
      redactionCount += 1
      return redaction.replacement
    })
  }

  return { text: output, redactionCount }
}

function defaultVaultPath(): string {
  return path.join('data', 'training-vault', 'feedback-events.jsonl')
}

export async function ingestTurnFeedback(
  messages: readonly TurnMessage[],
  options: {
    sessionId: string
    outcome: FeedbackOutcome
    vaultPath?: string
  },
): Promise<FeedbackIngestionRecord | null> {
  const userTextRaw = getLastTextByRole(messages, 'user')
  const assistantTextRaw = getLastTextByRole(messages, 'assistant')

  if (userTextRaw.length === 0 && assistantTextRaw.length === 0) {
    return null
  }

  const userSanitized = sanitizeText(userTextRaw)
  const assistantSanitized = sanitizeText(assistantTextRaw)

  const record: FeedbackIngestionRecord = {
    id: `${options.sessionId}:${Date.now()}`,
    sessionId: options.sessionId,
    timestamp: new Date().toISOString(),
    outcome: options.outcome,
    userText: userSanitized.text,
    assistantText: assistantSanitized.text,
    privacy: {
      redactionCount: userSanitized.redactionCount + assistantSanitized.redactionCount,
    },
    source: 'query-engine',
  }

  const outputPath = options.vaultPath ?? defaultVaultPath()
  await mkdir(path.dirname(outputPath), { recursive: true })
  await appendFile(outputPath, JSON.stringify(record) + '\n', 'utf8')

  return record
}
