import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'events'

import {
  buildUbtArgs,
  formatUbtCommand,
  runUnrealBuild,
} from './buildRunner.js'

describe('buildRunner', () => {
  test('builds expected UnrealBuildTool args', () => {
    const args = buildUbtArgs({
      uprojectPath: 'C:/Game/City.uproject',
      target: 'CityEditor',
      configuration: 'Development',
      platform: 'Win64',
    })

    expect(args).toContain('CityEditor')
    expect(args).toContain('Win64')
    expect(args).toContain('Development')
    expect(args).toContain('-Project=C:/Game/City.uproject')
  })

  test('formats quoted command for paths with spaces', () => {
    const command = formatUbtCommand('C:/UE 5.4/Engine/Binaries/UnrealBuildTool.exe', [
      'CityEditor',
      'Win64',
      'Development',
    ])
    expect(command.startsWith('"C:/UE 5.4/Engine/Binaries/UnrealBuildTool.exe"')).toBe(true)
  })

  test('captures stdout/stderr and exit code from spawned process', async () => {
    const fakeSpawn = () => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
      }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()

      queueMicrotask(() => {
        child.stdout.emit('data', 'Compiling...')
        child.stderr.emit('data', 'warning: none')
        child.emit('close', 0)
      })

      return child
    }

    const result = await runUnrealBuild(
      {
        uprojectPath: 'C:/Game/City.uproject',
        target: 'CityEditor',
        configuration: 'Development',
      },
      fakeSpawn as never,
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Compiling...')
    expect(result.stderr).toContain('warning: none')
    expect(result.command).toContain('CityEditor')
  })
})
