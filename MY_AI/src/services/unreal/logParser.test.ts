import { describe, expect, test } from 'bun:test'

import { analyzeUnrealBuildLog, parseUnrealBuildLog } from './logParser.js'

describe('unreal log parser', () => {
  test('parses errors and warnings with file locations', () => {
    const log = [
      'C:/Game/Source/City/CityActor.cpp(42): error C2143: syntax error: missing ; before }',
      'C:/Game/Source/City/CityActor.cpp(55): warning C4101: variable x is unreferenced',
      'Build completed',
    ].join('\n')

    const issues = parseUnrealBuildLog(log)
    expect(issues.length).toBe(2)
    expect(issues[0]?.severity).toBe('error')
    expect(issues[0]?.file).toContain('CityActor.cpp')
    expect(issues[0]?.line).toBe(42)
  })

  test('extracts top error kinds from log analysis', () => {
    const log = [
      'City.cpp(10): error C1083: cannot open include file: Missing.h: No such file or directory',
      'City.cpp(20): error C2065: identifier Foo is undefined',
      'City.cpp(30): error C2065: identifier Bar is undefined',
      'City.cpp(40): warning C4996: deprecated api',
    ].join('\n')

    const analysis = analyzeUnrealBuildLog(log)
    expect(analysis.summary.errorCount).toBe(3)
    expect(analysis.summary.warningCount).toBe(1)
    expect(analysis.summary.topErrorKinds[0]).toBe('undefined symbol')
  })
})
