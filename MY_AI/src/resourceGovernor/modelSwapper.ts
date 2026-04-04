import { setMainLoopModelOverride } from 'src/bootstrap/state.js'

import {
  applyModeToSwapperState,
  createModelSwapperState,
} from './modelSwapperCore.js'
import type { GovernorMode } from './types.js'

const SWAPPER_STATE = createModelSwapperState()

export function applyModelHintForGovernorMode(mode: GovernorMode): void {
  const { model, changed } = applyModeToSwapperState(SWAPPER_STATE, mode)
  if (!model || !changed) {
    return
  }

  setMainLoopModelOverride(model)
}
