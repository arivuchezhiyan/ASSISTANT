export type GovernorMode = 'full' | 'reduced' | 'minimal' | 'emergency'

export type VectorStoreMode = 'memory' | 'disk' | 'off'

export type PreferredModelHint = 'default' | 'code' | 'tiny'

export type GovernorModeConfig = {
  maxParallelTools: number
  allowSelfReflection: boolean
  vectorStoreMode: VectorStoreMode
  preferredModelHint: PreferredModelHint
}

export type GovernorThresholds = {
  reducedRamGb: number
  minimalRamGb: number
  emergencyRamGb: number
}

export type ResourceSnapshot = {
  timestampMs: number
  totalRamGb: number
  usedRamGb: number
  ramUsageRatio: number
  unrealDetected: boolean
}

export type GovernorState = {
  mode: GovernorMode
  reason: string
  snapshot: ResourceSnapshot
  modeConfig: GovernorModeConfig
}

export type GovernorCallbacks = {
  onModeChange?: (next: GovernorState, prev: GovernorState | null) => void
  onSample?: (state: GovernorState) => void
}
