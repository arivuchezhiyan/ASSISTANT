export type UnrealLogSeverity = 'error' | 'warning' | 'info'

export type UnrealLogIssue = {
  severity: UnrealLogSeverity
  file: string | null
  line: number | null
  message: string
  raw: string
}

export type UnrealLogAnalysis = {
  errors: UnrealLogIssue[]
  warnings: UnrealLogIssue[]
  summary: {
    errorCount: number
    warningCount: number
    topErrorKinds: string[]
  }
}

const ERROR_PATTERNS: Array<{ kind: string; regex: RegExp }> = [
  { kind: 'missing include', regex: /cannot open include file|file not found/i },
  { kind: 'undefined symbol', regex: /unresolved external symbol|identifier .* is undefined/i },
  { kind: 'syntax error', regex: /syntax error|expected ';'|unexpected token/i },
  { kind: 'type mismatch', regex: /cannot convert|no suitable conversion/i },
]

function parseLocation(raw: string): { file: string | null; line: number | null } {
  const msBuildLike = raw.match(/([^\s:]+\.(?:cpp|h|cs|hpp))\((\d+)\)/i)
  if (msBuildLike) {
    return {
      file: msBuildLike[1] ?? null,
      line: msBuildLike[2] ? Number(msBuildLike[2]) : null,
    }
  }

  const clangLike = raw.match(/([^\s:]+\.(?:cpp|h|cs|hpp)):(\d+):\d+/i)
  if (clangLike) {
    return {
      file: clangLike[1] ?? null,
      line: clangLike[2] ? Number(clangLike[2]) : null,
    }
  }

  return { file: null, line: null }
}

function detectSeverity(raw: string): UnrealLogSeverity {
  if (/\berror\b/i.test(raw)) return 'error'
  if (/\bwarning\b/i.test(raw)) return 'warning'
  return 'info'
}

function normalizeMessage(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

export function parseUnrealBuildLog(logText: string): UnrealLogIssue[] {
  const lines = logText.split(/\r?\n/)
  const issues: UnrealLogIssue[] = []

  for (const line of lines) {
    const severity = detectSeverity(line)
    if (severity === 'info') continue

    const { file, line: lineNumber } = parseLocation(line)
    issues.push({
      severity,
      file,
      line: lineNumber,
      message: normalizeMessage(line),
      raw: line,
    })
  }

  return issues
}

export function analyzeUnrealBuildLog(logText: string): UnrealLogAnalysis {
  const issues = parseUnrealBuildLog(logText)
  const errors = issues.filter(issue => issue.severity === 'error')
  const warnings = issues.filter(issue => issue.severity === 'warning')

  const errorKindCounts = new Map<string, number>()
  for (const error of errors) {
    const kind = ERROR_PATTERNS.find(pattern => pattern.regex.test(error.message))?.kind ||
      'other compile error'
    errorKindCounts.set(kind, (errorKindCounts.get(kind) || 0) + 1)
  }

  const topErrorKinds = [...errorKindCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([kind]) => kind)

  return {
    errors,
    warnings,
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length,
      topErrorKinds,
    },
  }
}
