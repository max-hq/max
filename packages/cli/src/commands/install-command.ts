import { LazyX, Fmt, Printable } from '@max/core'
import { command, constant, option } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { string } from '@optique/core/valueparser'
import { CollectionManager } from '@max/platform-bun'
import type { Command, Inferred, CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'
import * as os from 'node:os'
import * as path from 'node:path'

export class CmdInstall implements Command {
  readonly name = 'install'
  readonly level = 'global' as const

  constructor(private services: CliServices<'global'>) {}

  parser = LazyX.once(() => command(
    'install',
    object({
      cmd: constant('install'),
      collection: option('-c', '--collection', string(), {
        description: message`Git URL of a connector collection to install`,
      }),
    }),
    { description: message`Install a connector collection` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    const fmt = Fmt.usingColor(opts.color)
    const maxHome = path.join(os.homedir(), '.max')
    const manager = new CollectionManager(maxHome)

    const result = await manager.install(args.collection)

    const verb = result.action === 'cloned' ? 'Installed' : 'Updated'
    const lines = [
      `${fmt.green('✓')} ${verb} collection "${result.name}"`,
      `  Location: ${result.path}`,
      `  Connectors found: ${result.connectors.length}`,
    ]

    for (const c of result.connectors) {
      lines.push(`    - ${c}`)
    }

    return Printable.text(lines.join('\n'))
  }
}
