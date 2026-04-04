import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import { createModuleScaffoldPlan, writeModuleScaffold } from './moduleScaffold.js'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('module scaffold generator', () => {
  test('creates a module file plan', () => {
    const files = createModuleScaffoldPlan({
      projectRoot: 'C:/Game',
      moduleName: 'TrafficSystem',
    })

    expect(files.length).toBe(3)
    expect(files[0]?.relativePath).toContain('TrafficSystem.Build.cs')
  })

  test('writes scaffold files to disk', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-module-'))
    tempDirs.push(root)

    await writeModuleScaffold({
      projectRoot: root,
      moduleName: 'TrafficSystem',
    })

    const buildFile = await readFile(
      path.join(root, 'Source', 'TrafficSystem', 'TrafficSystem.Build.cs'),
      'utf8',
    )

    expect(buildFile).toContain('public class TrafficSystem : ModuleRules')
  })
})
