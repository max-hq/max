import { makeLazy } from '@max/core'
import { ValueParser, type ValueParserResult } from '@optique/core/valueparser'
import type { Suggestion } from '@optique/core/parser'
import { message, text } from '@optique/core/message'
import { ErrConnectorNotFound, ErrInvariant } from '@max/federation'
import { Fmt } from '@max/core'
import type { CLIAnyContext } from '../resolved-context.js'

/** Narrow ctx to a level that has a workspace client, or throw. */
function requireWorkspace(ctx: CLIAnyContext) {
  if (ctx.level === 'workspace' || ctx.level === 'installation') return ctx
  throw ErrInvariant.create({ detail: 'Completer requires workspace context' })
}

export class ProjectCompleters {
  lazy = makeLazy({

    /** Completer for connector names (sources) */
    connectorSource: (): ValueParser<'async', string> => {
      const self = this
      return {
        $mode: 'async',
        metavar: 'SOURCE',
        async parse(input: string): Promise<ValueParserResult<string>> {
          return ({ success: true, value: input })
        },
        format(value: string): string {
          return value
        },
        async *suggest(): AsyncGenerator<Suggestion> {
          const sources = await requireWorkspace(self.ctx).workspace.listConnectors()
          for (const source of sources) {
            yield { kind: 'literal', text: source.name, description: message`${source.name}` }
          }
        },
      }
    },

    /** Completer for installed connectors */
    installedConnectorSource: (): ValueParser<'async', string> => {
      const self = this
      return {
        $mode: 'async',
        metavar: 'CONNECTOR',
        async parse(input: string): Promise<ValueParserResult<string>> {
          return requireWorkspace(self.ctx).workspace.connectorSchema(input).then(
            () => ({ success: true, value: input }),
            (e): ValueParserResult<string> => {
              if (ErrConnectorNotFound.is(e)) {
                return { success: false, error: message`${e.message}` }
              } else {
                return { success: false, error: e.message }
              }
            }
          )
        },
        format(value: string): string {
          return value
        },
        async *suggest(): AsyncGenerator<Suggestion> {
          const ws = requireWorkspace(self.ctx).workspace
          const connectors = await ws.listConnectors()
          const installations = await ws.listInstallations()
          const installed = new Set(installations.map((i) => i.connector))

          for (const c of connectors) {
            if (installed.has(c.name)) {
              yield { kind: 'literal', text: c.name, description: message`${c.name}` }
            }
          }
          for (const c of connectors) {
            if (!installed.has(c.name)) {
              yield {
                kind: 'literal',
                text: c.name,
                description: message`${text(self.fmt.red('\u2717'))} no installations`,
              }
            }
          }
        },
      }
    },

    /** Completer for installation names */
    installationName: (): ValueParser<'async', string> => {
      const self = this
      return {
        $mode: 'async',
        metavar: 'NAME',
        async parse(input: string): Promise<ValueParserResult<string>> {
          return { success: true, value: input }
        },
        format(value: string): string {
          return value
        },
        async *suggest(): AsyncGenerator<Suggestion> {
          const installations = await requireWorkspace(self.ctx).workspace.listInstallations()
          for (const inst of installations) {
            yield {
              kind: 'literal',
              text: inst.name,
              description: message`${text(self.fmt.dim(inst.connector))}:${inst.name}`,
            }
          }
        },
      }
    },

    /** Completer for entity type names - scoped based on resolved context level. */
    entityTypeName: (): ValueParser<'async', string> => {
      const self = this
      return {
        $mode: 'async',
        metavar: 'ENTITY',
        async parse(input: string): Promise<ValueParserResult<string>> {
          return { success: true, value: input }
        },
        format(value: string): string {
          return value
        },
        async *suggest(): AsyncGenerator<Suggestion> {
          yield* ProjectCompleters.suggestEntityTypes(self.ctx)
        },
      }
    },
  })

  get connectorSource() {
    return this.lazy.connectorSource
  }

  /** Connector source that prioritises connectors with installations. */
  get installedConnectorSource() {
    return this.lazy.installedConnectorSource
  }

  get installationName() {
    return this.lazy.installationName
  }

  get entityTypeName() {
    return this.lazy.entityTypeName
  }

  constructor(
    readonly ctx: CLIAnyContext,
    private fmt: Fmt,
  ) {}

  /** Yield entity type suggestions scoped to the given context level. */
  static async * suggestEntityTypes(ctx: CLIAnyContext): AsyncGenerator<Suggestion> {
    switch (ctx.level) {
      case 'installation': {
        const desc = await ctx.installation.describe()
        const schema = await ctx.installation.schema()
        for (const entityType of schema.entityTypes) {
          yield { kind: 'literal', text: entityType, description: message`${desc.connector}` }
        }
        break
      }
      case 'workspace': {
        const installations = await ctx.workspace.listInstallations()
        const connectors = new Set(installations.map(i => i.connector))
        for (const connector of connectors) {
          const schema = await ctx.workspace.connectorSchema(connector)
          for (const entityType of schema.entityTypes) {
            yield { kind: 'literal', text: entityType, description: message`${connector}` }
          }
        }
        break
      }
      // global level: no workspace context, no suggestions
    }
  }
}
