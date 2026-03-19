import { LazyX } from '@max/core'
import { argument, command, constant, option } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { optional } from '@optique/core/modifiers'
import { string } from '@optique/core/valueparser'
import { message, text } from '@optique/core/message'
import type { ValueParser, ValueParserResult } from '@optique/core/valueparser'
import type { Suggestion } from '@optique/core/parser'
import { ErrInstallationNotFound, type InstallationClient } from '@max/federation'
import type { SyncId, SyncObserver } from '@max/execution'
import { CommandResult, type Command, type CommandOptions, type Inferred } from '../../command.js'
import type { CliServices } from '../../cli-services.js'
import type { Prompter } from '../../prompter.js'
import { SyncProgressRenderer } from './sync-progress-renderer.js'

// ============================================================================
// Sync ID value parser
// ============================================================================

/** Plain SYNC_ID parser - no completions (used at workspace level). */
const syncIdVP: ValueParser<'sync', string> = { ...string(), metavar: 'SYNC_ID' }

/** SYNC_ID parser with completions from the sync store. */
function syncIdCompleter(installation: InstallationClient): ValueParser<'async', string> {
  return {
    $mode: 'async',
    metavar: 'SYNC_ID',
    async parse(input: string): Promise<ValueParserResult<string>> {
      return { success: true, value: input }
    },
    format(value: string): string {
      return value
    },
    async *suggest(): AsyncGenerator<Suggestion> {
      const syncs = await installation.syncStore?.list()
      if (syncs) {
        for (const sync of syncs) {
          yield {
            kind: 'literal',
            text: sync.id,
            description: message`${text(sync.status)} - ${text(sync.startedAt.toISOString())}`,
          }
        }
      }
    },
  }
}

// ============================================================================
// Commands
// ============================================================================

export class CmdSyncWorkspace implements Command {
  readonly name = 'sync'
  readonly level = 'workspace' as const

  constructor(private services: CliServices<'workspace'>) {}

  parser = LazyX.once(() =>
    command(
      'sync',
      object({
        cmd: constant('sync'),
        installation: argument(this.services.completers.installationName, {
          description: message`Installation to sync`,
        }),
        resume: optional(option('--resume', syncIdVP, {
          description: message`Resume a previous sync by ID`,
        })),
      }),
      { description: message`Sync data from a connected source` }
    )
  )

  async run(args: Inferred<this>, opts: CommandOptions) {
    const installations = await this.services.ctx.workspace.listInstallations()
    const match = installations.find((i) => i.name === args.installation)
    if (!match) {
      throw ErrInstallationNotFound.create({
        installation: args.installation,
      })
    }
    const inst = this.services.ctx.workspace.installation(match.id)
    if (args.resume) {
      return resumeSync(inst, args.resume as SyncId, opts.prompter)
    }
    return runSync(inst, opts.prompter)
  }
}

export class CmdSyncInstallation implements Command {
  readonly name = 'sync'
  readonly level = 'installation' as const

  constructor(private services: CliServices<'installation'>) {}

  parser = LazyX.once(() =>
    command(
      'sync',
      object({
        cmd: constant('sync'),
        resume: optional(option('--resume', syncIdCompleter(this.services.ctx.installation), {
          description: message`Resume a previous sync by ID`,
        })),
      }),
      { description: message`Sync data from this installation` }
    )
  )

  async run(args: Inferred<this>, opts: CommandOptions) {
    if (args.resume) {
      return resumeSync(this.services.ctx.installation, args.resume as SyncId, opts.prompter)
    }
    return runSync(this.services.ctx.installation, opts.prompter)
  }
}

// ============================================================================
// Sync runner with live progress
// ============================================================================

async function runSync(installation: InstallationClient, prompter?: Prompter): Promise<CommandResult> {
  const renderer = prompter ? new SyncProgressRenderer(prompter) : undefined
  const observer: SyncObserver | undefined = renderer
    ? { onEvent: (e) => renderer.onEvent(e) }
    : undefined

  const handle = await installation.sync({ observer })
  const result = await handle.completion()

  renderer?.finish()

  const lines = [
    `Sync ${result.status} in ${result.duration}ms`,
    `  Tasks completed: ${result.tasksCompleted}`,
    `  Tasks failed:    ${result.tasksFailed}`,
  ]
  return CommandResult.printText(lines.join('\n'))
}

async function resumeSync(installation: InstallationClient, syncId: SyncId, prompter?: Prompter): Promise<CommandResult> {
  const renderer = prompter ? new SyncProgressRenderer(prompter) : undefined
  const observer: SyncObserver | undefined = renderer
    ? { onEvent: (e) => renderer.onEvent(e) }
    : undefined

  const handle = await installation.syncResume(syncId, { observer })
  const result = await handle.completion()

  renderer?.finish()

  const lines = [
    `Sync resumed ${result.status} in ${result.duration}ms`,
    `  Tasks completed: ${result.tasksCompleted}`,
    `  Tasks failed:    ${result.tasksFailed}`,
  ]
  return CommandResult.printText(lines.join('\n'))
}
