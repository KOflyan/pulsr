import { convertFromBytes } from '../utils/number.utils'
import {
  getProcessByPid,
  getResourceConsumptionMetricsForActiveProcesses,
  recreateProcess,
} from './manager'
import { logger } from '../utils/logger.utils'
import { AppConfig, config, MemoryUnit } from '../config'

export function attachClusterListeners(config: AppConfig): void {
  setInterval(metricsCollector, config.metricCollectionIntervalMs)
}

async function metricsCollector() {
  const metrics = await getResourceConsumptionMetricsForActiveProcesses()

  for (const metric of metrics) {
    const unit = config.maxMemoryRestart?.unit ?? MemoryUnit.MB
    const actualMemory = convertFromBytes(metric.memory, unit)
    const actualMemoryReadable = `${Math.round(actualMemory)}${unit}`

    logger.debug(`Worker ${metric.pid} memory consumption is ${actualMemoryReadable}`)

    if (
      config.maxMemoryRestart &&
      getProcessByPid(metric.pid) != null &&
      actualMemory >= config.maxMemoryRestart.value
    ) {
      logger.warn(
        `Memory usage threshold of ${config.maxMemoryRestart.readable} exceeded for process "${metric.pid}", current value: ${actualMemoryReadable}. Recreating the process...`,
      )

      recreateProcess(metric.pid, config)
    }
  }
}
