/**
 * bun-bundle-shim.ts
 *
 * Replaces `import { feature } from 'bun:bundle'` for local development.
 *
 * In the real Claude Code, Bun uses this at compile time to eliminate dead code.
 * We provide a runtime version that enables only the core features needed
 * for a local AI coding assistant.
 */

// Features that we ENABLE for local mode
const ENABLED_FEATURES = new Set([
  // Core features needed for the coding assistant
  'HISTORY_SNIP',           // Context history management
  'CACHED_MICROCOMPACT',    // Efficient context compaction
  'TOKEN_BUDGET',           // Token budget tracking
  'REACTIVE_COMPACT',       // Reactive context compaction
  'CONTEXT_COLLAPSE',       // Context window management
  'CONNECTOR_TEXT',         // Text connector blocks
])

// Features we DISABLE (cloud/enterprise/unnecessary features)
// COORDINATOR_MODE, KAIROS, BRIDGE_MODE, DAEMON, VOICE_MODE,
// PROACTIVE, AGENT_TRIGGERS, MONITOR_TOOL, SSH_REMOTE,
// DIRECT_CONNECT, LODESTONE, OVERFLOW_TEST_TOOL, TERMINAL_PANEL,
// WEB_BROWSER_TOOL, WORKFLOW_SCRIPTS, UDS_INBOX, BG_SESSIONS,
// TEMPLATES, EXPERIMENTAL_SKILL_SEARCH, COMMIT_ATTRIBUTION,
// TEAMMEM, TRANSCRIPT_CLASSIFIER, BREAK_CACHE_COMMAND,
// ANTI_DISTILLATION_CC, KAIROS_GITHUB_WEBHOOKS, KAIROS_PUSH_NOTIFICATION

/**
 * Runtime feature flag check.
 * Returns true only for features needed in local mode.
 */
export function feature(name: string): boolean {
  return ENABLED_FEATURES.has(name)
}

export default { feature }
