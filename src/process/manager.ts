import cluster, { Worker } from 'node:cluster'
import * as util from 'node:util'

import { logger } from '../utils/logger.utils'
import pidusage, { Status } from 'pidusage'
import { AppConfig } from '../config'

const activeProcesses: Record<number, Worker> = {}

export function createProcess(config: AppConfig): Worker {
  const child = cluster.fork()

  registerProcess(child)

  child.process.stdout?.on('data', (data) => logger.info(data, child.process.pid))
  child.process.stderr?.on('data', (data) => logger.error(data, child.process.pid))

  child.on('error', (e) => {
    logger.error(`Error event received from child process: ${e}`)
    logger.error(util.inspect(e))
  })

  child.on('disconnect', () => {
    const pid = child.process.pid
    logger.warn('Process disconnected!', pid)

    if (pid && getProcessByPid(pid) && !config.disableAutoRestart) {
      logger.warn('Replacing dead process...', pid)
      recreateProcess(pid, config)
    }
  })

  return child
}

export function getActiveProcesses(): Record<number, Worker> {
  return activeProcesses
}

export function getProcessByPid(pid: number): Worker | null {
  return activeProcesses[pid] ?? null
}

export function destroyProcess(pid: number): void {
  const existingProcess = activeProcesses[pid]

  if (!existingProcess) {
    throw new Error(`No process is registered for the id: "${pid}"`)
  }

  existingProcess.destroy('sigterm')

  delete activeProcesses[pid]
}

export function recreateProcess(pid: number, config: AppConfig): void {
  destroyProcess(pid)

  const child = createProcess(config)

  child.on('online', () => {
    logger.info(`Process "${pid}" was successfully recreated, new pid: "${child.process.pid}"`)
  })
}

export async function getResourceConsumptionMetricsForActiveProcesses(): Promise<Status[]> {
  return Promise.all(Object.keys(getActiveProcesses()).map((pid) => pidusage(pid)))
}

function registerProcess(worker: Worker): void {
  const pid = extractPid(worker)

  if (pid in activeProcesses) {
    return logger.info(`"${pid}" already registered`)
  }

  activeProcesses[pid] = worker
}

function extractPid(worker: Worker): number {
  const pid = worker.process.pid

  if (!pid) {
    throw new Error(`PID is undefined for worker: "${worker.id}"!`)
  }

  return pid
}
