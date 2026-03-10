/**
 * Named Sink implementations for the CLI.
 */

import type { Sink } from '@max/core'
import type { PromptableSocket } from './prompter.js'

/** Writes to process.stdout, swallowing EPIPE (e.g. piping to `head`). */
export class StdoutSink implements Sink {
  broken = false
  private _drainResolve: (() => void) | null = null

  constructor() {
    // Bun surfaces broken pipes as an error event on stdout rather than
    // throwing synchronously or sending SIGPIPE.
    process.stdout.on('error', (e: any) => {
      if (e?.code === 'EPIPE') {
        this.broken = true
        this._drainResolve?.()
      }
    })
    process.stdout.on('drain', () => {
      this._drainResolve?.()
    })
  }

  write(text: string): void {
    if (this.broken) return
    try {
      const ok = process.stdout.write(text)
      if (!ok) this._needsDrain = true
    }
    catch (e: any) {
      if (e?.code === 'EPIPE') { this.broken = true; return }
      throw e
    }
  }

  private _needsDrain = false

  /** Yield to event loop if backpressured. EPIPE also resolves this. */
  async drain(): Promise<void> {
    if (!this._needsDrain) return
    await new Promise<void>(resolve => {
      this._drainResolve = resolve
    })
    this._drainResolve = null
    this._needsDrain = false
  }
}

/** Writes to a daemon socket via `{ kind: "write" }` IPC messages. */
export class SocketSink implements Sink {
  broken = false
  private _drainResolve: (() => void) | null = null

  constructor(private socket: PromptableSocket) {}

  write(text: string): void {
    if (this.broken) return
    this.socket.send({ kind: 'write', text })
  }

  /** Mark sink as broken and unblock any pending drain. Called by socket close handler. */
  close(): void {
    this.broken = true
    this._drainResolve?.()
  }

  /** Yield to macrotask queue so socket close events can propagate. */
  async drain(): Promise<void> {
    await new Promise<void>(resolve => {
      this._drainResolve = resolve
      // Resolve on next macrotask tick if not broken sooner
      setTimeout(resolve, 0)
    })
    this._drainResolve = null
  }
}
