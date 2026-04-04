import { spawn } from 'child_process'
import path from 'path'

export type UnrealBuildRequest = {
  uprojectPath: string
  target: string
  configuration: string
  platform?: string
  engineRoot?: string
  additionalArgs?: string[]
}

export type UnrealBuildResult = {
  exitCode: number
  stdout: string
  stderr: string
  command: string
}

export type SpawnFn = typeof spawn

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value
}

export function getDefaultUbtPath(engineRoot?: string): string {
  if (engineRoot) {
    return path.join(
      engineRoot,
      'Engine',
      'Binaries',
      'DotNET',
      'UnrealBuildTool',
      'UnrealBuildTool.exe',
    )
  }

  return 'UnrealBuildTool.exe'
}

export function buildUbtArgs(req: UnrealBuildRequest): string[] {
  const platform = req.platform || 'Win64'
  const args = [
    req.target,
    platform,
    req.configuration,
    `-Project=${req.uprojectPath}`,
    '-NoHotReloadFromIDE',
    ...(req.additionalArgs ?? []),
  ]
  return args
}

export function formatUbtCommand(ubtPath: string, args: string[]): string {
  return [quoteIfNeeded(ubtPath), ...args.map(quoteIfNeeded)].join(' ')
}

export async function runUnrealBuild(
  req: UnrealBuildRequest,
  spawnImpl: SpawnFn = spawn,
): Promise<UnrealBuildResult> {
  const ubtPath = getDefaultUbtPath(req.engineRoot)
  const args = buildUbtArgs(req)
  const command = formatUbtCommand(ubtPath, args)

  return await new Promise((resolve, reject) => {
    const child = spawnImpl(ubtPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', chunk => {
      stdout += String(chunk)
    })

    child.stderr?.on('data', chunk => {
      stderr += String(chunk)
    })

    child.on('error', error => {
      reject(error)
    })

    child.on('close', code => {
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
        command,
      })
    })
  })
}
