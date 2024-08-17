import { config } from '../config'
import { logger } from './logger.utils'

export function nonOverlappingInterval(fn: () => Promise<void>, periodMs: number): void {
  setTimeout(async () => {
    await fn()

    nonOverlappingInterval(fn, periodMs)
  }, periodMs)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type RetryContext<T> = {
  fn: () => Promise<Exclude<T, void>>
  description: string
  meta?: Record<string, unknown>
}

export async function retryWithExponentialBackoff<T>({
  fn,
  description,
  meta,
}: RetryContext<T>): Promise<T | null> {
  let result: T | null = null
  const expRate = 2
  let waitTimeS = 1

  for (let i = 0; i < config.maxConsecutiveRetries; i++) {
    try {
      console.log(`attempt ${i + 1}`)
      result = await fn()
    } catch (e) {
      logger.error(`Error occurred when trying to ${description}: ${e}`)

      if (meta) {
        logger.error(`Additional info: ${JSON.stringify(meta, null, 2)}`)
      }
    }

    if (result) {
      return result
    }

    waitTimeS = Math.pow(expRate, i + 1)

    await sleep(waitTimeS * 1_000)
  }

  return result
}
