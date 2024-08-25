import { sleep } from '../../src/utils/async.utils'
import { retryWithExponentialBackoff } from '../../src/utils/retry.utils'

jest.mock('../../src/utils/async.utils')

describe('Retry utils', () => {
  describe('retryWithExponentialBackoff()', () => {
    it('should retry with exp backoff', async () => {
      const fails = 4
      const fn = getRetriedFunction(fails)

      const result = await retryWithExponentialBackoff({
        fn,
        description: 'test',
        retries: fails + 1,
      })

      expect(result).toBe(fails)
      expect(sleep).toHaveBeenCalledTimes(fails)
      expect(sleep).toHaveBeenNthCalledWith(1, 2_000)
      expect(sleep).toHaveBeenNthCalledWith(2, 4_000)
      expect(sleep).toHaveBeenNthCalledWith(3, 8_000)
      expect(sleep).toHaveBeenNthCalledWith(4, 16_000)
    })

    it('should retry with exp backoff (2)', async () => {
      const fails = 4
      const fn = getRetriedFunction(fails)

      await retryWithExponentialBackoff({
        fn,
        description: 'test',
        retries: fails + 1,
        expRate: 3,
        meta: { abc: 1 },
      })

      expect(sleep).toHaveBeenCalledTimes(fails)
      expect(sleep).toHaveBeenNthCalledWith(1, 3_000)
      expect(sleep).toHaveBeenNthCalledWith(2, 9_000)
      expect(sleep).toHaveBeenNthCalledWith(3, 27_000)
      expect(sleep).toHaveBeenNthCalledWith(4, 81_000)
    })

    it('should do simple retry without waiting between retries if expRate is set to 0', async () => {
      const fails = 4
      const fn = getRetriedFunction(fails)

      const result = await retryWithExponentialBackoff({
        fn,
        description: 'test',
        retries: fails + 1,
        expRate: 0,
      })

      expect(result).toBe(fails)
      expect(fn).toHaveBeenCalledTimes(fails + 1)
      expect(sleep).not.toHaveBeenCalled()
    })

    it('should return null if retry attempts are exhausted', async () => {
      const fails = 4
      const fn = getRetriedFunction(fails)

      const result = await retryWithExponentialBackoff({
        fn,
        description: 'test',
        retries: fails,
      })

      expect(result).toBe(null)
      expect(sleep).toHaveBeenCalledTimes(fails)
      expect(fn).toHaveBeenCalledTimes(fails)
    })
  })
})

function getRetriedFunction(fails: number): jest.Mock {
  let i = 0

  return jest.fn(async () => {
    if (i < fails) {
      ++i
      throw new Error('oopsie')
    }
    return i
  })
}
