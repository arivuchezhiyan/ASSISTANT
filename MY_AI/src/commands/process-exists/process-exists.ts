import type { LocalCommandCall } from '../../types/command.js'
import { processExistsWithSidecar } from '../../services/systemControl/sidecarControl.js'

export const call: LocalCommandCall = async args => {
  const processName = args.trim()
  if (!processName) {
    return {
      type: 'text',
      value: 'Usage: /process-exists <process name>',
    }
  }

  try {
    const exists = await processExistsWithSidecar({ processName })
    return {
      type: 'text',
      value: exists
        ? `Process is running: ${processName}`
        : `Process not found: ${processName}`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      type: 'text',
      value: `Process check failed: ${message}`,
    }
  }
}
