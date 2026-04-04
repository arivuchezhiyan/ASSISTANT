import { appendFile, mkdir } from 'fs/promises'
import path from 'path'

type TurnMessage = {
  type: string
  message?: {
    content?: unknown
  }
}

export type ProactiveSuggestion = {
  id: string
  sessionId: string
  timestamp: string
  confidence: number
  category: 'validation' | 'debug' | 'next_task' | 'stability'
  suggestion: string
  rationale: string
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

function getLastTextByRole(messages: readonly TurnMessage[], role: 'user' | 'assistant'): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg.type !== role) continue
    const text = toText(msg.message?.content).trim()
    if (text.length > 0) return text
  }
  return ''
}

function buildSuggestions(userText: string, assistantText: string): ProactiveSuggestion[] {
  const combined = `${userText}\n${assistantText}`.toLowerCase()
  const suggestions: ProactiveSuggestion[] = []

  if (/implement|added|create|feature|done|completed/.test(combined)) {
    suggestions.push({
      id: `sg-${Date.now()}-1`,
      sessionId: '',
      timestamp: new Date().toISOString(),
      confidence: 0.83,
      category: 'validation',
      suggestion: 'Run focused tests for the changed modules and record pass/fail evidence.',
      rationale: 'Recent changes indicate implementation work that should be validated immediately.',
    })
  }

  if (/error|fail|failed|exception|timeout/.test(combined)) {
    suggestions.push({
      id: `sg-${Date.now()}-2`,
      sessionId: '',
      timestamp: new Date().toISOString(),
      confidence: 0.87,
      category: 'debug',
      suggestion: 'Capture the first failing signal and run a minimal reproduction test before broad reruns.',
      rationale: 'Failure keywords indicate a likely debugging loop where focused reproduction is highest leverage.',
    })
  }

  if (/plan|backlog|next|todo|remaining|undone/.test(combined)) {
    suggestions.push({
      id: `sg-${Date.now()}-3`,
      sessionId: '',
      timestamp: new Date().toISOString(),
      confidence: 0.8,
      category: 'next_task',
      suggestion: 'Prioritize the next highest-impact open item and update execution log status after completion.',
      rationale: 'Planning language indicates task orchestration and sequencing is currently active.',
    })
  }

  if (/soak|stability|gate|readiness|hour/.test(combined)) {
    suggestions.push({
      id: `sg-${Date.now()}-4`,
      sessionId: '',
      timestamp: new Date().toISOString(),
      confidence: 0.78,
      category: 'stability',
      suggestion: 'Schedule a bounded stability run and append evidence to readiness reports.',
      rationale: 'Stability gate keywords suggest operational validation should be advanced.',
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: `sg-${Date.now()}-0`,
      sessionId: '',
      timestamp: new Date().toISOString(),
      confidence: 0.62,
      category: 'next_task',
      suggestion: 'Summarize current progress and pick one concrete next action with a clear validation step.',
      rationale: 'No strong domain signal detected; defaulting to a safe progress-driving suggestion.',
    })
  }

  return suggestions.slice(0, 3)
}

function defaultSuggestionsPath(): string {
  return path.join('data', 'proactive', 'suggestions.jsonl')
}

export async function generateAndStoreProactiveSuggestions(
  messages: readonly TurnMessage[],
  options: {
    sessionId: string
    outputPath?: string
  },
): Promise<ProactiveSuggestion[]> {
  const userText = getLastTextByRole(messages, 'user')
  const assistantText = getLastTextByRole(messages, 'assistant')

  if (!userText && !assistantText) return []

  const suggestions = buildSuggestions(userText, assistantText).map(item => ({
    ...item,
    sessionId: options.sessionId,
  }))

  const outputPath = options.outputPath ?? defaultSuggestionsPath()
  await mkdir(path.dirname(outputPath), { recursive: true })

  const lines = suggestions.map(item => JSON.stringify(item)).join('\n') + '\n'
  await appendFile(outputPath, lines, 'utf8')

  return suggestions
}
