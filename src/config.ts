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
  maxRestartAttempts?: number
  processes?: number
  disableAutoRestart: boolean
  metricCollectionIntervalMs: number
  verbose: boolean
}

export const config: AppConfig = {
  metricCollectionIntervalMs: 500,
  verbose: false,
  disableAutoRestart: false,
}
