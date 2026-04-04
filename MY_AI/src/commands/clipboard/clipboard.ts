import type { LocalCommandCall } from '../../types/command.js'
import {
  readClipboardWithSidecar,
  writeClipboardWithSidecar,
} from '../../services/systemControl/sidecarControl.js'

export const call: LocalCommandCall = async args => {
  const trimmed = args.trim()

  if (!trimmed) {
    return {
      type: 'text',
      value: 'Usage: /clipboard <read|write> [text]',
    }
  }

  if (trimmed === 'read') {
    try {
      const text = await readClipboardWithSidecar()
      return {
        type: 'text',
        value: text.length > 0 ? text : '(clipboard is empty)',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { type: 'text', value: `Clipboard read failed: ${message}` }
    }
  }

  if (trimmed.startsWith('write ')) {
    const text = trimmed.slice('write '.length)
    try {
      await writeClipboardWithSidecar(text)
      return { type: 'text', value: 'Clipboard updated.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { type: 'text', value: `Clipboard write failed: ${message}` }
    }
  }

  return {
    type: 'text',
    value: 'Usage: /clipboard <read|write> [text]',
  }
}
