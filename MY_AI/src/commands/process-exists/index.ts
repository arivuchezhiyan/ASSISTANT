import type { Command } from '../../types/command.js'

const processExists: Command = {
  type: 'local-jsx',
  name: 'process-exists',
  description: 'Check whether a process is currently running via local sidecar',
  userFacingName() {
    return '/process-exists'
  },
  isEnabled: true,
  load: () => import('./process-exists.js'),
}

export default processExists
