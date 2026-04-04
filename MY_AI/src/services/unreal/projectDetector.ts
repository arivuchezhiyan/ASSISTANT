import { readdir, readFile } from 'fs/promises'
import path from 'path'

export type UnrealProjectDetection = {
  isUnrealProject: boolean
  projectRoot: string | null
  uprojectPath: string | null
  projectName: string | null
  engineAssociation: string | null
}

const EMPTY_DETECTION: UnrealProjectDetection = {
  isUnrealProject: false,
  projectRoot: null,
  uprojectPath: null,
  projectName: null,
  engineAssociation: null,
}

async function findUprojectInDir(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().endsWith('.uproject')) continue
    return path.join(dir, entry.name)
  }
  return null
}

async function readEngineAssociation(
  uprojectPath: string,
): Promise<string | null> {
  try {
    const raw = await readFile(uprojectPath, 'utf8')
    const parsed = JSON.parse(raw) as { EngineAssociation?: unknown }
    return typeof parsed.EngineAssociation === 'string'
      ? parsed.EngineAssociation
      : null
  } catch {
    return null
  }
}

export async function detectUnrealProject(
  startDir: string,
  maxParentHops = 8,
): Promise<UnrealProjectDetection> {
  let currentDir = path.resolve(startDir)

  for (let hop = 0; hop <= maxParentHops; hop += 1) {
    const uprojectPath = await findUprojectInDir(currentDir)
    if (uprojectPath) {
      const projectName = path.basename(uprojectPath, '.uproject')
      const engineAssociation = await readEngineAssociation(uprojectPath)
      return {
        isUnrealProject: true,
        projectRoot: currentDir,
        uprojectPath,
        projectName,
        engineAssociation,
      }
    }

    const parent = path.dirname(currentDir)
    if (parent === currentDir) break
    currentDir = parent
  }

  return EMPTY_DETECTION
}
