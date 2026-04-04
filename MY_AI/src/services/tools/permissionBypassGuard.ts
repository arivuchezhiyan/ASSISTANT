export type PermissionBehavior = 'allow' | 'deny' | 'ask'

export function canUseCachedResult(behavior: PermissionBehavior): boolean {
  return behavior === 'allow'
}

export function canUseDegradedFallback(behavior: PermissionBehavior): boolean {
  return behavior === 'allow'
}
