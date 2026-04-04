const samples = [
  'Hey Jarvis open browser and search Unreal navmesh tutorial',
  'Hey Jarvis what time is it',
  'Hey Jarvis open vscode',
]

function analyzeCommand(text) {
  const normalized = text.toLowerCase()
  let intent = 'general'
  let confidence = 0.62
  const entities = []
  let actionPlan = 'Respond with assistant guidance.'

  if (normalized.includes('open ') || normalized.includes('launch ')) {
    intent = 'launch_app'
    confidence = 0.92
    if (normalized.includes('vscode') || normalized.includes('code')) entities.push('VS Code')
    if (normalized.includes('browser')) entities.push('Browser')
    if (normalized.includes('unreal')) entities.push('Unreal Engine')
    actionPlan = 'Call local launcher route and confirm completion.'
  } else if (normalized.includes('search') || normalized.includes('find')) {
    intent = 'search_web'
    confidence = 0.86
    actionPlan = 'Open browser with query intent.'
  } else if (normalized.includes('clipboard')) {
    intent = 'clipboard_control'
    confidence = 0.9
    actionPlan = 'Route to clipboard read or write command.'
  } else if (normalized.includes('time')) {
    intent = 'time_request'
    confidence = 0.9
    actionPlan = 'Return current local time.'
  }

  return {
    intent,
    confidence,
    entities,
    actionPlan,
  }
}

const rows = samples.map(input => ({
  input,
  ...analyzeCommand(input),
}))

const lines = []
lines.push('# Web UI Demo Analysis')
lines.push('')
for (const row of rows) {
  lines.push(`- Input: ${row.input}`)
  lines.push(`  - Intent: ${row.intent}`)
  lines.push(`  - Confidence: ${(row.confidence * 100).toFixed(1)}%`)
  lines.push(`  - Entities: ${row.entities.length ? row.entities.join(', ') : 'None'}`)
  lines.push(`  - Action Plan: ${row.actionPlan}`)
}

await Bun.write('./web-ui/DEMO_ANALYSIS_REPORT.md', lines.join('\n'))
console.log('Generated web-ui/DEMO_ANALYSIS_REPORT.md')
