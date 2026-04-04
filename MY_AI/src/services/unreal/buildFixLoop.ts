import {
  runUnrealBuild,
  type SpawnFn,
  type UnrealBuildRequest,
} from './buildRunner.js'
import { detectUnrealProject } from './projectDetector.js'
import { analyzeUnrealBuildLog, type UnrealLogAnalysis } from './logParser.js'
import {
  suggestFixesFromAnalysis,
  type UnrealFixSuggestion,
} from './fixSuggester.js'

export type UnrealBuildFixLoopInput = {
  startDir: string
  target: string
  configuration: string
  platform?: string
  engineRoot?: string
  additionalArgs?: string[]
  maxIterations?: number
}

export type UnrealBuildFixLoopAttempt = {
  attempt: number
  command: string
  exitCode: number
  errorCount: number
  warningCount: number
}

export type UnrealBuildFixLoopResult = {
  status: 'project_not_found' | 'build_succeeded' | 'build_failed'
  projectRoot: string | null
  uprojectPath: string | null
  attempts: UnrealBuildFixLoopAttempt[]
  analysis: UnrealLogAnalysis | null
  suggestions: UnrealFixSuggestion[]
}

function toBuildRequest(
  input: UnrealBuildFixLoopInput,
  uprojectPath: string,
): UnrealBuildRequest {
  return {
    uprojectPath,
    target: input.target,
    configuration: input.configuration,
    platform: input.platform,
    engineRoot: input.engineRoot,
    additionalArgs: input.additionalArgs,
  }
}

export async function runUnrealBuildFixLoop(
  input: UnrealBuildFixLoopInput,
  spawnImpl?: SpawnFn,
): Promise<UnrealBuildFixLoopResult> {
  const detection = await detectUnrealProject(input.startDir)
  if (!detection.isUnrealProject || !detection.uprojectPath) {
    return {
      status: 'project_not_found',
      projectRoot: null,
      uprojectPath: null,
      attempts: [],
      analysis: null,
      suggestions: [],
    }
  }

  const maxIterations = Math.max(1, input.maxIterations ?? 2)
  const attempts: UnrealBuildFixLoopAttempt[] = []
  let latestAnalysis: UnrealLogAnalysis | null = null
  let latestSuggestions: UnrealFixSuggestion[] = []

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const request = toBuildRequest(input, detection.uprojectPath)
    const buildResult = await runUnrealBuild(request, spawnImpl)
    const combinedLog = `${buildResult.stdout}\n${buildResult.stderr}`

    latestAnalysis = analyzeUnrealBuildLog(combinedLog)
    latestSuggestions = suggestFixesFromAnalysis(latestAnalysis)

    attempts.push({
      attempt: iteration,
      command: buildResult.command,
      exitCode: buildResult.exitCode,
      errorCount: latestAnalysis.summary.errorCount,
      warningCount: latestAnalysis.summary.warningCount,
    })

    if (buildResult.exitCode === 0 && latestAnalysis.summary.errorCount === 0) {
      return {
        status: 'build_succeeded',
        projectRoot: detection.projectRoot,
        uprojectPath: detection.uprojectPath,
        attempts,
        analysis: latestAnalysis,
        suggestions: latestSuggestions,
      }
    }
  }

  return {
    status: 'build_failed',
    projectRoot: detection.projectRoot,
    uprojectPath: detection.uprojectPath,
    attempts,
    analysis: latestAnalysis,
    suggestions: latestSuggestions,
  }
}