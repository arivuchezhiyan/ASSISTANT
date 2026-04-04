import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import {
  clearRuntimeCheckpoint,
  loadLatestRuntimeCheckpoint,
  loadRuntimeCheckpoint,
  saveRuntimeCheckpoint,
} from './crashCheckpoint.js'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('runtime crash checkpoint flow', () => {
  test('saves and loads checkpoint by session id', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-checkpoint-'))
    tempDirs.push(root)

    await saveRuntimeCheckpoint(
      {
        sessionId: 'session-1',
        timestampMs: 1000,
        stage: 'before_build',
        payload: { target: 'CityEditor' },
      },
      root,
    )

    const loaded = await loadRuntimeCheckpoint('session-1', root)
    expect(loaded?.stage).toBe('before_build')
    expect(loaded?.payload.target).toBe('CityEditor')
  })

  test('returns latest checkpoint for resume flow', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-checkpoint-'))
    tempDirs.push(root)

    await saveRuntimeCheckpoint(
      {
        sessionId: 'session-1',
        timestampMs: 1000,
        stage: 'stage-1',
        payload: {},
      },
      root,
    )
    await saveRuntimeCheckpoint(
      {
        sessionId: 'session-2',
        timestampMs: 2000,
        stage: 'stage-2',
        payload: {},
      },
      root,
    )

    const latest = await loadLatestRuntimeCheckpoint(root)
    expect(latest?.sessionId).toBe('session-2')
    expect(latest?.stage).toBe('stage-2')
  })

  test('clear removes checkpoint', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-checkpoint-'))
    tempDirs.push(root)

    await saveRuntimeCheckpoint(
      {
        sessionId: 'session-clear',
        timestampMs: 1,
        stage: 'testing',
        payload: {},
      },
      root,
    )

    await clearRuntimeCheckpoint('session-clear', root)
    const loaded = await loadRuntimeCheckpoint('session-clear', root)
    expect(loaded).toBeNull()
  })
})
