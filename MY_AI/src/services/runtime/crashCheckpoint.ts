import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'

export type RuntimeCheckpoint = {
  sessionId: string
  timestampMs: number
  stage: string
  payload: Record<string, unknown>
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function getCheckpointDir(baseDir?: string): string {
  return baseDir || path.resolve(process.cwd(), './data/runtime-checkpoints')
}

function getCheckpointPath(sessionId: string, baseDir?: string): string {
  return path.join(getCheckpointDir(baseDir), `${sanitizeSessionId(sessionId)}.json`)
}

export async function saveRuntimeCheckpoint(
  checkpoint: RuntimeCheckpoint,
  baseDir?: string,
): Promise<string> {
  const dir = getCheckpointDir(baseDir)
  await mkdir(dir, { recursive: true })

  const outputPath = getCheckpointPath(checkpoint.sessionId, baseDir)
  await writeFile(outputPath, JSON.stringify(checkpoint, null, 2), 'utf8')
  return outputPath
}

export async function loadRuntimeCheckpoint(
  sessionId: string,
  baseDir?: string,
): Promise<RuntimeCheckpoint | null> {
  const inputPath = getCheckpointPath(sessionId, baseDir)
  try {
    const raw = await readFile(inputPath, 'utf8')
    return JSON.parse(raw) as RuntimeCheckpoint
  } catch {
    return null
  }
}

export async function loadLatestRuntimeCheckpoint(
  baseDir?: string,
): Promise<RuntimeCheckpoint | null> {
  const dir = getCheckpointDir(baseDir)
  let files: string[]
  try {
    files = (await readdir(dir)).filter(file => file.endsWith('.json'))
  } catch {
    return null
  }

  let latest: RuntimeCheckpoint | null = null
  for (const file of files) {
    try {
      const raw = await readFile(path.join(dir, file), 'utf8')
      const parsed = JSON.parse(raw) as RuntimeCheckpoint
      if (!latest || parsed.timestampMs > latest.timestampMs) {
        latest = parsed
      }
    } catch {
      // Skip malformed checkpoint files to keep resume flow robust.
    }
  }

  return latest
}

export async function clearRuntimeCheckpoint(
  sessionId: string,
  baseDir?: string,
): Promise<void> {
  const inputPath = getCheckpointPath(sessionId, baseDir)
  await rm(inputPath, { force: true })
}
