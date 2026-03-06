/**
 * CLI - The dispatch engine.
 *
 * Uses a two-phase gate pattern: peekTarget() resolves the target level
 * from -t before optique runs, then buildParser() constructs a level-
 * filtered parser from the full set of commands.
 *
 * Help, completion, and error formatting are handled here (not by
 * optique's facade) so we have full control over the user experience.
 *
 * The harness (process argv parsing, daemon mode, socket server) lives
 * in main.ts. This file is pure logic, no process-level side effects.
 */

import { GlobalMax } from '@max/federation'
import { BunPlatform, GlobalConfig } from '@max/platform-bun'

import * as Completion from '@optique/core/completion'
import { ShellCompletion } from '@optique/core/completion'
import { or, object } from '@optique/core/constructs'
import { option } from '@optique/core/primitives'
import { optional } from '@optique/core/modifiers'
import { Mode, Parser, getDocPageAsync, suggestAsync, type Suggestion } from '@optique/core/parser'
import { formatDocPage } from '@optique/core/doc'

import { Fmt, makeLazy, MaxError, type MaxUrlLevel } from '@max/core'
import { CliRequest, CliResponse } from './types.js'
import { parseArgs, extractErrorValue, formatMessage } from './argv-parser.js'
import { type Prompter } from './prompter.js'
import { type ContextAt, type ResolvedContext } from './resolved-context.js'
import { normalizeGlobalFlag } from './resolve-context.js'
import { peekTarget } from './gate.js'
import { CliServices } from './cli-services.js'
import { createTargetValueParser } from './parsers/target-value-parser.js'

import { CmdInit } from './commands/init-command.js'
import { CmdConnect } from './commands/connect-command.js'
import { CmdSchemaInstallation, CmdSchemaWorkspace } from './commands/schema-command.js'
import { CmdSyncInstallation, CmdSyncWorkspace } from './commands/sync-command/sync-command.js'
import { CmdDaemon } from './commands/daemon-command.js'
import { CmdLsGlobal, CmdLsWorkspace } from './commands/ls-command.js'
import { CmdStatusGlobal, CmdStatusWorkspace, CmdStatusInstallation } from './commands/status-command.js'
import { CmdSearchGlobal, CmdSearchInstallation, CmdSearchWorkspace } from './commands/search-command.js'
import { CmdLlmBootstrap } from './commands/llm-bootstrap-command.js'
import { CmdInstall } from './commands/install-command.js'
import { Command } from './command.js'

// ============================================================================
// Shell completion codecs
// ============================================================================

const shells: Record<string, ShellCompletion> = {
  zsh: Completion.zsh,
  bash: Completion.bash,
  fish: Completion.fish,
}

// ============================================================================
// Helpers
// ============================================================================

/** suggestAsync expects a non-empty tuple; this bridges the length guard. */
function asNonEmptyArgv(argv: readonly string[]): [string, ...string[]] {
  return (argv.length > 0 ? argv : ['']) as [string, ...string[]]
}

/** Check if argv contains a command name (positional arg not consumed by -t). */
function hasCommand(argv: readonly string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-t' || argv[i] === '--target') { i++; continue }
    if (!argv[i].startsWith('-')) return true
  }
  return false
}

/** Normalize Command.level to an array. */
function levelsOf(cmd: Command): readonly MaxUrlLevel[] {
  return Array.isArray(cmd.level) ? cmd.level : [cmd.level as MaxUrlLevel]
}

/** Build a map from command name → all levels that name is available at. */
function buildCommandLevelMap(commands: readonly Command[]): Map<string, MaxUrlLevel[]> {
  const map = new Map<string, MaxUrlLevel[]>()
  for (const cmd of commands) {
    const existing = map.get(cmd.name) ?? []
    const combined = new Set([...existing, ...levelsOf(cmd)])
    map.set(cmd.name, [...combined])
  }
  return map
}

