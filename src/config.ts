export enum MemoryUnit {
  B = 'B',
  KB = 'KB',
  MB = 'MB',
  GB = 'GB',
}

export type MaxMemoryRestart = {
  unit: MemoryUnit
  value: number
  readable: string
}

export type AppConfig = {
  maxMemoryRestart?: MaxMemoryRestart
  processes: number
  maxConsecutiveRetries: number
  disableAutoRestart: boolean
  useExponentialBackoff: boolean
  metricCollectionIntervalMs: number
  verbose: boolean
}

export const config: AppConfig = {
  metricCollectionIntervalMs: 500,
  maxConsecutiveRetries: 3,
  processes: 1,
  useExponentialBackoff: false,
  verbose: false,
  disableAutoRestart: false,
}
