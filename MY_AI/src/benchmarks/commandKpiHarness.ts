export type KpiSample = {
  operation: string
  durationMs: number
  ok: boolean
}

export type KpiSummary = {
  operation: string
  total: number
  successRate: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

function percentile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0
  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.floor(q * sortedValues.length) - 1),
  )
  return sortedValues[index] ?? 0
}

export function summarizeKpis(samples: KpiSample[]): KpiSummary[] {
  const grouped = new Map<string, KpiSample[]>()
  for (const sample of samples) {
    if (!grouped.has(sample.operation)) grouped.set(sample.operation, [])
    grouped.get(sample.operation)!.push(sample)
  }

  return [...grouped.entries()].map(([operation, items]) => {
    const durations = items.map(item => item.durationMs).sort((a, b) => a - b)
    const successCount = items.filter(item => item.ok).length
    return {
      operation,
      total: items.length,
      successRate: items.length === 0 ? 0 : successCount / items.length,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      maxMs: durations[durations.length - 1] ?? 0,
    }
  })
}

export async function runKpiHarness(
  runs: Array<{ operation: string; run: () => Promise<void> }>,
): Promise<KpiSummary[]> {
  const samples: KpiSample[] = []

  for (const item of runs) {
    const start = Date.now()
    try {
      await item.run()
      samples.push({
        operation: item.operation,
        durationMs: Date.now() - start,
        ok: true,
      })
    } catch {
      samples.push({
        operation: item.operation,
        durationMs: Date.now() - start,
        ok: false,
      })
    }
  }

  return summarizeKpis(samples)
}
