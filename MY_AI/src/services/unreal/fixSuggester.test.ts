import { describe, expect, test } from 'bun:test'

import { suggestFixesFromAnalysis } from './fixSuggester.js'
import { analyzeUnrealBuildLog } from './logParser.js'

describe('unreal fix suggester', () => {
  test('generates targeted suggestions for known error patterns', () => {
    const log = [
      'City.cpp(10): error C1083: cannot open include file: Missing.h: No such file or directory',
      'City.cpp(20): error C2065: identifier Foo is undefined',
      'City.cpp(30): error C2143: syntax error: missing ; before }',
    ].join('\n')

    const analysis = analyzeUnrealBuildLog(log)
    const suggestions = suggestFixesFromAnalysis(analysis)

    expect(suggestions.length).toBeGreaterThanOrEqual(3)
    expect(suggestions.map(s => s.title)).toContain(
      'Resolve missing include paths and headers',
    )
    expect(suggestions.map(s => s.title)).toContain(
      'Fix undefined identifiers or unresolved symbols',
    )
  })

  test('returns no-error guidance when analysis has no errors', () => {
    const analysis = analyzeUnrealBuildLog('Build completed successfully')
    const suggestions = suggestFixesFromAnalysis(analysis)

    expect(suggestions[0]?.title).toBe('No compile errors detected')
  })
})
