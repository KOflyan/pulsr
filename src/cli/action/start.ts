import cluster, { Worker } from 'node:cluster'
import { availableParallelism } from 'node:os'
import * as fs from 'node:fs'
import { Command } from 'commander'
import { createProcess } from '../../process/manager'
import { logger } from '../../utils/logger.utils'
import { config, MaxMemoryRestart, MemoryUnit } from '../../config'
import { startMetricsCollection } from '../../process/metrics'

export type StartCommandOptions = {
  maxMemoryRestart?: number | `${number}KB` | `${number}MB` | `${number}GB`
  maxConsecutiveRetries?: number
  disableAutoRestart: boolean
  useExponentialBackoff: boolean
  processes?: number
}

export function configureStartCommand(program: Command): void {
  program
    .command('start')
    .argument('<file_path>', 'Path to a NodeJS script to execute')
    .option(
      '--max-memory-restart <memory>',
      'Maximum allowed memory for a child process. When reached, the process will be automatically restarted.',
    )
    .option('--disable-auto-restart', 'Do not attempt to restart dead process', false)
    .option(
      '--use-exponential-backoff',
      'Use exponential backoff when restarting dead process',
      false,
    )
    .option(
      '--max-consecutive-retries <number>',
      'Maximum consecutive attempts to restart dead process',
      Number,
    )
    .option('-p, --processes <number>', 'Number of processes to launch', Number)
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

  if (
    opts.disableAutoRestart &&
    (opts.maxMemoryRestart ||
      opts.useExponentialBackoff ||
      !Number.isNaN(Number(opts.maxConsecutiveRetries)))
  ) {
    logger.error(
      '"maxMemoryRestart", "useExponentialBackoff" and "maxConsecutiveRetries" flags cannot be used together with "disableAutoRestart".',
    )

    return process.exit(1)
  }

  if (
    opts.maxConsecutiveRetries != undefined &&
    (Number.isNaN(Number(opts.maxConsecutiveRetries)) || Number(opts.maxConsecutiveRetries) <= 0)
  ) {
    logger.error('"maxConsecutiveRetries" should be a positive number if specified.')
    return process.exit(1)
  }

  populateConfigFromStartOptions(opts)

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
  config.processes = Number(opts.processes) ?? availableParallelism()
  config.maxConsecutiveRetries = Number(opts.maxConsecutiveRetries ?? 3)
  config.disableAutoRestart = opts.disableAutoRestart
  config.useExponentialBackoff = opts.useExponentialBackoff
  config.maxMemoryRestart = extractMaxMemoryRestartValue(opts)
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
