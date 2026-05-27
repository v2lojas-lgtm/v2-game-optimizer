import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

export type PushEventHandler = (event: string, data: unknown) => void

export class PythonBridge {
  private process: ChildProcess | null = null
  private buffer = ''
  private pending = new Map<string, PendingRequest>()
  private requestId = 0
  private eventHandler: PushEventHandler | null = null

  /** Register a handler for push events from Python (no "id" field). */
  onEvent(handler: PushEventHandler): void {
    this.eventHandler = handler
  }

  start(): void {
    let cmd: string
    let args: string[]

    if (is.dev) {
      cmd = process.platform === 'win32' ? 'python' : 'python3'
      args = [join(process.cwd(), 'python', 'main.py')]
    } else {
      cmd = join(process.resourcesPath, 'sidecar.exe')
      args = []
    }

    this.process = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)

          // Push event from Python (watcher, etc.) — no "id" field
          if (msg.event && this.eventHandler) {
            this.eventHandler(msg.event, msg.data)
            continue
          }

          // Regular request/response
          const req = this.pending.get(msg.id)
          if (req) {
            this.pending.delete(msg.id)
            if (msg.error) req.reject(new Error(msg.error))
            else req.resolve(msg.result)
          }
        } catch {
          // ignore malformed lines
        }
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[Python]', data.toString())
    })

    this.process.on('exit', (code) => {
      console.log('[Python] exited with code', code)
      this.process = null
    })
  }

  /** Commands that naturally take longer — given extra timeout by default. */
  private static SLOW_COMMANDS: Record<string, number> = {
    gamer_network_test: 60000,
    network_test:       30000,
    run_diagnosis:      30000,
    run_smart_optimize: 60000,
    benchmark:          60000,
    tournament_enable:  30000,
    tournament_disable: 20000,
    optimize:           45000,
  }

  invoke(command: string, args?: unknown, timeoutMs?: number): Promise<unknown> {
    const ms = timeoutMs
      ?? PythonBridge.SLOW_COMMANDS[command]
      ?? 15000

    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Python process not running'))
        return
      }

      const id = String(++this.requestId)
      this.pending.set(id, { resolve, reject })

      const msg = JSON.stringify({ id, command, args }) + '\n'
      this.process.stdin.write(msg)

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          const secs = Math.round(ms / 1000)
          reject(new Error(`Timeout: command "${command}" did not respond in ${secs}s`))
        }
      }, ms)
    })
  }

  stop(): void {
    this.process?.kill()
    this.process = null
  }
}
