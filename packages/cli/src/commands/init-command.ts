import { LazyX, Fmt } from '@max/core'
import { argument, command, constant } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { withDefault } from '@optique/core/modifiers'
import { flag } from '@optique/core'
import { message } from '@optique/core/message'
import { string } from '@optique/core/valueparser'
import { BunPlatform, ErrCannotInitialiseProject, findProjectRoot } from '@max/platform-bun'
import { CommandResult, type Command, type Inferred, type CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'
import * as nodePath from 'node:path'

export class CmdInit implements Command {
  readonly name = 'init'
  readonly level = ['global', 'workspace'] as const

  constructor(private services: CliServices<'global'> | CliServices<'workspace'>) {}

  parser = LazyX.once(() => command(
    'init',
    object({
      cmd: constant('init'),
      force: withDefault(
        flag('-f', '--force', { description: message`Force creation of project` }),
        false
      ),
      directory: withDefault(
        argument(string(), { description: message`Directory to initialize` }),
        '.'
      ),
    }),
    { description: message`Initialize a new Max project` }
  ))

  async run(args: Inferred<this>, opts: CommandOptions) {
    const dir = nodePath.resolve(opts.cwd, args.directory)
    const existingRoot = findProjectRoot(dir)

    if (existingRoot && !args.force) {
      throw ErrCannotInitialiseProject.create(
        { maxProjectRoot: existingRoot },
        'you are already in a max project! Use `force=true` to create one here anyway.'
      )
    }

    await this.services.ctx.global.createWorkspace(nodePath.basename(dir), {
      via: BunPlatform.workspace.deploy.inProcess,
      config: { strategy: 'in-process', dataDir: nodePath.join(dir, '.max') },
      spec: { name: nodePath.basename(dir) },
    })
    const fmt = Fmt.usingColor(opts.color)
    const lines = [
      `${fmt.green('✓')} Initialized Max project in ${dir}`,
      `${fmt.green('✓')} .gitignore updated to ignore .max`,
    ]

    const connectors = await this.services.ctx.global.listConnectors()
    if (connectors.length <= 1) {
      lines.push('')
      lines.push(`${fmt.yellow('!')} You have no connectors in your global registry, you may want to install some`)
      lines.push(`  HINT: max install --collection git@github.com:max-hq/max-connectors.git`)
    }

    return CommandResult.text(lines.join('\n'))
  }
}
