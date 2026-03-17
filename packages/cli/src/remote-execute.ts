/**
 * Remote execution shim — forwards CLI commands to a remote max node over HTTP.
 *
 * Temporary bridge until core types support wire serialization, at which point
 * the RPC transport layer (HttpTransport + proxies) will handle this transparently.
 * When that happens, delete this file and remove the intercept in main.ts.
 */

import { MaxUrl } from '@max/core'

export interface RemoteResult {
  stdout: string
  stderr: string | null
  exitCode: number
  completions?: string[]
}

/**
 * If argv contains -t pointing to a remote max node, execute the command
 * on the remote server via HTTP and return the result. Returns null if
 * the target is local (normal CLI flow should proceed).
 */
export async function tryRemoteExecute(
  argv: readonly string[],
  opts?: { kind?: string; shell?: string },
): Promise<RemoteResult | null> {
  // Extract -t value
  let targetInput: string | undefined
  let targetIdx = -1
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '-t' || argv[i] === '--target') && i + 1 < argv.length) {
      targetInput = argv[i + 1]
      targetIdx = i
      break
    }
  }

  if (!targetInput) return null
  if (!targetInput.startsWith('max://') && !targetInput.startsWith('max+http://')) return null

  let url: MaxUrl
  try {
    url = MaxUrl.parse(targetInput)
  } catch {
    return null // let normal CLI handle the parse error
  }

  if (url.isLocal) return null

  // Build the HTTP URL from the MaxUrl scheme + host
  const httpScheme = url.scheme === 'max+http' ? 'http' : 'https'
  const baseUrl = `${httpScheme}://${url.host}`

  // Strip -t and its value from argv — the server handles targeting internally
  const remoteArgv = [...argv.slice(0, targetIdx), ...argv.slice(targetIdx + 2)]

  try {
    const res = await fetch(`${baseUrl}/cli`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        argv: remoteArgv,
        installation: url.installation,
        kind: opts?.kind ?? 'run',
        shell: opts?.shell,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { stdout: '', stderr: `Remote error (${res.status}): ${text}\n`, exitCode: 1 }
    }

    return await res.json() as RemoteResult
  } catch (err: any) {
    return {
      stdout: '',
      stderr: `Failed to connect to ${baseUrl}: ${err.message ?? err}\n`,
      exitCode: 1,
    }
  }
}
