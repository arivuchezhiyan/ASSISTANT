import { describe, expect, test } from 'bun:test'

import { executeToolTasks } from './parallelExecutor.js'
import { ToolResultCache } from './resultCache.js'

describe('parallel executor', () => {
  test('honors explicit maxParallel limit', async () => {
    let active = 0
    let maxSeen = 0

    const createTask = (id: string) => ({
      id,
      run: async () => {
        active += 1
        maxSeen = Math.max(maxSeen, active)
        await new Promise(resolve => setTimeout(resolve, 10))
        active -= 1
        return id
      },
    })

    const result = await executeToolTasks(
      [createTask('a'), createTask('b'), createTask('c')],
      { maxParallel: 2 },
    )

    expect(Object.keys(result.outputs).length).toBe(3)
    expect(result.maxParallelUsed).toBe(2)
    expect(maxSeen).toBe(2)
  })

  test('respects dependency ordering', async () => {
    const events: string[] = []

    const result = await executeToolTasks(
      [
        {
          id: 'prepare',
          run: async () => {
            events.push('prepare')
            return 'ok'
          },
        },
        {
          id: 'apply',
          deps: ['prepare'],
          run: async () => {
            events.push('apply')
            return 'ok'
          },
        },
      ],
      { maxParallel: 2 },
    )

    expect(events).toEqual(['prepare', 'apply'])
    expect(result.failed['apply']).toBeUndefined()
  })

  test('skips all tasks when governor disables parallel execution', async () => {
    const result = await executeToolTasks(
      [{ id: 'a', run: async () => 'ok' }],
      { governorMode: 'emergency' },
    )

    expect(Object.keys(result.outputs).length).toBe(0)
    expect(Object.keys(result.skipped).length).toBe(1)
  })

  test('marks dependent tasks as skipped when dependency fails', async () => {
    const result = await executeToolTasks(
      [
        {
          id: 'a',
          run: async () => {
            throw new Error('boom')
          },
        },
        {
          id: 'b',
          deps: ['a'],
          run: async () => 'never',
        },
      ],
      { maxParallel: 2 },
    )

    expect(result.failed['a']).toBe('boom')
    expect(result.envelopes['a']?.recoveryPath).toBe('escalate')
    expect(result.skipped['b']).toContain('unresolved dependencies')
  })

  test('uses cached result for repeated task key', async () => {
    const cache = new ToolResultCache<unknown>({ defaultTtlMs: 10_000 })
    let runs = 0

    const first = await executeToolTasks(
      [
        {
          id: 'a1',
          cacheKey: 'tool:read:foo',
          run: async () => {
            runs += 1
            return 'payload-1'
          },
        },
      ],
      { maxParallel: 1, cache },
    )

    const second = await executeToolTasks(
      [
        {
          id: 'a2',
          cacheKey: 'tool:read:foo',
          run: async () => {
            runs += 1
            return 'payload-2'
          },
        },
      ],
      { maxParallel: 1, cache },
    )

    expect(first.outputs['a1']).toBe('payload-1')
    expect(second.outputs['a2']).toBe('payload-1')
    expect(runs).toBe(1)
  })
})
