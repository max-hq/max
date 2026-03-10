import { LazyX } from '@max/core'
import { command, constant } from '@optique/core/primitives'
import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import * as nodePath from 'node:path'
import * as fs from 'node:fs'
import { CommandResult, type Command, type Inferred, type CommandOptions } from '../command.js'
import type { CliServices } from '../cli-services.js'

const AGENT_USER_PATH = nodePath.resolve(import.meta.dir, '../../../../AGENT.USER.md')

export class CmdLlmBootstrap implements Command {
  readonly name = 'llm-bootstrap'
  readonly level = 'global' as const

  constructor(private _services: CliServices<'global'>) {}

  parser = LazyX.once(() => command(
    'llm-bootstrap',
    object({ cmd: constant('llm-bootstrap') }),
    { description: message`Print LLM agent usage guide for Max` }
  ))

  async run(_args: Inferred<this>, _opts: CommandOptions) {
    return CommandResult.text(fs.readFileSync(AGENT_USER_PATH, 'utf-8'))
  }
}
