import type { Command } from '../../commands.js'

const clipboard = {
  type: 'local',
  name: 'clipboard',
  aliases: ['clip'],
  description: 'Read or write clipboard text via local sidecar',
  supportsNonInteractive: false,
  load: () => import('./clipboard.js'),
} satisfies Command

export default clipboard
