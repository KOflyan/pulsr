import { logger } from './logger.utils'
import { sleep } from './async.utils'

export type RetryContext<T> = {
  fn: () => Promise<Exclude<T, void>>
  description: string
  retries: number
  expRate?: number
  meta?: Record<string, unknown>
}

export async function retryWithExponentialBackoff<T>({
  fn,
  description,
  meta,
  expRate,
  retries,
}: RetryContext<T>): Promise<T | null> {
  let result: T | null = null
  let waitTimeS = 1

  const usedExpRate = expRate ?? 2

  for (let i = 0; i < retries; i++) {
    try {
      result = await fn()
    } catch (e) {
      logger.error(`Error occurred when trying to ${description}: ${e}`)

      if (meta) {
        logger.error(`Additional info: ${JSON.stringify(meta, null, 2)}`)
      }
    }

    if (result) {
      break
    }

    waitTimeS = Math.pow(usedExpRate, i + 1)

    if (usedExpRate > 0) {
      await sleep(waitTimeS * 1_000)
    }
  }

  return result
}
