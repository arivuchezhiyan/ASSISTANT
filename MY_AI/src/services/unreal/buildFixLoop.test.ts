import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import { runUnrealBuildFixLoop } from './buildFixLoop.js'
import { writeActorScaffold } from './moduleScaffold.js'

async function withTempDir<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), 'my-ai-loop-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('unreal build error fix loop', () => {
  test('detects project, runs compile, and returns structured fix suggestions', async () => {
    await withTempDir(async root => {
      const uprojectPath = path.join(root, 'City.uproject')
      await writeFile(
        uprojectPath,
        JSON.stringify({ EngineAssociation: '5.4' }, null, 2),
        'utf8',
      )

      const fakeSpawn = () => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter
          stderr: EventEmitter
        }
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()

        queueMicrotask(() => {
          child.stdout.emit(
            'data',
            'Source/City/CityActor.cpp(12): error C1083: cannot open include file: Missing.h: No such file or directory\n',
          )
          child.stdout.emit(
            'data',
            'Source/City/CityActor.cpp(28): error C2065: identifier Foo is undefined\n',
          )
          child.emit('close', 1)
        })

        return child
      }

      const result = await runUnrealBuildFixLoop(
        {
          startDir: root,
          target: 'CityEditor',
          configuration: 'Development',
          maxIterations: 1,
        },
        fakeSpawn as never,
      )

      expect(result.status).toBe('build_failed')
      expect(result.uprojectPath).toBe(uprojectPath)
      expect(result.analysis?.summary.errorCount).toBe(2)
      expect(result.suggestions.length).toBeGreaterThan(0)
      expect(result.suggestions.map(s => s.title)).toContain(
        'Resolve missing include paths and headers',
      )
    })
  })

  test('writes actor scaffold files for Unreal module generation', async () => {
    await withTempDir(async root => {
      const sourceDir = path.join(root, 'Source', 'City')
      await mkdir(sourceDir, { recursive: true })
      await writeFile(path.join(root, 'City.uproject'), '{"EngineAssociation":"5.4"}', 'utf8')

      const files = await writeActorScaffold({
        projectRoot: root,
        moduleName: 'City',
        actorName: 'ACityActor',
      })

      expect(files.length).toBe(2)
      expect(files[0]?.relativePath).toContain('ACityActor.h')
      expect(files[1]?.relativePath).toContain('ACityActor.cpp')

      const header = await readFile(
        path.join(root, 'Source', 'City', 'Public', 'ACityActor.h'),
        'utf8',
      )
      expect(header).toContain('class CITY_API ACityActor : public AActor')
    })
  })
})
