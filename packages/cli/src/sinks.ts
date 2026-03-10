/**
 * Named Sink implementations for the CLI.
 */

import type { Sink } from '@max/core'
import type { PromptableSocket } from './prompter.js'

/** Writes to process.stdout, swallowing EPIPE (e.g. piping to `head`). */
export class StdoutSink implements Sink {
  write(text: string): void {
    try { process.stdout.write(text) }
    catch (e: any) { if (e?.code !== 'EPIPE') throw e }
  }
}

/** Writes to a daemon socket via `{ kind: "write" }` IPC messages. */
export class SocketSink implements Sink {
  constructor(private socket: PromptableSocket) {}
  write(text: string): void {
    this.socket.send({ kind: 'write', text })
  }
}
