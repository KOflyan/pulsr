import { destroyProcess, getActiveProcesses } from './manager'
import { config, configuredTimers } from '../config'
import { logger } from '../utils/logger.utils'

async function gracefulShutDown(sig: NodeJS.Signals): Promise<void> {
  logger.info(`Received ${sig}, shutting down gracefully...`)

  config.disableAutoRestart = true
  configuredTimers.metricsCollectionTimer?.unref()

  clearTimeout(configuredTimers.metricsCollectionTimer)

  const processes = getActiveProcesses()

  await Promise.all(Object.keys(processes).map((uid) => destroyProcess(uid)))
}

export function registerGracefulShutdown() {
  process.on('SIGTERM', gracefulShutDown)
  process.on('SIGINT', gracefulShutDown)
}
