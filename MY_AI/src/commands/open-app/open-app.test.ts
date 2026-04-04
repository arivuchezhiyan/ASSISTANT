import { describe, expect, test } from 'bun:test'

import { resolveLaunchTarget } from './open-app.js'

describe('resolveLaunchTarget', () => {
  test('maps vscode alias', () => {
    const target = resolveLaunchTarget('vscode .')
    expect(target?.appPath).toBe('code')
    expect(target?.args).toEqual(['.'])
  })

  test('maps browser alias with default url', () => {
    const target = resolveLaunchTarget('browser')
    expect(target?.appPath).toBe('cmd.exe')
    expect(target?.args.slice(0, 3)).toEqual(['/c', 'start', ''])
  })

  test('maps files alias', () => {
    const target = resolveLaunchTarget('files')
    expect(target?.appPath).toBe('explorer.exe')
  })

  test('falls back to raw executable token', () => {
    const target = resolveLaunchTarget('notepad.exe notes.txt')
    expect(target?.appPath).toBe('notepad.exe')
    expect(target?.args).toEqual(['notes.txt'])
  })
})
