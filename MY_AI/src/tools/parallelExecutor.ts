import { getModeConfig } from 'src/resourceGovernor/modes.js'
import type { GovernorMode } from 'src/resourceGovernor/types.js'
import type { ToolErrorEnvelope } from './errorEnvelope.js'
import {
  executeWithRecovery,
  type ToolRecoveryPolicy,
} from './recoveryOrchestrator.js'
import type { ToolResultCache } from './resultCache.js'

export type ParallelTask<T> = {
  id: string
  deps?: string[]
  cacheKey?: string
  recovery?: ToolRecoveryPolicy<T>
  run: () => Promise<T>
}

export type ParallelExecutorOptions = {
  maxParallel?: number
  governorMode?: GovernorMode
  cache?: ToolResultCache<ToolExecutionCachedValue>
  cacheTtlMs?: number
}

type ToolExecutionCachedValue = unknown

export type ParallelExecutionResult<T> = {
  outputs: Record<string, T>
  failed: Record<string, string>
  envelopes: Record<string, ToolErrorEnvelope>
  skipped: Record<string, string>
  executedOrder: string[]
  maxParallelUsed: number
}

function getGovernorModeFromEnv(): GovernorMode {
  const mode = process.env.RESOURCE_GOVERNOR_MODE
  if (
    mode === 'full' ||
    mode === 'reduced' ||
    mode === 'minimal' ||
    mode === 'emergency'
  ) {
    return mode
  }
  return 'full'
}

function resolveParallelLimit(options?: ParallelExecutorOptions): number {
  if (typeof options?.maxParallel === 'number') {
    return Math.max(0, Math.floor(options.maxParallel))
  }

  const mode = options?.governorMode ?? getGovernorModeFromEnv()
  return Math.max(0, getModeConfig(mode).maxParallelTools)
}

function depsSatisfied(
  task: ParallelTask<unknown>,
  completed: Set<string>,
  failed: Set<string>,
): boolean {
  const deps = task.deps ?? []
  for (const dep of deps) {
    if (failed.has(dep)) return false
    if (!completed.has(dep)) return false
  }
  return true
}

export async function executeToolTasks<T>(
  tasks: ParallelTask<T>[],
  options?: ParallelExecutorOptions,
): Promise<ParallelExecutionResult<T>> {
  const outputs: Record<string, T> = {}
  const failed: Record<string, string> = {}
  const envelopes: Record<string, ToolErrorEnvelope> = {}
  const skipped: Record<string, string> = {}
  const completed = new Set<string>()
  const failedSet = new Set<string>()
  const pending = new Map(tasks.map(task => [task.id, task]))
  const executedOrder: string[] = []

  const parallelLimit = resolveParallelLimit(options)
  if (parallelLimit === 0) {
    for (const task of tasks) {
      skipped[task.id] = 'parallel execution disabled by governor mode'
    }
    return {
      outputs,
      failed,
      envelopes,
      skipped,
      executedOrder,
      maxParallelUsed: 0,
    }
  }

  let maxParallelUsed = 0

  while (pending.size > 0) {
    for (const [id, task] of pending.entries()) {
      if (!task.cacheKey || !options?.cache) continue
      if (!depsSatisfied(task, completed, failedSet)) continue

      const cached = options.cache.get(task.cacheKey) as T | undefined
      if (cached === undefined) continue

      outputs[id] = cached
      completed.add(id)
      executedOrder.push(id)
      pending.delete(id)
    }

    const runnable = Array.from(pending.values()).filter(task =>
      depsSatisfied(task, completed, failedSet),
    )

    if (runnable.length === 0) {
      for (const [id, task] of pending) {
        const deps = task.deps ?? []
        const unresolved = deps.filter(dep => !completed.has(dep))
        skipped[id] =
          unresolved.length > 0
            ? `unresolved dependencies: ${unresolved.join(', ')}`
            : 'dependency failure'
      }
      break
    }

    const batch = runnable.slice(0, parallelLimit)
    maxParallelUsed = Math.max(maxParallelUsed, batch.length)

    const batchResults = await Promise.all(
      batch.map(async task => {
        const recovered = await executeWithRecovery(task.run, task.recovery)
        if (recovered.ok) {
          return { id: task.id, ok: true as const, result: recovered.value }
        }
        return {
          id: task.id,
          ok: false as const,
          error: recovered.envelope.error,
          envelope: recovered.envelope,
        }
      }),
    )

    for (const batchResult of batchResults) {
      pending.delete(batchResult.id)
      executedOrder.push(batchResult.id)

      if (batchResult.ok) {
        outputs[batchResult.id] = batchResult.result
        const task = tasks.find(candidate => candidate.id === batchResult.id)
        if (task?.cacheKey && options?.cache) {
          options.cache.set(
            task.cacheKey,
            batchResult.result,
            options.cacheTtlMs,
          )
        }
        completed.add(batchResult.id)
      } else {
        failed[batchResult.id] = batchResult.error
        envelopes[batchResult.id] = batchResult.envelope
        failedSet.add(batchResult.id)
      }
    }
  }

  return {
    outputs,
    failed,
    envelopes,
    skipped,
    executedOrder,
    maxParallelUsed,
  }
}
