import type { Command } from '../../commands.js'

const windowFocus = {
  type: 'local',
  name: 'window-focus',
  aliases: ['focus-window'],
  description: 'Focus a desktop window by title via local sidecar',
  supportsNonInteractive: false,
  load: () => import('./window-focus.js'),
} satisfies Command

export default windowFocus
