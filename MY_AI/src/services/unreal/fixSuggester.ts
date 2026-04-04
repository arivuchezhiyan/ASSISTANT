import type { UnrealLogAnalysis, UnrealLogIssue } from './logParser.js'

export type UnrealFixSuggestion = {
  title: string
  rationale: string
  actions: string[]
  relatedFiles: string[]
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function filesFromIssues(issues: UnrealLogIssue[]): string[] {
  return unique(issues.map(issue => issue.file || '').filter(Boolean))
}

function makeIncludeFix(issues: UnrealLogIssue[]): UnrealFixSuggestion {
  return {
    title: 'Resolve missing include paths and headers',
    rationale:
      'Build log indicates one or more headers could not be opened during compilation.',
    actions: [
      'Verify the missing header exists in Source or Plugins directories.',
      'Update Build.cs PublicIncludePaths/PrivateIncludePaths for the owning module.',
      'Regenerate project files and run a clean rebuild.',
    ],
    relatedFiles: filesFromIssues(issues),
  }
}

function makeUndefinedSymbolFix(issues: UnrealLogIssue[]): UnrealFixSuggestion {
  return {
    title: 'Fix undefined identifiers or unresolved symbols',
    rationale:
      'Compiler reported identifiers or symbols that are referenced but not defined.',
    actions: [
      'Check spelling and namespace/class scope for each symbol.',
      'Ensure module dependencies are declared in Build.cs (Public/PrivateDependencyModuleNames).',
      'Add missing includes or forward declarations where appropriate.',
    ],
    relatedFiles: filesFromIssues(issues),
  }
}

function makeSyntaxFix(issues: UnrealLogIssue[]): UnrealFixSuggestion {
  return {
    title: 'Correct syntax errors before downstream fixes',
    rationale:
      'Syntax errors can cascade into many secondary compile failures.',
    actions: [
      'Fix the first syntax error in file order.',
      'Rebuild after each correction to avoid chasing derived errors.',
      'Confirm braces, semicolons, and macro usages around reported lines.',
    ],
    relatedFiles: filesFromIssues(issues),
  }
}

export function suggestFixesFromAnalysis(
  analysis: UnrealLogAnalysis,
): UnrealFixSuggestion[] {
  if (analysis.summary.errorCount === 0) {
    return [
      {
        title: 'No compile errors detected',
        rationale: 'The log contains no error-level entries requiring a fix flow.',
        actions: ['Review warnings and run gameplay smoke tests.'],
        relatedFiles: [],
      },
    ]
  }

  const suggestions: UnrealFixSuggestion[] = []

  const missingIncludeIssues = analysis.errors.filter(error =>
    /cannot open include file|file not found/i.test(error.message),
  )
  if (missingIncludeIssues.length > 0) {
    suggestions.push(makeIncludeFix(missingIncludeIssues))
  }

  const undefinedSymbolIssues = analysis.errors.filter(error =>
    /unresolved external symbol|identifier .* is undefined/i.test(error.message),
  )
  if (undefinedSymbolIssues.length > 0) {
    suggestions.push(makeUndefinedSymbolFix(undefinedSymbolIssues))
  }

  const syntaxIssues = analysis.errors.filter(error =>
    /syntax error|expected ';'|unexpected token/i.test(error.message),
  )
  if (syntaxIssues.length > 0) {
    suggestions.push(makeSyntaxFix(syntaxIssues))
  }

  if (suggestions.length === 0) {
    suggestions.push({
      title: 'Apply first-error triage workflow',
      rationale:
        'Error types did not match known buckets; use generic first-error triage.',
      actions: [
        'Start with the first compile error in the log and resolve it completely.',
        'Re-run build and iterate until error count decreases.',
        'Capture unresolved errors for deeper model-assisted debugging.',
      ],
      relatedFiles: filesFromIssues(analysis.errors),
    })
  }

  return suggestions
}
