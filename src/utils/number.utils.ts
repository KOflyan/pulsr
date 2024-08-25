import { MemoryUnit } from '../config'

export const BYTES_IN_KB = Math.pow(2, 10)

export function convertFromBytes(bytes: number, to: MemoryUnit): number {
  const units = Object.values(MemoryUnit)

  if (to === MemoryUnit.B) {
    return bytes
  }

  for (let i = 1; i < units.length; i++) {
    const unit = units[i]

    if (unit === to) {
      return bytes / Math.pow(BYTES_IN_KB, i)
    }
  }

  throw new Error(`Could not convert bytes to ${to}!`)
}
