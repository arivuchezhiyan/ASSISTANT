/**
 * local-start.ts — LocalClaude Launcher
 *
 * This is the entry point for running the modified Claude Code locally.
 * It sets up the environment variables needed to bypass all cloud features,
 * then imports and runs the original main.tsx.
 *
 * Usage: bun run src/local-start.ts
 */

// ═══════════════════════════════════════════════════════════════════════════
// Set environment variables BEFORE importing anything else
// These bypass auth, analytics, rate limits, and cloud features
// ═══════════════════════════════════════════════════════════════════════════

// Disable all cloud provider auth
process.env.ANTHROPIC_API_KEY = 'sk-local-ollama-no-key-needed'

// Ensure we don't try to use Bedrock/Vertex/Foundry
delete process.env.CLAUDE_CODE_USE_BEDROCK
delete process.env.CLAUDE_CODE_USE_VERTEX
delete process.env.CLAUDE_CODE_USE_FOUNDRY

// Disable OAuth
delete process.env.CLAUDE_CODE_OAUTH_TOKEN
process.env.CLAUDE_CODE_SKIP_OAUTH = '1'

// Disable analytics and telemetry
process.env.CLAUDE_CODE_DISABLE_ANALYTICS = '1'
process.env.DO_NOT_TRACK = '1'
process.env.ANTHROPIC_DISABLE_ANALYTICS = '1'

// Disable auto-updater (we're running local)
process.env.CLAUDE_CODE_DISABLE_AUTO_UPDATE = '1'

// Set to external mode (not internal Anthropic)
process.env.USER_TYPE = 'external'

// Ollama configuration
process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
process.env.OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'dolphin-mistral:7b'
process.env.OLLAMA_CONTEXT_LENGTH = process.env.OLLAMA_CONTEXT_LENGTH || '32768'

// Override all model defaults to use our Ollama model
const MODEL = process.env.OLLAMA_MODEL
process.env.ANTHROPIC_MODEL = MODEL
process.env.ANTHROPIC_SMALL_FAST_MODEL = MODEL
process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = MODEL
process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = MODEL
process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = MODEL

// Set non-interactive for initial test (change to interactive later)
// process.env.CLAUDE_CODE_ENTRYPOINT = 'cli'

// Increase timeout for local model (slower than cloud)
process.env.API_TIMEOUT_MS = String(300 * 1000) // 5 minutes

// Trust workspace automatically
process.env.CLAUDE_CODE_TRUST_WORKSPACE = '1'

// ═══════════════════════════════════════════════════════════════════════════
// Launch the app
// ═══════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════')
console.log('  🤖 LocalClaude — Your Private AI Assistant  ')
console.log('═══════════════════════════════════════════════')
console.log(`  Model: ${process.env.OLLAMA_MODEL}`)
console.log(`  Ollama: ${process.env.OLLAMA_BASE_URL}`)
console.log(`  Context: ${process.env.OLLAMA_CONTEXT_LENGTH} tokens`)
console.log('═══════════════════════════════════════════════')
console.log('')

// Import and run the main module
import('./main.js').catch((err: unknown) => {
  console.error('Failed to start LocalClaude:', err)
  process.exit(1)
})
