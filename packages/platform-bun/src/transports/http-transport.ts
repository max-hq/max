/**
 * HttpTransport — Transport implementation over HTTP.
 *
 * Each RPC request is a POST to {baseUrl}/rpc with JSON body.
 * Stateless — no persistent connection, no multiplexing needed.
 * HTTP handles concurrency natively.
 */

import { MaxError, type RpcRequest, type RpcResponse, type Transport } from '@max/core'

export class HttpTransport implements Transport {
  private readonly baseUrl: string

  static async connect(url: string) {
    return new HttpTransport(url)
  }

  constructor(baseUrl: string) {
    // Normalise: strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  async send(request: RpcRequest): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    }

    const response: RpcResponse = await res.json()

    if (response.ok) {
      return response.result
    }

    throw MaxError.reconstitute(response.error)
  }

  async close(): Promise<void> {
    // Stateless — nothing to close
  }
}
