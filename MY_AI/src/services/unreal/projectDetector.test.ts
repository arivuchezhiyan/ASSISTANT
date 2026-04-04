import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { detectUnrealProject } from './projectDetector.js'

const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('detectUnrealProject', () => {
  test('detects project in current directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-ue-'))
    tempDirs.push(root)
    const projectPath = path.join(root, 'MyGame.uproject')
    await writeFile(
      projectPath,
      JSON.stringify({ EngineAssociation: '5.4' }, null, 2),
      'utf8',
    )

    const found = await detectUnrealProject(root)
    expect(found.isUnrealProject).toBe(true)
    expect(found.projectName).toBe('MyGame')
    expect(found.engineAssociation).toBe('5.4')
  })

  test('walks parent directories to find project root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-ue-'))
    tempDirs.push(root)
    await writeFile(path.join(root, 'City.uproject'), '{}', 'utf8')
    const child = path.join(root, 'Source', 'City')
    await mkdir(child, { recursive: true })

    const found = await detectUnrealProject(child)
    expect(found.isUnrealProject).toBe(true)
    expect(found.projectRoot).toBe(root)
    expect(found.projectName).toBe('City')
  })

  test('returns empty detection when no project is found', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-no-ue-'))
    tempDirs.push(root)

    const found = await detectUnrealProject(root, 2)
    expect(found.isUnrealProject).toBe(false)
    expect(found.uprojectPath).toBeNull()
  })
})
