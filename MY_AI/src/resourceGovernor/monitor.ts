import os from 'os'

import { isAnyProcessRunning } from './processDetector.js'
import type { ResourceSnapshot } from './types.js'

function bytesToGb(bytes: number): number {
  return bytes / (1024 * 1024 * 1024)
}

export function getDefaultProcessList(): string[] {
  const configured = process.env.DETECT_PROCESS_LIST
  if (!configured) {
    return ['UnrealEditor.exe', 'UE4Editor.exe', 'ShaderCompileWorker.exe']
  }

  return configured
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

export async function sampleResources(
  processNames: string[] = getDefaultProcessList(),
): Promise<ResourceSnapshot> {
  const totalMemoryBytes = os.totalmem()
  const freeMemoryBytes = os.freemem()
  const usedMemoryBytes = Math.max(0, totalMemoryBytes - freeMemoryBytes)
  const totalRamGb = bytesToGb(totalMemoryBytes)
  const usedRamGb = bytesToGb(usedMemoryBytes)
  const ramUsageRatio = totalMemoryBytes > 0 ? usedMemoryBytes / totalMemoryBytes : 0

  const unrealDetected = await isAnyProcessRunning(processNames)

  return {
    timestampMs: Date.now(),
    totalRamGb,
    usedRamGb,
    ramUsageRatio,
    unrealDetected,
  }
}
