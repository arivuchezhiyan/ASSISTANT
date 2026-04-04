import type { LocalCommandCall } from '../../types/command.js'
import { openAppWithSidecar } from '../../services/systemControl/sidecarControl.js'

type LaunchTarget = {
  appPath: string
  args: string[]
  label: string
}

export function resolveLaunchTarget(rawArgs: string): LaunchTarget | null {
  const input = rawArgs.trim()
  if (!input) return null

  const [firstToken, ...rest] = input.split(/\s+/)
  const key = firstToken.toLowerCase()

  if (key === 'vscode' || key === 'code') {
    return { appPath: 'code', args: rest, label: 'VS Code' }
  }

  if (key === 'unreal' || key === 'unreal-engine') {
    return { appPath: 'UnrealEditor.exe', args: rest, label: 'Unreal Engine' }
  }

  if (key === 'browser') {
    const url = rest[0] || 'https://www.google.com'
    return {
      appPath: 'cmd.exe',
      args: ['/c', 'start', '', url],
      label: 'Default browser',
    }
  }

  if (key === 'files' || key === 'explorer' || key === 'file-manager') {
    return { appPath: 'explorer.exe', args: rest, label: 'File Explorer' }
  }

  return { appPath: firstToken, args: rest, label: firstToken }
}

export const call: LocalCommandCall = async args => {
  const target = resolveLaunchTarget(args)
  if (!target) {
    return {
      type: 'text',
      value:
        'Usage: /open-app <vscode|unreal|browser|files|path> [args...]',
    }
  }

  try {
    await openAppWithSidecar({
      appPath: target.appPath,
      args: target.args,
    })
    return {
      type: 'text',
      value: `Launched ${target.label}.`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      type: 'text',
      value: `Failed to launch ${target.label}: ${message}`,
    }
  }
}