function scopeHint(command: string, levels: readonly MaxUrlLevel[]): string {
  if (levels.length === 1) {
    switch (levels[0]) {
      case 'global':       return `Try: max -g ${command}`
      case 'workspace':    return `Try: max -t <workspace> ${command}`
      case 'installation': return `Try: max -t <workspace>/<installation> ${command}`
    }
  }
  const labels = levels.map(l => {
    switch (l) {
      case 'global':       return 'global (max -g)'
      case 'workspace':    return 'workspace (max -t <workspace>)'
      case 'installation': return 'installation (max -t <ws>/<inst>)'
    }
  })
  return `Available at: ${labels.join(', ')}`
}

// ============================================================================
// CLI
// ============================================================================

export interface CliOptions {
  /** Pre-built GlobalMax - skips creation and start. Used for testing. */
  globalMax?: GlobalMax
}

export class CLI {
  constructor(
    public cfg: GlobalConfig,
    private opts?: CliOptions,
  ) {}

  lazy = makeLazy({
    globalUnstarted: (): GlobalMax =>
      this.opts?.globalMax ?? BunPlatform.createGlobalMax(),
    globalStarted: async (): Promise<GlobalMax> => {
      if (this.opts?.globalMax) return this.opts.globalMax
      const max = this.lazy.globalUnstarted
      await max.start()
      return max
    },
  })

  private encodeSuggestions(req: CliRequest, suggestions: readonly Suggestion[]): CliResponse {
    const shell = req.shell && shells[req.shell]
    if (shell) {
      const chunks: string[] = []
      // There's a bug in the encoder that fails to treat max:// urls as atomic. Escaping the :// parts is necessary:
      const preEncoded = suggestions.map(preEncodeSuggestion)
      for (const chunk of shell.encodeSuggestions(preEncoded)) {
        chunks.push(chunk)
      }
      return { exitCode: 0, completionOutput: chunks.join('\n') }
    }else{
      const completions = suggestions.filter((s) => s.kind === 'literal').map((s) => s.text)
      return { exitCode: 0, completions }
    }

  }

  private async suggest(
    req: CliRequest,
    program: Parser<Mode>,
  ): Promise<CliResponse> {
    try {
      const normalized = normalizeGlobalFlag(req.argv)
      const args = asNonEmptyArgv(normalized)
      const suggestions = await suggestAsync(program, args)
      return this.encodeSuggestions(req, suggestions)
    } catch (error) {
      return { exitCode: 1, stderr: String(error), completionOutput: '' }
    }
  }

  // -- Command construction --------------------------------------------------

  /**
   * Build every command instance. Services are typed as `any` because we
   * need instances for metadata (name, level) even when the context level
   * doesn't match. Commands are only *executed* after level validation.
   */
  private buildAllCommands(
    services: CliServices<any>,
    targetVP: ReturnType<typeof createTargetValueParser>,
  ): Command[] {
    return [
      new CmdInit(services),
      new CmdInstall(services),
      new CmdConnect(services),
      new CmdDaemon(services),
      new CmdSchemaWorkspace(services),
      new CmdSchemaInstallation(services),
      new CmdSyncWorkspace(services),
      new CmdSyncInstallation(services),
      new CmdSearchGlobal(services, targetVP),
      new CmdSearchWorkspace(services),
      new CmdSearchInstallation(services),
      new CmdLsGlobal(services),
      new CmdLsWorkspace(services),
      new CmdStatusGlobal(services),
      new CmdStatusWorkspace(services),
      new CmdStatusInstallation(services),
      new CmdLlmBootstrap(services),
    ]
  }

  // -- Parser builder --------------------------------------------------------

