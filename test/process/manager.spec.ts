import cluster, { Worker } from 'node:cluster'
import pidusage from 'pidusage'

import {
  createProcess,
  destroyProcess,
  getPidsOfActiveProcesses,
  getProcessByPid,
  getResourceConsumptionMetricsForActiveProcesses,
  ProcessMeta,
  recreateProcess,
} from '../../src/process/manager'
import { logger } from '../../src/utils/logger.utils'
import { config } from '../../src/config'
import * as retryUtils from '../../src/utils/retry.utils'
import { sleep } from '../../src/utils/async.utils'
import { WorkerMock } from '../mock/worker.mock'

jest.mock('node:cluster')
jest.mock('pidusage')
jest.mock('../../src/utils/async.utils')
jest.mock('../../src/utils/logger.utils')

const originalConfig = Object.assign({}, config)

describe('Process manager', () => {
  beforeEach(() => {
    Object.keys(originalConfig).forEach(
      (k) =>
        ((config as Record<string, unknown>)[k] = (originalConfig as Record<string, unknown>)[k]),
    )

    jest.spyOn(process, 'exit').mockImplementation()
  })

  afterEach(() => {
    getPidsOfActiveProcesses()
      .map((p) => getProcessByPid(p))
      .forEach((data) => data && destroyProcess(data[0]))
  })

  describe('createProcess()', () => {
    it('should register process', async () => {
      const worker = new WorkerMock(1)
      jest.spyOn(cluster, 'fork').mockImplementation(() => worker as Worker)

      await createProcess()

      expect(cluster.fork).toHaveBeenCalled()

      const data = getProcessByPid(worker.process.pid)

      expect(data?.[1]).toEqual({
        isAlive: true,
        isBeingRestarted: false,
        worker,
      })
      expect(getPidsOfActiveProcesses()).toEqual([worker.process.pid])
    })

    it('should attach event listeners', async () => {
      config.disableAutoRestart = true
      const worker = new WorkerMock(1)

      jest.spyOn(cluster, 'fork').mockImplementation(() => worker as Worker)

      await createProcess()

      expect(cluster.fork).toHaveBeenCalled()

      worker.process.stdout.emit('data', 'hello')
      worker.process.stderr.emit('data', 'hello')
      worker.emit('error', new Error('msg'))
      worker.emit('disconnect')

      expect(logger.info).toHaveBeenCalledWith('hello', worker.process.pid)
      expect(logger.error).toHaveBeenCalledWith('hello', worker.process.pid)
      expect(logger.error).toHaveBeenCalledWith(
        `Error event received from child process: msg`,
        worker.process.pid,
      )
      expect(logger.warn).toHaveBeenCalledWith('Process disconnected!', worker.process.pid)
      expect(process.exit).toHaveBeenCalled()
    })
  })

  describe('getProcessByPid()', () => {
    it('should get process by pid', async () => {
      const worker = new WorkerMock(1)

      jest.spyOn(cluster, 'fork').mockImplementation(() => worker as Worker)

      await createProcess()

      expect(getProcessByPid(1)).toEqual([
        expect.any(String),
        {
          isAlive: true,
          isBeingRestarted: false,
          worker,
        },
      ])
    })

    it('should return null if process with provided pid is not registered', () => {
      expect(getProcessByPid(1)).toEqual(null)
    })
  })

  describe('destroyProcess()', () => {
    it('should send sigterm and remove process from the record', async () => {
      const worker = new WorkerMock(1)

      jest.spyOn(cluster, 'fork').mockImplementation(() => worker as Worker)

      const [uid, proc] = await createProcessAndAttachSpy(worker)
      const destroySpy = jest.spyOn(proc.worker, 'destroy')

      destroyProcess(uid)

      expect(destroySpy).toHaveBeenCalledWith('sigterm')

      expect(getPidsOfActiveProcesses()).toEqual([])
      expect(process.exit).toHaveBeenCalled()
    })
  })

  describe('recreateProcess()', () => {
    it('should recreate the process', async () => {
      jest.mock('../../src/utils/retry.utils')

      const worker1 = new WorkerMock(1)
      const worker2 = new WorkerMock(2)

      jest
        .spyOn(cluster, 'fork')
        .mockImplementationOnce(() => worker1 as Worker)
        .mockImplementationOnce(() => worker2 as Worker)

      const retrySpy = jest.spyOn(retryUtils, 'retryWithExponentialBackoff')

      const [uid, proc] = await createProcessAndAttachSpy(worker1)
      const destroySpy = jest.spyOn(proc.worker, 'destroy')
      const isDeadSpy = jest
        .spyOn(proc.worker, 'isDead')
        .mockImplementationOnce(() => false)
        .mockImplementationOnce(() => true)

      await recreateProcess(uid)

      expect(destroySpy).toHaveBeenCalled()
      expect(isDeadSpy).toHaveBeenCalledTimes(2)
      expect(retrySpy).toHaveBeenCalledWith({
        description: 'create process',
        expRate: 0,
        fn: expect.any(Function),
        retries: 3,
      })

      expect(getPidsOfActiveProcesses()).toEqual([worker2.process.pid])
      expect(getProcessByPid(worker1.process.pid)).toEqual(null)
    })

    it('should use exp backoff & custom amount of retries if specified', async () => {
      config.useExponentialBackoff = true
      config.maxConsecutiveRetries = 4

      const worker1 = new WorkerMock(1)
      const worker2 = new WorkerMock(2)

      jest
        .spyOn(cluster, 'fork')
        .mockImplementationOnce(() => worker1 as Worker)
        .mockImplementationOnce(() => {
          throw new Error('error occurred!')
        })
        .mockImplementationOnce(() => {
          throw new Error('error occurred!')
        })
        .mockImplementationOnce(() => worker2 as Worker)

      const [uid, proc] = await createProcessAndAttachSpy(worker1)
      const retrySpy = jest.spyOn(retryUtils, 'retryWithExponentialBackoff')

      const isDeadSpy = jest
        .spyOn(proc.worker, 'isDead')
        .mockImplementationOnce(() => false)
        .mockImplementationOnce(() => true)

      await recreateProcess(uid)

      expect(isDeadSpy).toHaveBeenCalledTimes(2)
      expect(retrySpy).toHaveBeenCalledWith({
        description: 'create process',
        expRate: 2,
        fn: expect.any(Function),
        retries: 4,
      })

      expect(sleep).toHaveBeenNthCalledWith(2, 2000)
      expect(sleep).toHaveBeenNthCalledWith(3, 4000)

      expect(getPidsOfActiveProcesses()).toEqual([worker2.process.pid])
      expect(getProcessByPid(worker1.process.pid)).toEqual(null)
    })
  })

  describe('getResourceConsumptionMetricsForActiveProcesses()', () => {
    it('should get metrics of currently active processes', async () => {
      const worker = new WorkerMock(1)
      const res = {
        1: {
          pid: 1,
          cpu: 0.5,
          memory: 1_000_000,
        },
      }

      ;(pidusage as unknown as jest.Mock).mockImplementation(() => res)

      jest.spyOn(cluster, 'fork').mockImplementationOnce(() => worker as Worker)

      await createProcess()

      const metrics = await getResourceConsumptionMetricsForActiveProcesses()

      expect(metrics).toEqual(res)
    })
  })
})

async function createProcessAndAttachSpy(worker: WorkerMock): Promise<[string, ProcessMeta]> {
  await createProcess()

  const data = getProcessByPid(worker.process.pid)

  if (!data) {
    return fail(`No process found for pid: ${worker.process.pid}`)
  }

  return data
}