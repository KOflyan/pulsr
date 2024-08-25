import chalk from 'chalk'

export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR,
}

export class Logger {
  private level: LogLevel = LogLevel.INFO

  debug(text: string | Buffer, pid?: number): void {
    this.printLogLine(pid, text, LogLevel.DEBUG)
  }

  info(text: string | Buffer, pid?: number): void {
    this.printLogLine(pid, text, LogLevel.INFO)
  }

  warn(text: string | Buffer, pid?: number): void {
    this.printLogLine(pid, text, LogLevel.WARN)
  }

  error(text: string | Buffer, pid?: number): void {
    this.printLogLine(pid, text, LogLevel.ERROR)
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  private printLogLine(
    pid: number | undefined,
    text: string | Buffer,
    level: LogLevel = LogLevel.INFO,
  ): void {
    if (this.level > level || process.env['LOGGING_DISABLED']) {
      return
    }

    const textWithPid = attachProcessPidIfPresent(pid, text.toString()).trim()

    switch (level) {
      case LogLevel.ERROR:
        return console.error(chalk.red(textWithPid))
      case LogLevel.WARN:
        return console.log(chalk.yellow(textWithPid))
      case LogLevel.DEBUG:
        return console.log(chalk.white(textWithPid))
    }

    if (pid) {
      return console.log(chalk.blue(textWithPid))
    }

    return console.log(chalk.cyan(textWithPid))
  }
}

export const logger = new Logger()

function attachProcessPidIfPresent(pid: number | undefined, text: string): string {
  const prefix = pid ? `[child-${pid}]` : `[main]`

  return `${prefix.padEnd(15)}${text}`
}
