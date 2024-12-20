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

export type Timers = {
  metricsCollectionTimer?: NodeJS.Timeout
}

export type AppConfig = {
  maxMemoryRestart?: MaxMemoryRestart
  processes: number
  maxConsecutiveRetries: number
  disableAutoRestart: boolean
  useExponentialBackoff: boolean
  metricCollectionIntervalMs: number
  waitTimeBeforeSendingSigKillMs: number
  verbose: boolean
  overrideChildStdio: boolean
}

export const configuredTimers: Timers = {}
export const config: AppConfig = {
  metricCollectionIntervalMs: 500,
  waitTimeBeforeSendingSigKillMs: 2_000,
  maxConsecutiveRetries: 3,
  processes: 1,
  useExponentialBackoff: false,
  verbose: false,
  disableAutoRestart: false,
  overrideChildStdio: false,
}
