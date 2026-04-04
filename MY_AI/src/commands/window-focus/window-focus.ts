import type { LocalCommandCall } from '../../types/command.js'
import { focusWindowWithSidecar } from '../../services/systemControl/sidecarControl.js'

export const call: LocalCommandCall = async args => {
  const windowTitle = args.trim()
  if (!windowTitle) {
    return {
      type: 'text',
      value: 'Usage: /window-focus <window title>',
    }
  }

  try {
    const focused = await focusWindowWithSidecar({ windowTitle })
    return {
      type: 'text',
      value: focused
        ? `Focused window: ${windowTitle}`
        : `No matching window found: ${windowTitle}`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      type: 'text',
      value: `Window focus failed: ${message}`,
    }
  }
}