  private buildParser(
    allCommands: readonly Command[],
    level: MaxUrlLevel,
    targetVP: ReturnType<typeof createTargetValueParser>,
  ): { program: Parser<Mode>; commands: Record<string, Command> } {
    // Filter to commands available at this level
    const levelCommands = allCommands.filter(cmd =>
      (levelsOf(cmd) as readonly string[]).includes(level)
    )

    // Build dispatch map (name → Command)
    const commands: Record<string, Command> = {}
    for (const cmd of levelCommands) {
      commands[cmd.name] = cmd
    }

    // Build parser from level-appropriate commands
    const buildProgram = (commandParser: Parser<Mode>) =>
      object({ target: optional(option('-t', '--target', targetVP)), command: commandParser })

    const program = buildProgram(
      or(...levelCommands.map(c => c.parser.get))
    )

    return { program, commands }
  }

  // -- Help generation -------------------------------------------------------

  private async generateHelp(
    program: Parser<Mode>,
    color: boolean,
    forCommand?: string,
  ): Promise<CliResponse> {
    const args = forCommand ? [forCommand] : undefined
    const doc = await getDocPageAsync(program, args)
    if (doc) {
      const text = formatDocPage('max', doc, { colors: color, showChoices: true })
      return { exitCode: 0, stdout: text + '\n' }
    }
    return { exitCode: 0, stdout: 'max - a data pipe CLI\n' }
  }

  // -- Completion subcommand -------------------------------------------------

  private async handleCompletion(
    program: Parser<Mode>,
    shell: string,
    args: string[],
  ): Promise<CliResponse> {
    const shellCodec = shells[shell]
    if (!shellCodec) {
      return { exitCode: 1, stderr: `Unknown shell: ${shell}. Supported: ${Object.keys(shells).join(', ')}\n` }
    }

    // No extra args → generate the shell setup script
    if (args.length === 0) {
      const script = shellCodec.generateScript('max')
      return { exitCode: 0, stdout: script }
    }

    // With args → inline completion (shell calling back for suggestions)
    try {
      const suggestions = await suggestAsync(program, asNonEmptyArgv(args))
      const preEncoded = suggestions.map(preEncodeSuggestion)
      const chunks: string[] = []
      for (const chunk of shellCodec.encodeSuggestions(preEncoded)) {
        chunks.push(chunk)
      }
      return { exitCode: 0, stdout: chunks.join('\n') }
    } catch {
      return { exitCode: 1, stderr: '' }
    }
  }

  // -- Error formatting ------------------------------------------------------

  private formatParseError(
    errorToken: string | undefined,
    level: MaxUrlLevel,
    commandLevels: Map<string, MaxUrlLevel[]>,
    color: boolean,
    optiqError: string,
  ): CliResponse {
    const fmt = Fmt.usingColor(color)

    // Check if the token is a known command at another level
    if (errorToken) {
      const levels = commandLevels.get(errorToken)
      if (levels && !levels.includes(level)) {
        const lines = [
          `${fmt.red('Error')}: ${fmt.bold(errorToken)} is not available at the ${level} level.`,
          `  ${scopeHint(errorToken, levels)}`,
          '',
        ]
        return { exitCode: 1, stderr: lines.join('\n') }
      }

      if (!levels) {
        // Completely unknown command
        const available = [...commandLevels.entries()]
          .filter(([, lvls]) => lvls.includes(level))
          .map(([name]) => name)
        const lines = [
          `${fmt.red('Error')}: Unknown command ${fmt.bold(errorToken)}.`,
          `  Available commands: ${available.join(', ')}`,
          `  Run ${fmt.bold('max -h')} for help.`,
          '',
        ]
        return { exitCode: 1, stderr: lines.join('\n') }
      }
    }

    // Known command at correct level but bad args — show optique's error
    return { exitCode: 1, stderr: `${fmt.red('Error')}: ${optiqError}\n` }
  }

  // -- Dispatch --------------------------------------------------------------

