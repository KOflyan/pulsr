import EventEmitter from 'node:events'

export class Process extends EventEmitter {
  pid = 1
  stdout = new EventEmitter()
  stderr = new EventEmitter()

  constructor(pid: number) {
    super()
    this.pid = pid
  }
}

export class WorkerMock extends EventEmitter {
  process = {
    pid: 1,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  }

  destroy(_sig?: string): void {}

  isDead(): boolean {
    return false
  }

  constructor(pid: number) {
    super()

    this.process = new Process(pid)
  }
}
