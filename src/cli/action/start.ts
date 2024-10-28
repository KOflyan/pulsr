import cluster, { Worker } from 'node:cluster'
import { availableParallelism } from 'node:os'
import * as fs from 'node:fs'
import { Command } from 'commander'
import { createProcess } from '../../process/manager'
import { logger } from '../../utils/logger.utils'
import { config, MaxMemoryRestart, MemoryUnit } from '../../config'
import { startMetricsCollection } from '../../process/metrics'
import { registerGracefulShutdown } from '../../process/shutdown'

export type StartCommandOptions = {
  maxMemoryRestart?: number | `${number}KB` | `${number}MB` | `${number}GB`
  maxConsecutiveRetries: number
  disableAutoRestart: boolean
  useExponentialBackoff: boolean
  sendSigkillAfter: number
  processes?: number
}

export function configureStartCommand(program: Command): void {
  program
    .command('start')
    .argument('<file_path>', 'Path to a NodeJS script to execute.')
    .option(
      '--max-memory-restart <memory>',
      'Maximum allowed memory for a child process. When reached, the process will be automatically restarted. Example values: 10000, 10000B, 1000KB, 300MB, 1GB.',
    )
    .option('--disable-auto-restart', 'Do not attempt to restart dead process.', false)
    .option(
      '--use-exponential-backoff',
      'Use exponential backoff when restarting dead process.',
      false,
    )
    .option(
      '--send-sigkill-after <ms>',
      'Send sigkill after this amount of time after sigterm if process did not terminate (milliseconds).',
      Number,
      2_000,
    )
    .option(
      '--max-consecutive-retries <number>',
      'Maximum consecutive attempts to restart dead process.',
      Number,
      config.maxConsecutiveRetries,
    )
    .option(
      '-p, --processes <number>',
      'Number of processes to launch.',
      Number,
      availableParallelism(),
    )
    .action(onStart)
}

export async function onStart(path: string, opts: StartCommandOptions): Promise<void> {
  if (!fs.existsSync(path)) {
    logger.error(`Could not find executable: ${path}`)
    logger.error(`Please specify correct path to the executable file and try again.`)

    return process.exit(1)
  }

  if (!opts.processes || Number.isNaN(Number(opts.processes)) || Number(opts.processes) <= 0) {
    logger.error('"processes" should be a positive number.')
    return process.exit(1)
  }

  if (Number.isNaN(Number(opts.sendSigkillAfter)) || opts.sendSigkillAfter <= 0) {
    logger.error('"--send-sigkill-after" should be a positive number if specified.')
    return process.exit(1)
  }

  if (opts.disableAutoRestart && (opts.maxMemoryRestart || opts.useExponentialBackoff)) {
    logger.error(
      '"maxMemoryRestart" and "useExponentialBackoff" flags cannot be used together with "disableAutoRestart".',
    )

    return process.exit(1)
  }

  if (Number.isNaN(Number(opts.maxConsecutiveRetries)) || Number(opts.maxConsecutiveRetries) <= 0) {
    logger.error('"maxConsecutiveRetries" should be a positive number if specified.')
    return process.exit(1)
  }

  populateConfigFromStartOptions(opts)
  registerGracefulShutdown()

  cluster.setupPrimary({
    exec: path,
    silent: true,
  })

  const processesToLaunch = config.processes

  startMetricsCollection()

  logger.info(`Launching ${processesToLaunch} processes for "${path}" script.`)

  const createProcessPromises: Promise<Worker>[] = []

  for (let i = 0; i < processesToLaunch; i++) {
    createProcessPromises.push(createProcess())
  }

  await Promise.all(createProcessPromises)
}

function populateConfigFromStartOptions(opts: StartCommandOptions): void {
  config.processes = Number(opts.processes)
  config.maxConsecutiveRetries = Number(opts.maxConsecutiveRetries)
  config.disableAutoRestart = opts.disableAutoRestart
  config.useExponentialBackoff = opts.useExponentialBackoff
  config.maxMemoryRestart = extractMaxMemoryRestartValue(opts)
  config.waitTimeBeforeSendingSigKillMs =
    opts.sendSigkillAfter ?? config.waitTimeBeforeSendingSigKillMs
}

function extractMaxMemoryRestartValue({
  maxMemoryRestart,
}: StartCommandOptions): MaxMemoryRestart | undefined {
  if (!maxMemoryRestart) {
    return undefined
  }

  if (typeof maxMemoryRestart === 'number') {
    return {
      unit: MemoryUnit.B,
      value: maxMemoryRestart,
      readable: `${maxMemoryRestart}B`,
    }
  }

  const lastCharIndex = maxMemoryRestart.length - 2

  const unit = maxMemoryRestart.substring(lastCharIndex) as MemoryUnit
  const value = Number(maxMemoryRestart.substring(0, lastCharIndex))

  if (lastCharIndex <= 0 || !Object.values(MemoryUnit).includes(unit) || isNaN(value)) {
    logger.error(
      `Incorrect value provided for "maxMemoryRestart ("${maxMemoryRestart}"): should be a plain number or a number with correct suffix."`,
    )
    logger.error('Example correct input for "maxMemoryRestart": 100, 500KB, 250MB, 1GB')

    return process.exit(1)
  }

  return {
    unit,
    value,
    readable: maxMemoryRestart,
  }
}
