import cluster from 'node:cluster'
import { availableParallelism } from 'node:os'
import { Command } from 'commander'
import { createProcess } from '../../process/manager'
import { attachClusterListeners } from '../../process/listeners'
import { logger } from '../../utils/logger.utils'
import { config, MaxMemoryRestart, MemoryUnit } from '../../config'
import * as process from 'node:process'

type StartCommandOptions = {
  maxMemoryRestart?: `<number>B` | `<number>KB` | '<number>MB' | '<number>GB' | number
  maxRestartAttempts?: number
  disableAutoRestart?: boolean
  processes?: number
}

export function configureStartCommand(program: Command): void {
  program
    .command('start')
    .argument('<file_path>', 'node entrypoint')
    .option(
      '--max-memory-restart <memory>',
      'Maximum allowed memory for a child process. WHen reached, the process will be restarted.',
    )
    .option('--disable-auto-restart', 'Do not attempt to restart dead process')
    .option('--no-auto-restart', 'start an app without automatic restart')
    .option('-p, --processes <number>', 'Number of processes to launch')
    .action(onStart)
}

function onStart(path: string, opts: StartCommandOptions): void {
  populateConfigFromStartOptions(opts)

  cluster.setupPrimary({
    exec: path,
    silent: true,
  })

  const processesToLaunch = config.processes ?? availableParallelism()

  attachClusterListeners(config)

  logger.info(`Launching ${processesToLaunch} processes for "${path}" script.`)

  for (let i = 0; i < processesToLaunch; i++) {
    createProcess(config)
  }
}

function populateConfigFromStartOptions(opts: StartCommandOptions): void {
  if (opts.disableAutoRestart && opts.maxMemoryRestart) {
    logger.error('"disableAutoRestart" and "maxMemoryRestart flags cannot be used together."')
    process.exit(1)
  }

  config.maxRestartAttempts = opts.maxRestartAttempts
  config.disableAutoRestart = opts.disableAutoRestart ?? false
  config.maxMemoryRestart = extractSpecifiedMaxMemoryValue(opts)
  config.processes = opts.processes
}

function extractSpecifiedMaxMemoryValue({
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
  console.log(unit, value)

  if (lastCharIndex <= 0 || !Object.values(MemoryUnit).includes(unit) || isNaN(value)) {
    logger.error(
      `Incorrect value provided for "maxMemoryRestart ("${maxMemoryRestart}"): should be a plain number or a number with correct suffix."`,
    )
    logger.error('Example correct input for "maxMemoryRestart": 100, 500KB, 250MB, 1GB')

    process.exit(1)
  }

  return {
    unit,
    value,
    readable: maxMemoryRestart,
  }
}
