export function nonOverlappingInterval(fn: () => Promise<void>, periodMs: number): NodeJS.Timeout {
  const timeout = setTimeout(async () => {
    await fn()

    timeout.refresh()
  }, periodMs)

  return timeout
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
