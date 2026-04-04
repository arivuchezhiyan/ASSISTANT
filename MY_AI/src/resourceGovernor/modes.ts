import type {
  GovernorMode,
  GovernorModeConfig,
  GovernorThresholds,
  ResourceSnapshot,
} from './types.js'

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

export function getGovernorThresholds(): GovernorThresholds {
  return {
    reducedRamGb:
      parsePositiveNumber(process.env.RAM_REDUCED_THRESHOLD_GB) ?? 11,
    minimalRamGb:
      parsePositiveNumber(process.env.RAM_MINIMAL_THRESHOLD_GB) ?? 13,
    emergencyRamGb:
      parsePositiveNumber(process.env.RAM_EMERGENCY_THRESHOLD_GB) ?? 14.5,
  }
}

export function decideGovernorMode(
  snapshot: ResourceSnapshot,
  thresholds: GovernorThresholds,
): GovernorMode {
  if (snapshot.usedRamGb >= thresholds.emergencyRamGb) return 'emergency'
  if (snapshot.unrealDetected) return 'minimal'
  if (snapshot.usedRamGb >= thresholds.minimalRamGb) return 'minimal'
  if (snapshot.usedRamGb >= thresholds.reducedRamGb) return 'reduced'
  return 'full'
}

export function getModeConfig(mode: GovernorMode): GovernorModeConfig {
  switch (mode) {
    case 'full':
      return {
        maxParallelTools: 2,
        allowSelfReflection: true,
        vectorStoreMode: 'memory',
        preferredModelHint: 'default',
      }
    case 'reduced':
      return {
        maxParallelTools: 1,
        allowSelfReflection: false,
        vectorStoreMode: 'disk',
        preferredModelHint: 'default',
      }
    case 'minimal':
      return {
        maxParallelTools: 1,
        allowSelfReflection: false,
        vectorStoreMode: 'off',
        preferredModelHint: 'tiny',
      }
    case 'emergency':
      return {
        maxParallelTools: 0,
        allowSelfReflection: false,
        vectorStoreMode: 'off',
        preferredModelHint: 'tiny',
      }
  }
}

export function getModeReason(
  mode: GovernorMode,
  snapshot: ResourceSnapshot,
  thresholds: GovernorThresholds,
): string {
  if (mode === 'emergency') {
    return `RAM ${snapshot.usedRamGb.toFixed(1)}GB exceeded emergency threshold ${thresholds.emergencyRamGb}GB`
  }
  if (snapshot.unrealDetected) {
    return 'Unreal process detected'
  }
  if (mode === 'minimal') {
    return `RAM ${snapshot.usedRamGb.toFixed(1)}GB exceeded minimal threshold ${thresholds.minimalRamGb}GB`
  }
  if (mode === 'reduced') {
    return `RAM ${snapshot.usedRamGb.toFixed(1)}GB exceeded reduced threshold ${thresholds.reducedRamGb}GB`
  }
  return `RAM ${snapshot.usedRamGb.toFixed(1)}GB within full-mode budget`
}
