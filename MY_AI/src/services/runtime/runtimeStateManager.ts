import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

export type RuntimeMode = 'FULL' | 'REDUCED' | 'MINIMAL' | 'EMERGENCY'

export type RuntimeTaskState = {
  activeTaskId: string | null
  stage: string | null
  updatedAtMs: number
}

export type RuntimeApprovalState = {
  pendingRiskLevel: number | null
  pendingCount: number
  updatedAtMs: number
}

export type RuntimeState = {
  mode: RuntimeMode
  task: RuntimeTaskState
  approvals: RuntimeApprovalState
  updatedAtMs: number
}

const defaultState: RuntimeState = {
  mode: 'FULL',
  task: {
    activeTaskId: null,
    stage: null,
    updatedAtMs: 0,
  },
  approvals: {
    pendingRiskLevel: null,
    pendingCount: 0,
    updatedAtMs: 0,
  },
  updatedAtMs: 0,
}

function getStatePath(baseDir?: string): string {
  const root = baseDir || path.resolve(process.cwd(), './data/runtime-state')
  return path.join(root, 'state.json')
}

async function ensureStateDir(baseDir?: string): Promise<string> {
  const statePath = getStatePath(baseDir)
  await mkdir(path.dirname(statePath), { recursive: true })
  return statePath
}

function normalizeState(input: Partial<RuntimeState> | null | undefined): RuntimeState {
  const now = Date.now()
  return {
    mode: input?.mode || defaultState.mode,
    task: {
      activeTaskId: input?.task?.activeTaskId ?? defaultState.task.activeTaskId,
      stage: input?.task?.stage ?? defaultState.task.stage,
      updatedAtMs: input?.task?.updatedAtMs ?? now,
    },
    approvals: {
      pendingRiskLevel: input?.approvals?.pendingRiskLevel ?? defaultState.approvals.pendingRiskLevel,
      pendingCount: input?.approvals?.pendingCount ?? defaultState.approvals.pendingCount,
      updatedAtMs: input?.approvals?.updatedAtMs ?? now,
    },
    updatedAtMs: input?.updatedAtMs ?? now,
  }
}

export async function loadRuntimeState(baseDir?: string): Promise<RuntimeState> {
  const statePath = getStatePath(baseDir)
  try {
    const raw = await readFile(statePath, 'utf8')
    return normalizeState(JSON.parse(raw) as Partial<RuntimeState>)
  } catch {
    return normalizeState(defaultState)
  }
}

export async function saveRuntimeState(
  state: Partial<RuntimeState>,
  baseDir?: string,
): Promise<RuntimeState> {
  const statePath = await ensureStateDir(baseDir)
  const normalized = normalizeState(state)
  await writeFile(statePath, JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

export async function patchRuntimeState(
  patch: Partial<RuntimeState>,
  baseDir?: string,
): Promise<RuntimeState> {
  const current = await loadRuntimeState(baseDir)
  const merged: Partial<RuntimeState> = {
    mode: patch.mode ?? current.mode,
    task: {
      activeTaskId: patch.task?.activeTaskId ?? current.task.activeTaskId,
      stage: patch.task?.stage ?? current.task.stage,
      updatedAtMs: Date.now(),
    },
    approvals: {
      pendingRiskLevel: patch.approvals?.pendingRiskLevel ?? current.approvals.pendingRiskLevel,
      pendingCount: patch.approvals?.pendingCount ?? current.approvals.pendingCount,
      updatedAtMs: Date.now(),
    },
    updatedAtMs: Date.now(),
  }

  return saveRuntimeState(merged, baseDir)
}

export { getStatePath }
