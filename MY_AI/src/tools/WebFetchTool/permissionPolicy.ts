export function decideWebFetchPermissionBehavior(options: {
  isPreapproved: boolean
  hasDenyRule: boolean
  hasAskRule: boolean
  hasAllowRule: boolean
}): 'allow' | 'ask' | 'deny' {
  if (options.isPreapproved) return 'allow'
  if (options.hasDenyRule) return 'deny'
  if (options.hasAllowRule) return 'allow'
  if (options.hasAskRule) return 'ask'
  return 'deny'
}