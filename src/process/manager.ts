import cluster, { Worker } from 'node:cluster'
import * as util from 'node:util'
import pidusage, { Status } from 'pidusage'

import { logger } from '../utils/logger.utils'
import { config } from '../config'
import { sleep } from '../utils/async.utils'
import { retryWithExponentialBackoff } from '../utils/retry.utils'
import { v4 } from 'uuid'

const activeProcesses: Record<string, ProcessMeta> = {}

export type ProcessMeta = {
  worker: Worker
  isBeingRestarted: boolean
  isAlive: boolean
}

export type ProcessWithUid = {
  uid: string
  meta: ProcessMeta
}

export async function createProcess(existingUid?: string): Promise<Worker> {
  const child = cluster.fork()
  const processUid = existingUid ?? registerProcess(child)

  if (!processUid) {
    throw new Error(`Could not register process!`)
  }

  if (config.overrideChildStdio) {
    child.process.stdout?.on('data', (data) => logger.info(data, child.process.pid))
    child.process.stderr?.on('data', (data) => logger.error(data, child.process.pid))
  }

  child.on('error', (e) => {
    logger.error(`Error event received from child process: ${e.message}`, child.process.pid)
    logger.error(util.inspect(e), child.process.pid)
  })

  child.on('disconnect', async () => {
    const pid = child.process.pid
    const proc = activeProcesses[processUid]

    if (!proc) {
      logger.error(`Process "${pid}" not found in the active processes list!`)
      return
    }

    proc.isAlive = false

    logger.warn('Process disconnected!', pid)

    if (!config.disableAutoRestart && !proc.isBeingRestarted) {
      logger.warn('Replacing dead process...', pid)

      await recreateProcess(processUid)
    }

    if (config.disableAutoRestart) {
      await destroyProcess(processUid)
    }
  })

  return child
}

export function getActiveProcesses(): Record<string, ProcessMeta> {
  return activeProcesses
}

export function getPidsOfActiveProcesses(): number[] {
  return Object.values(activeProcesses).map((p) => p.worker.process.pid) as number[]
}

export function getProcessByPid(pid: number): ProcessWithUid | null {
  const data = Object.entries(activeProcesses).find(([_, p]) => p.worker.process.pid === pid)

  return data ? { uid: data[0], meta: data[1] } : null
}

export async function destroyProcess(uid: string): Promise<void> {
  const existingProcess = activeProcesses[uid]

  if (!existingProcess) {
    throw new Error(`No process is registered for the uid: "${uid}"`)
  }

  await killProcess(existingProcess.worker)

  delete activeProcesses[uid]

  checkIfProcessPoolExhausted()
}

export async function recreateProcess(uid: string): Promise<void> {
  const activeProcess = activeProcesses[uid]

  if (!activeProcess) {
    return logger.error(`No active process found for uid: ${uid}`)
  }

  activeProcess.isBeingRestarted = true

  await killProcess(activeProcess.worker)

  const child: Worker | null = await attemptToCreateProcessWithRetry(
    activeProcess,
    uid,
    config.useExponentialBackoff ? 'exp' : 'normal',
  )

  activeProcess.isBeingRestarted = false

  if (!child) {
    logger.error(`Could not recreate process!`)

    delete activeProcesses[uid]

    return checkIfProcessPoolExhausted()
  }

  activeProcess.worker = child
}

export async function getResourceConsumptionMetricsForActiveProcesses(): Promise<
  Record<number, Status>
> {
  const processIds = Object.values(activeProcesses)
    .filter((p) => p.isAlive && !p.isBeingRestarted && p.worker.process.pid)
    .map((p) => p.worker.process.pid) as number[]

  if (!processIds.length) {
    return {}
  }

  return pidusage(processIds)
}

function attemptToCreateProcessWithRetry(
  processMetadata: ProcessMeta,
  uid: string,
  strategy: 'exp' | 'normal',
): Promise<Worker | null> {
  const expRate = strategy === 'exp' ? 2 : 0

  return retryWithExponentialBackoff({
    fn: async () => {
      const result = await createProcess(uid)

      processMetadata.isAlive = true
      processMetadata.worker = result

      // Safeguard in case process is alive, but node app has not started yet.
      await sleep(3_000)

      if (!processMetadata.isAlive) {
        await killProcess(result)

        return null
      }

      return result
    },
    retries: config.maxConsecutiveRetries,
    description: 'create process',
    expRate,
  })
}

function registerProcess(worker: Worker): string | null {
  const pid = extractPid(worker)

  if (getProcessByPid(pid)) {
    logger.warn(`"${pid}" is already registered!`)
    return null
  }

  const uid = v4()

  activeProcesses[uid] = {
    worker,
    isBeingRestarted: false,
    isAlive: true,
  }

  return uid
}

function extractPid(worker: Worker): number {
  const pid = worker.process.pid

  if (!pid) {
    throw new Error(`PID is undefined for worker: "${worker.id}"!`)
  }

  return pid
}

function checkIfProcessPoolExhausted(): void {
  if (!Object.keys(activeProcesses).length) {
    logger.info(`No active processes remain, exiting.`)

    return process.exit(0)
  }
}

async function killProcess(worker: Worker): Promise<void> {
  const sigTermSentAt = new Date()

  logger.info(`Sending SIGTERM to process "${worker.process.pid}".`)

  worker.destroy('sigterm')

  while (!worker.isDead()) {
    await sleep(300)

    const timeElapsed = new Date().getTime() - sigTermSentAt.getTime()

    if (timeElapsed > config.waitTimeBeforeSendingSigKillMs) {
      logger.info(`Process "${worker.process.pid}" failed to terminate on time, sending SIGKILL.`)
      worker.destroy('sigkill')
      break
    }
  }
}
