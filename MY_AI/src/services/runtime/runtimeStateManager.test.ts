import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import {
  loadRuntimeState,
  patchRuntimeState,
  saveRuntimeState,
} from './runtimeStateManager.js'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('runtime state manager', () => {
  test('returns default state when no state file exists', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-state-'))
    tempDirs.push(root)

    const state = await loadRuntimeState(root)
    expect(state.mode).toBe('FULL')
    expect(state.task.activeTaskId).toBeNull()
    expect(state.approvals.pendingCount).toBe(0)
  })

  test('saves and loads runtime state', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-state-'))
    tempDirs.push(root)

    await saveRuntimeState(
      {
        mode: 'MINIMAL',
        task: {
          activeTaskId: 'task-1',
          stage: 'planning',
          updatedAtMs: 100,
        },
        approvals: {
          pendingRiskLevel: 2,
          pendingCount: 1,
          updatedAtMs: 100,
        },
        updatedAtMs: 100,
      },
      root,
    )

    const loaded = await loadRuntimeState(root)
    expect(loaded.mode).toBe('MINIMAL')
    expect(loaded.task.activeTaskId).toBe('task-1')
    expect(loaded.approvals.pendingRiskLevel).toBe(2)
  })

  test('patch updates selected fields and keeps existing values', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-state-'))
    tempDirs.push(root)

    await saveRuntimeState(
      {
        mode: 'REDUCED',
        task: {
          activeTaskId: 'task-1',
          stage: 'routing',
          updatedAtMs: 100,
        },
        approvals: {
          pendingRiskLevel: null,
          pendingCount: 0,
          updatedAtMs: 100,
        },
        updatedAtMs: 100,
      },
      root,
    )

    const patched = await patchRuntimeState(
      {
        mode: 'EMERGENCY',
        approvals: {
          pendingRiskLevel: 3,
          pendingCount: 2,
          updatedAtMs: 0,
        },
      },
      root,
    )

    expect(patched.mode).toBe('EMERGENCY')
    expect(patched.task.activeTaskId).toBe('task-1')
    expect(patched.task.stage).toBe('routing')
    expect(patched.approvals.pendingRiskLevel).toBe(3)
    expect(patched.approvals.pendingCount).toBe(2)
  })
})
