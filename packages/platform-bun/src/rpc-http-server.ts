/**
 * RPC HTTP server — JSON over HTTP, wrapping a dispatcher.
 *
 * Accepts POST /rpc with JSON body (RpcRequest), dispatches through the
 * provided function, returns RpcResponse as JSON.
 *
 * Supports an optional method allowlist for public-facing nodes that
 * should only expose read operations.
 */

import { MaxError, RpcResponse, type RpcRequest } from '@max/core'

export type RpcDispatchFn = (request: RpcRequest) => Promise<RpcResponse>

export interface RpcHttpServerOptions {
  port: number
  hostname?: string
  dispatch: RpcDispatchFn
  /** If set, only these (target, method) pairs are allowed. */
  allowlist?: AllowlistEntry[]
}

export interface AllowlistEntry {
  target: string
  method: string
}

export interface RpcHttpServer {
  readonly port: number
  readonly hostname: string
  stop(): void
}

export function createRpcHttpServer(opts: RpcHttpServerOptions): RpcHttpServer {
  const { port, hostname = '0.0.0.0', dispatch, allowlist } = opts

  const allowSet = allowlist
    ? new Set(allowlist.map((e) => `${e.target}:${e.method}`))
    : null

  const server = Bun.serve({
    port,
    hostname,
    fetch: async (req) => {
      const url = new URL(req.url)

      // Health check
      if (req.method === 'GET' && url.pathname === '/health') {
        return Response.json({ ok: true })
      }

      // RPC endpoint
      if (req.method === 'POST' && url.pathname === '/rpc') {
        return handleRpc(req)
      }

      return new Response('Not Found', { status: 404 })
    },
  })

  async function handleRpc(req: Request): Promise<Response> {
    let request: RpcRequest
    try {
      request = await req.json()
    } catch {
      return Response.json(
        { error: 'Invalid JSON' },
        { status: 400 },
      )
    }

    if (!request.id || typeof request.method !== 'string') {
      return Response.json(
        { error: 'Invalid RpcRequest: missing id or method' },
        { status: 400 },
      )
    }

    // Allowlist check
    if (allowSet && !allowSet.has(`${request.target}:${request.method}`)) {
      const response = RpcResponse.error(
        request.id,
        MaxError.serialize(new Error(`Method not allowed: ${request.target}:${request.method}`)),
      )
      return Response.json(response, { status: 403 })
    }

    const response = await dispatch(request).catch(
      (err): RpcResponse => RpcResponse.error(request.id, MaxError.serialize(err)),
    )

    return Response.json(response)
  }

  return {
    port: server.port!,
    hostname: server.hostname!,
    stop() {
      server.stop()
    },
  }
}
