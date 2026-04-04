import { describe, expect, test } from 'bun:test'

import { decideGovernorMode, getGovernorThresholds, getModeConfig } from './modes.js'
import type { ResourceSnapshot } from './types.js'

function snapshot(usedRamGb: number, unrealDetected = false): ResourceSnapshot {
  return {
    timestampMs: Date.now(),
    totalRamGb: 16,
    usedRamGb,
    ramUsageRatio: usedRamGb / 16,
    unrealDetected,
  }
}

describe('resource governor mode decisions', () => {
  test('uses full mode under reduced threshold', () => {
    const thresholds = getGovernorThresholds()
    const mode = decideGovernorMode(snapshot(thresholds.reducedRamGb - 0.5), thresholds)
    expect(mode).toBe('full')
  })

  test('uses reduced mode over reduced threshold', () => {
    const thresholds = getGovernorThresholds()
    const mode = decideGovernorMode(snapshot(thresholds.reducedRamGb + 0.1), thresholds)
    expect(mode).toBe('reduced')
  })

  test('uses minimal mode when unreal process is detected', () => {
    const thresholds = getGovernorThresholds()
    const mode = decideGovernorMode(snapshot(thresholds.reducedRamGb - 1, true), thresholds)
    expect(mode).toBe('minimal')
  })

  test('uses emergency mode over emergency threshold', () => {
    const thresholds = getGovernorThresholds()
    const mode = decideGovernorMode(snapshot(thresholds.emergencyRamGb + 0.1), thresholds)
    expect(mode).toBe('emergency')
  })
})

describe('resource governor mode config', () => {
  test('emergency mode disables parallel tools', () => {
    const cfg = getModeConfig('emergency')
    expect(cfg.maxParallelTools).toBe(0)
    expect(cfg.vectorStoreMode).toBe('off')
  })
})
