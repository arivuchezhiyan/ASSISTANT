import { logForDebugging } from 'src/utils/debug.js'

import { applyModelHintForGovernorMode } from './modelSwapper.js'
import { startResourceGovernor } from './switcher.js'

export function bootstrapResourceGovernor(): () => void {
  return startResourceGovernor({
    onModeChange(next, prev) {
      const previous = prev?.mode ?? 'none'
      logForDebugging(
        `resource-governor mode transition: ${previous} -> ${next.mode} (${next.reason})`,
      )
      applyModelHintForGovernorMode(next.mode)
    },
  })
}
