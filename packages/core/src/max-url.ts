/**
 * MaxUrl — Human-readable addressing for nodes in the federation hierarchy.
 *
 * Format: max://[host]/[workspace]/[installation]
 *         max+http://[host]/[workspace]/[installation]
 *
 * max:// implies HTTPS for remote hosts (production behind reverse proxy).
 * max+http:// explicitly selects HTTP (development, local testing).
 *
 * MaxUrl is identity (names). Locator is physical (sockets, containers).
 * They never contain each other.
 */

import { Scope } from './scope.js'
import { ErrInvalidMaxUrl } from './errors/errors.js'
import type { ScopeUpgradeable } from './ref.js'

export type MaxUrlLevel = 'global' | 'workspace' | 'installation'
export type MaxUrlScheme = 'max' | 'max+http'

export class MaxUrl implements ScopeUpgradeable {
  readonly scheme: MaxUrlScheme
  readonly host: string
  readonly workspace: string | undefined
  readonly installation: string | undefined
  readonly scope: Scope

  private constructor(
    scheme: MaxUrlScheme,
    host: string,
    workspace: string | undefined,
    installation: string | undefined,
    scope: Scope,
  ) {
    this.scheme = scheme
    this.host = host
    this.workspace = workspace
    this.installation = installation
    this.scope = scope
  }

  // ---- Construction ----

  static parse(input: string): MaxUrl {
    let scheme: MaxUrlScheme
    let rest: string

    if (input.startsWith('max+http://')) {
      scheme = 'max+http'
      rest = input.slice('max+http://'.length)
    } else if (input.startsWith('max://')) {
      scheme = 'max'
      rest = input.slice('max://'.length)
    } else {
      throw ErrInvalidMaxUrl.create({ url: input, reason: 'Must start with max:// or max+http://' })
    }

    const segments = rest.split('/').filter(Boolean)

    if (segments.length === 0) {
      throw ErrInvalidMaxUrl.create({ url: input, reason: 'Host segment required' })
    }
    if (segments.length > 3) {
      throw ErrInvalidMaxUrl.create({ url: input, reason: 'Max 3 segments: host/workspace/installation' })
    }

    return new MaxUrl(scheme, segments[0], segments[1], segments[2], Scope.installation())
  }

  static global(host = '@'): MaxUrl {
    return new MaxUrl('max', host, undefined, undefined, Scope.installation())
  }

  static forWorkspace(workspace: string, host = '@'): MaxUrl {
    return new MaxUrl('max', host, workspace, undefined, Scope.installation())
  }

  static forInstallation(workspace: string, installation: string, host = '@'): MaxUrl {
    return new MaxUrl('max', host, workspace, installation, Scope.installation())
  }

  // ---- Structural ----

  get level(): MaxUrlLevel {
    if (this.installation) return 'installation'
    if (this.workspace) return 'workspace'
    return 'global'
  }

  get isLocal(): boolean {
    return this.host === '@'
  }

  parent(): MaxUrl | undefined {
    if (this.installation) return new MaxUrl(this.scheme, this.host, this.workspace, undefined, this.scope)
    if (this.workspace) return new MaxUrl(this.scheme, this.host, undefined, undefined, this.scope)
    return undefined
  }

  child(segment: string): MaxUrl {
    if (!this.workspace) return new MaxUrl(this.scheme, this.host, segment, undefined, this.scope)
    if (!this.installation) return new MaxUrl(this.scheme, this.host, this.workspace, segment, this.scope)
    throw ErrInvalidMaxUrl.create({ url: this.toString(), reason: 'Cannot add child below installation' })
  }

  // ---- ScopeUpgradeable ----

  upgradeScope(newScope: Scope): MaxUrl {
    return new MaxUrl(this.scheme, this.host, this.workspace, this.installation, newScope)
  }

  // ---- Serialization ----

  toString(): string {
    let result = `${this.scheme}://${this.host}`
    if (this.workspace) result += `/${this.workspace}`
    if (this.installation) result += `/${this.installation}`
    return result
  }

  toRelative(context: MaxUrl): string {
    if (this.host !== context.host) return this.toString()
    if (this.installation && context.level === 'workspace' && this.workspace === context.workspace) {
      return this.installation
    }
    if (this.workspace && context.level === 'global') {
      if (this.installation) return `${this.workspace}/${this.installation}`
      return this.workspace
    }
    return this.toString()
  }
}