  async execute(req: CliRequest, prompter?: Prompter): Promise<CliResponse> {
    const color = req.color ?? this.cfg.useColor ?? true
    const cwd = req.cwd ?? this.cfg.cwd
    const globalMax = await this.lazy.globalStarted

    // Normalize: -g -> -t @, bare `max` -> `max status`
    let argv = normalizeGlobalFlag(req.argv)
    if (!hasCommand(argv)) {
      // Check for bare -h/--help (no command)
      if (argv.includes('-h') || argv.includes('--help')) {
        // Need to build a parser at the resolved level for help generation
        const ctx = await peekTarget(globalMax.maxUrlResolver, cwd, argv)
        const targetVP = createTargetValueParser(globalMax, cwd)
        const services = new CliServices(ctx as ContextAt<any>, color)
        const allCommands = this.buildAllCommands(services, targetVP)
        const { program } = this.buildParser(allCommands, ctx.level, targetVP)
        return this.generateHelp(program, color)
      }
      const tIdx = argv.indexOf('-t')
      const insertAt = (tIdx >= 0 && tIdx + 1 < argv.length) ? tIdx + 2 : 0
      argv = [...argv.slice(0, insertAt), 'status', ...argv.slice(insertAt)]
    }

    // Resolve target (global/workspace/installation) before parser runs
    const ctx = await peekTarget(globalMax.maxUrlResolver, cwd, argv)

    // Build all commands and the level-specific parser
    const targetVP = createTargetValueParser(globalMax, cwd)
    const services = new CliServices(ctx as ContextAt<any>, color)
    const allCommands = this.buildAllCommands(services, targetVP)
    const commandLevels = buildCommandLevelMap(allCommands)
    const { program, commands } = this.buildParser(allCommands, ctx.level, targetVP)

    // -- Shell completion (req.kind === 'complete') --
    if (req.kind === 'complete') {
      return this.suggest(req, program)
    }

    // -- Help: -h/--help with a command --
    if (argv.includes('-h') || argv.includes('--help')) {
      const stripped = argv.filter(a => a !== '-h' && a !== '--help')
      const cmdName = stripped.find((a, i) => {
        if (a.startsWith('-')) return false
        if (i > 0 && (stripped[i-1] === '-t' || stripped[i-1] === '--target')) return false
        return true
      })
      return this.generateHelp(program, color, cmdName)
    }

    // -- Help: `help` subcommand --
    if (argv[0] === 'help' || (argv.length >= 3 && argv[2] === 'help')) {
      // Find the command name after 'help', skipping -t <value>
      const afterHelp = argv.slice(argv.indexOf('help') + 1)
      const forCommand = afterHelp.find(a => !a.startsWith('-'))
      return this.generateHelp(program, color, forCommand)
    }

    // -- Completion subcommand: `max completion <shell> [args...]` --
    if (argv[0] === 'completion' || (argv.length >= 3 && argv[2] === 'completion')) {
      const compIdx = argv.indexOf('completion')
      const rest = argv.slice(compIdx + 1)
      const shell = rest[0]
      if (shell) {
        return this.handleCompletion(program, shell, rest.slice(1) as string[])
      }
    }

    // -- Parse --
    const parsed = await parseArgs(program, argv)

    if (!parsed.ok) {
      const errorToken = extractErrorValue(parsed.error)
      const errorText = formatMessage(parsed.error, { colors: color })
      return this.formatParseError(errorToken, ctx.level, commandLevels, color, errorText)
    }

    const { command: cmdResult } = parsed.value as { command: { cmd: string } }

    // Execute
    const command = commands[cmdResult.cmd]
    try {
      const result = await command.run(cmdResult, { cwd, color, prompter })
      return { exitCode: 0, stdout: result + '\n' }
    } catch (e) {
      return { exitCode: 1, stderr: MaxError.wrap(e).prettyPrint({ color }) }
    }
  }
}

const slashEscape = (str:string) => str.replaceAll(/[:/]/g, c => `\\${c}`)
const preEncodeSuggestion = (suggestion: Suggestion):Suggestion => suggestion.kind === 'literal'
  ? {...suggestion, text: slashEscape(suggestion.text)}
  : suggestion
