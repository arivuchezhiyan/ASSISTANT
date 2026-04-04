import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function isWindowsProcessRunning(
  processName: string,
): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false
  }

  try {
    const { stdout } = await execFileAsync('tasklist', [
      '/FI',
      `IMAGENAME eq ${processName}`,
      '/NH',
    ])
    return stdout.toLowerCase().includes(processName.toLowerCase())
  } catch {
    return false
  }
}

export async function isAnyProcessRunning(
  processNames: string[],
): Promise<boolean> {
  if (processNames.length === 0) return false

  for (const processName of processNames) {
    if (await isWindowsProcessRunning(processName)) {
      return true
    }
  }

  return false
}
