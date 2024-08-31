import { configureStartCommand, onStart, StartCommandOptions } from '../../src/cli/action/start'
import { Command } from 'commander'
import * as path from 'node:path'
import { logger } from '../../src/utils/logger.utils'
import { config, MemoryUnit } from '../../src/config'
import { createProcess } from '../../src/process/manager'
import { startMetricsCollection } from '../../src/process/metrics'
import cluster from 'node:cluster'
import { availableParallelism } from 'node:os'

jest.mock('node:cluster')
jest.mock('../../src/process/metrics')
jest.mock('../../src/utils/logger.utils')
jest.mock('../../src/process/manager')

const scriptPath = path.join(__dirname, '../assets/script.js')

describe('start command', () => {
  beforeEach(() => {
    jest.spyOn(process, 'exit').mockImplementation()
  })

  describe('configureStartCommand()', () => {
    it('should register correct options and args', () => {
      const cmd = new Command()

      const commandSpy = jest.spyOn(cmd, 'command').mockImplementation(() => cmd)
      const optionSpy = jest.spyOn(cmd, 'option').mockImplementation(() => cmd)
      const argumentSpy = jest.spyOn(cmd, 'argument').mockImplementation(() => cmd)
      const actionSpy = jest.spyOn(cmd, 'action').mockImplementation(() => cmd)

      configureStartCommand(cmd)

      expect(commandSpy).toHaveBeenCalledWith('start')
      expect(argumentSpy).toHaveBeenCalledWith('<file_path>', 'Path to a NodeJS script to execute.')
      expect(optionSpy).toHaveBeenCalledWith(
        '--max-memory-restart <memory>',
        'Maximum allowed memory for a child process. When reached, the process will be automatically restarted. Example values: 10000, 10000B, 1000KB, 300MB, 1GB.',
      )
      expect(optionSpy).toHaveBeenCalledWith(
        '--disable-auto-restart',
        'Do not attempt to restart dead process.',
        false,
      )
      expect(optionSpy).toHaveBeenCalledWith(
        '--use-exponential-backoff',
        'Use exponential backoff when restarting dead process.',
        false,
      )
      expect(optionSpy).toHaveBeenCalledWith(
        '--max-consecutive-retries <number>',
        'Maximum consecutive attempts to restart dead process.',
        Number,
        config.maxConsecutiveRetries,
      )

      expect(optionSpy).toHaveBeenCalledWith(
        '-p, --processes <number>',
        'Number of processes to launch.',
        Number,
        availableParallelism(),
      )

      expect(actionSpy).toHaveBeenCalledWith(onStart)
    })
  })

  describe('onStart()', () => {
    it('should exit if provided script does not exist', async () => {
      await onStart('non-existent', {} as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith('Could not find executable: non-existent')
      expect(logger.error).toHaveBeenCalledWith(
        'Please specify correct path to the executable file and try again.',
      )
      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('should exit if processes number is not provided or incorrect', async () => {
      await onStart(scriptPath, {
        processes: 'asd',
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith('"processes" should be a positive number.')
      expect(process.exit).toHaveBeenCalledWith(1)

      await onStart(scriptPath, {} as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith('"processes" should be a positive number.')
      expect(process.exit).toHaveBeenCalledWith(1)

      await onStart(scriptPath, {
        processes: -1,
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith('"processes" should be a positive number.')
      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('should exit if maxConsecutiveRetries is not provided or incorrect', async () => {
      await onStart(scriptPath, {
        processes: 1,
        maxConsecutiveRetries: 'asd',
        sendSigkillAfter: 2_000,
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith(
        '"maxConsecutiveRetries" should be a positive number if specified.',
      )
      expect(process.exit).toHaveBeenCalledWith(1)

      await onStart(scriptPath, {
        processes: 1,
        maxConsecutiveRetries: -1,
        sendSigkillAfter: 2_000,
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith(
        '"maxConsecutiveRetries" should be a positive number if specified.',
      )
      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('should exit if "disableAutoRestart" is used together with "useExponentialBackoff", "maxMemoryRestart" or "maxConsecutiveRetries"', async () => {
      await onStart(scriptPath, {
        processes: 1,
        disableAutoRestart: true,
        maxConsecutiveRetries: 3,
        sendSigkillAfter: 2_000,
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith(
        '"maxMemoryRestart", "useExponentialBackoff" and "maxConsecutiveRetries" flags cannot be used together with "disableAutoRestart".',
      )
      expect(process.exit).toHaveBeenCalledWith(1)

      await onStart(scriptPath, {
        processes: 1,
        disableAutoRestart: true,
        maxMemoryRestart: 12345,
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith(
        '"maxMemoryRestart", "useExponentialBackoff" and "maxConsecutiveRetries" flags cannot be used together with "disableAutoRestart".',
      )
      expect(process.exit).toHaveBeenCalledWith(1)

      await onStart(scriptPath, {
        processes: 1,
        disableAutoRestart: true,
        useExponentialBackoff: true,
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith(
        '"maxMemoryRestart", "useExponentialBackoff" and "maxConsecutiveRetries" flags cannot be used together with "disableAutoRestart".',
      )
      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('should exit if "maxMemoryRestart" is not in correct format', async () => {
      await onStart(scriptPath, {
        processes: 1,
        maxMemoryRestart: 'asd',
        sendSigkillAfter: 2_000,
        maxConsecutiveRetries: 3,
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith(
        `Incorrect value provided for "maxMemoryRestart ("asd"): should be a plain number or a number with correct suffix."`,
      )
      expect(logger.error).toHaveBeenCalledWith(
        'Example correct input for "maxMemoryRestart": 100, 500KB, 250MB, 1GB',
      )
      expect(process.exit).toHaveBeenCalledWith(1)

      await onStart(scriptPath, {
        processes: 1,
        maxMemoryRestart: '1000M',
        sendSigkillAfter: 2_000,
        maxConsecutiveRetries: 3,
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith(
        `Incorrect value provided for "maxMemoryRestart ("1000M"): should be a plain number or a number with correct suffix."`,
      )
      expect(logger.error).toHaveBeenCalledWith(
        'Example correct input for "maxMemoryRestart": 100, 500KB, 250MB, 1GB',
      )
      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('should exit if "waitTimeBeforeSendingSigKillMs" is incorrect', async () => {
      await onStart(scriptPath, {
        processes: 1,
        maxMemoryRestart: '100MB',
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith(
        `"--send-sigkill-after" should be a positive number if specified.`,
      )

      expect(process.exit).toHaveBeenCalledWith(1)

      await onStart(scriptPath, {
        processes: 1,
        maxMemoryRestart: '100MB',
        sendSigkillAfter: -2_000,
      } as unknown as StartCommandOptions)

      expect(logger.error).toHaveBeenCalledWith(
        `"--send-sigkill-after" should be a positive number if specified.`,
      )

      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('should populate config object from input options', async () => {
      await onStart(scriptPath, {
        processes: 1,
        maxConsecutiveRetries: 5,
        useExponentialBackoff: true,
        disableAutoRestart: false,
        maxMemoryRestart: '300MB',
        sendSigkillAfter: 2_000,
      })

      expect(config).toEqual({
        metricCollectionIntervalMs: 500,
        maxConsecutiveRetries: 5,
        processes: 1,
        useExponentialBackoff: true,
        verbose: false,
        disableAutoRestart: false,
        maxMemoryRestart: { unit: MemoryUnit.MB, value: 300, readable: '300MB' },
        waitTimeBeforeSendingSigKillMs: 2_000,
      })
    })

    it('should create processes and start metrics collection', async () => {
      await onStart(scriptPath, {
        processes: 3,
        maxConsecutiveRetries: 5,
        useExponentialBackoff: true,
        disableAutoRestart: false,
        maxMemoryRestart: '300MB',
        sendSigkillAfter: 2_000,
      })

      expect(cluster.setupPrimary).toHaveBeenCalledWith({
        exec: scriptPath,
        silent: true,
      })
      expect(createProcess).toHaveBeenCalledTimes(3)
      expect(startMetricsCollection).toHaveBeenCalledTimes(1)
    })
  })
})
