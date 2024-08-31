import cluster, { Worker } from 'node:cluster'
import pidusage from 'pidusage'
import { createProcess, getProcessByPid } from '../../src/process/manager'
import { WorkerMock } from '../mock/worker.mock'
import { config, configuredTimers, MemoryUnit, Timers } from '../../src/config'
import { sleep } from '../../src/utils/async.utils'
import * as manager from '../../src/process/manager'
import { startMetricsCollection } from '../../src/process/metrics'

jest.mock('node:cluster')
jest.mock('pidusage')
jest.mock('../../src/utils/logger.utils')

const originalConfig = Object.assign({}, config)

describe('Metrics', () => {
  beforeEach(() => {
    Object.keys(originalConfig).forEach(
      (k) =>
        ((config as Record<string, unknown>)[k] = (originalConfig as Record<string, unknown>)[k]),
    )
    Object.keys(configuredTimers).forEach((k) => delete configuredTimers[k as keyof Timers])

    jest.spyOn(process, 'exit').mockImplementation()
  })

  describe('startMetricsCollection()', () => {
    it('should recreate process if memory exceeds threshold', async () => {
      const worker1 = new WorkerMock(1)
      const worker2 = new WorkerMock(2)
      const worker3 = new WorkerMock(3)

      config.metricCollectionIntervalMs = 300
      config.maxMemoryRestart = {
        value: 1_000_000,
        unit: MemoryUnit.B,
        readable: `1 000 000 B`,
      }

      const pidUsageMock = pidusage as unknown as jest.Mock
      const metrics = {
        1: {
          pid: 1,
          cpu: 0.5,
          memory: 999_999,
        },
        2: {
          pid: 2,
          cpu: 0.6,
          memory: 1_500_000,
        },
      }

      pidUsageMock.mockImplementation(() => metrics)

      jest
        .spyOn(cluster, 'fork')
        .mockImplementationOnce(() => worker1 as Worker)
        .mockImplementationOnce(() => worker2 as Worker)
        .mockImplementationOnce(() => worker3 as Worker)

      const recreateProcessSpy = jest.spyOn(manager, 'recreateProcess').mockImplementation()

      await Promise.all([createProcess(), createProcess()])

      const t = startMetricsCollection()

      await sleep(300)

      const data = getProcessByPid(2)

      expect(recreateProcessSpy).toHaveBeenCalledWith(data?.uid)

      clearTimeout(t)
    })

    it('should not do anything if getResourceConsumptionMetricsForActiveProcesses() throws', async () => {
      const worker1 = new WorkerMock(1)

      config.metricCollectionIntervalMs = 300
      config.maxMemoryRestart = {
        value: 1_000_000,
        unit: MemoryUnit.B,
        readable: `1 000 000 B`,
      }

      jest.spyOn(cluster, 'fork').mockImplementation(() => worker1 as Worker)

      jest
        .spyOn(manager, 'getResourceConsumptionMetricsForActiveProcesses')
        .mockImplementation(() => {
          throw new Error('abcd')
        })

      const recreateProcessSpy = jest.spyOn(manager, 'recreateProcess')

      await createProcess()

      const t = startMetricsCollection()

      await sleep(300)

      expect(recreateProcessSpy).not.toHaveBeenCalled()

      clearTimeout(t)
    })
  })
})
