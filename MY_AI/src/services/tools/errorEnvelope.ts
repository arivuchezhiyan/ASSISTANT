const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

function escapeXml(input: string): string {
  return input.replace(/[&<>"']/g, ch => XML_ESCAPES[ch] ?? ch)
}

export function getRollbackHint(toolName: string): string {
  const lower = toolName.toLowerCase()
  if (lower.includes('fileedit') || lower.includes('notebook')) {
    return 'Rollback hint: revert the changed file/chunk from git diff or local history before retrying.'
  }
  if (lower.includes('filewrite')) {
    return 'Rollback hint: restore previous file content from git or backup before retrying write.'
  }
  if (lower.includes('bash') || lower.includes('powershell')) {
    return 'Rollback hint: run a safe inverse command only after reviewing side effects and current system state.'
  }
  return 'Rollback hint: review last side effects, then retry with narrower scope and explicit constraints.'
}

export function buildToolErrorEnvelope(params: {
  toolName: string
  code: string
  message: string
  includeRollbackHint?: boolean
}): { xml: string; text: string } {
  const hint = params.includeRollbackHint === false ? '' : getRollbackHint(params.toolName)
  const body = `${params.code}: ${params.message}`
  const text = hint ? `${body}\n${hint}` : body

  return {
    xml: `<tool_use_error>${escapeXml(text)}</tool_use_error>`,
    text,
  }
}
