import type { Command } from '../../commands.js'

const openApp = {
  type: 'local',
  name: 'open-app',
  aliases: ['launch-app'],
  description: 'Launch a desktop app via the local sidecar',
  supportsNonInteractive: false,
  load: () => import('./open-app.js'),
} satisfies Command

export default openApp
