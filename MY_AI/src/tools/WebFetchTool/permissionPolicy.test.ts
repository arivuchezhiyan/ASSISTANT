import { describe, expect, test } from 'bun:test'

import { decideWebFetchPermissionBehavior } from './permissionPolicy.js'
import { isPreapprovedHost } from './preapproved.js'

describe('webfetch permission policy', () => {
  test('allows preapproved domains immediately', () => {
    const behavior = decideWebFetchPermissionBehavior({
      isPreapproved: true,
      hasAllowRule: false,
      hasAskRule: false,
      hasDenyRule: false,
    })

    expect(behavior).toBe('allow')
  })

  test('denies by default when no explicit allow rule exists', () => {
    const behavior = decideWebFetchPermissionBehavior({
      isPreapproved: false,
      hasAllowRule: false,
      hasAskRule: false,
      hasDenyRule: false,
    })

    expect(behavior).toBe('deny')
  })

  test('denies when explicit deny rule exists', () => {
    const behavior = decideWebFetchPermissionBehavior({
      isPreapproved: false,
      hasAllowRule: true,
      hasAskRule: true,
      hasDenyRule: true,
    })

    expect(behavior).toBe('deny')
  })

  test('supports path-scoped allowlist entries with segment boundary checks', () => {
    expect(isPreapprovedHost('github.com', '/anthropics/repo')).toBe(true)
    expect(isPreapprovedHost('github.com', '/anthropics-evil/repo')).toBe(false)
  })
})
