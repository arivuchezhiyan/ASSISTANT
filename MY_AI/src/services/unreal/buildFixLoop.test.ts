import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'events'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import { runUnrealBuild } from './buildRunner.js'
import { detectUnrealProject } from './projectDetector.js'
import { analyzeUnrealBuildLog } from './logParser.js'
import { suggestFixesFromAnalysis } from './fixSuggester.js'

async function withTempDir<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), 'my-ai-loop-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('unreal build error fix loop', () => {
  test('detects project, parses build failure, and generates fixes', async () => {
    await withTempDir(async root => {
      const uprojectPath = path.join(root, 'City.uproject')
      await writeFile(
        uprojectPath,
        JSON.stringify({ EngineAssociation: '5.4' }, null, 2),
        'utf8',
      )

      const detected = await detectUnrealProject(root)
      expect(detected.isUnrealProject).toBe(true)
      expect(detected.uprojectPath).toBe(uprojectPath)

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

      const buildResult = await runUnrealBuild(
        {
          uprojectPath,
          target: 'CityEditor',
          configuration: 'Development',
        },
        fakeSpawn as never,
      )

      expect(buildResult.exitCode).toBe(1)

      const analysis = analyzeUnrealBuildLog(buildResult.stdout + '\n' + buildResult.stderr)
      expect(analysis.summary.errorCount).toBe(2)

      const suggestions = suggestFixesFromAnalysis(analysis)
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.map(s => s.title)).toContain(
        'Resolve missing include paths and headers',
      )
    })
  })
})
