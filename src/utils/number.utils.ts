import { MemoryUnit } from '../config'

export const BYTES_IN_KB = Math.pow(2, 10)

export function convertFromBytes(bytes: number, to: MemoryUnit): number {
  switch (to) {
    case MemoryUnit.KB:
      return bytes / BYTES_IN_KB
    case MemoryUnit.MB:
      return bytes / Math.pow(BYTES_IN_KB, 2)
    case MemoryUnit.GB:
      return bytes / Math.pow(BYTES_IN_KB, 3)
  }

  return bytes
}
