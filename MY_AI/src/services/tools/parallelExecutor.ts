export function getGovernorAwareParallelLimit(baseLimit: number): number {
  const safeBase = Number.isFinite(baseLimit) && baseLimit > 0 ? Math.floor(baseLimit) : 1
  const mode = process.env.RESOURCE_GOVERNOR_MODE

  if (mode === 'emergency') return 1
  if (mode === 'minimal') return Math.min(1, safeBase)
  if (mode === 'reduced') return Math.min(2, safeBase)
  return safeBase
}
