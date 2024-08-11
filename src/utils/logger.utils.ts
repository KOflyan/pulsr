import chalk from 'chalk'
import { config } from '../config'

export enum LogLevel {
  INFO,
  WARN,
  ERROR,
  DEBUG,
}

export class Logger {
  debug(text: string | Buffer, pid?: number): void {
    printLogLine(pid, text, LogLevel.DEBUG)
  }

  info(text: string | Buffer, pid?: number): void {
    printLogLine(pid, text, LogLevel.INFO)
  }

  warn(text: string | Buffer, pid?: number): void {
    printLogLine(pid, text, LogLevel.WARN)
  }

  error(text: string | Buffer, pid?: number): void {
    printLogLine(pid, text, LogLevel.ERROR)
  }
}

export function printLogLine(
  pid: number | undefined,
  text: string | Buffer,
  level: LogLevel = LogLevel.INFO,
): void {
  const textWithPid = attachProcessPidIfPresent(pid, text.toString()).trim()

  switch (level) {
    case LogLevel.ERROR:
      return console.error(chalk.red(textWithPid))
    case LogLevel.WARN:
      return console.log(chalk.yellow(textWithPid))
    case LogLevel.DEBUG:
      if (!config.verbose) {
        return
      }
      return console.log(chalk.white(textWithPid))
  }

  if (pid) {
    return console.log(chalk.blue(textWithPid))
  }

  return console.log(chalk.cyan(textWithPid))
}

export const logger = new Logger()

function attachProcessPidIfPresent(pid: number | undefined, text: string): string {
  const prefix = pid ? `[${pid}]` : `[main]`

  return `${prefix.padEnd(10)}${text}`
}
