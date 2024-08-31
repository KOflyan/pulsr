import { convertFromBytes } from '../utils/number.utils'
import {
  getPidsOfActiveProcesses,
  getProcessByPid,
  getResourceConsumptionMetricsForActiveProcesses,
  recreateProcess,
} from './manager'
import { logger } from '../utils/logger.utils'
import { config, MemoryUnit } from '../config'
import { nonOverlappingInterval } from '../utils/async.utils'
import { Status } from 'pidusage'

export function startMetricsCollection(): NodeJS.Timeout {
  return nonOverlappingInterval(monitorMetrics, config.metricCollectionIntervalMs)
}

async function monitorMetrics() {
  let metrics: Record<number, Status>

  try {
    metrics = await getResourceConsumptionMetricsForActiveProcesses()
  } catch (e) {
    logger.error(
      `Failed to collect metrics for the PIDs (${Object.keys(getPidsOfActiveProcesses())}): ${(e as Error).message} `,
    )
    return
  }

  for (const metric of Object.values(metrics)) {
    const proc = getProcessByPid(metric.pid)
    const unit = config.maxMemoryRestart?.unit ?? MemoryUnit.MB
    const actualMemory = convertFromBytes(metric.memory, unit)
    const actualMemoryReadable = `${Math.round(actualMemory)}${unit}`

    logger.debug(`Worker (pid=${metric.pid}) memory consumption is ${actualMemoryReadable}`)

    if (
      config.maxMemoryRestart &&
      !config.disableAutoRestart &&
      proc &&
      actualMemory >= config.maxMemoryRestart.value
    ) {
      logger.warn(
        `Memory usage threshold of ${config.maxMemoryRestart.readable} exceeded for process "${metric.pid}", current value: ${actualMemoryReadable}. Recreating the process...`,
      )

      await recreateProcess(proc.uid)
    }
  }
}
