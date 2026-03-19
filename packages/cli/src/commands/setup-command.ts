import * as fs from 'node:fs'
import * as nodePath from 'node:path'
import * as os from 'node:os'
import { execSync } from 'node:child_process'
import * as readline from 'node:readline'
import * as Completion from '@optique/core/completion'
import type { ShellCompletion } from '@optique/core/completion'
import { Fmt, type Sink } from '@max/core'
import type { ExecuteResult } from '../types.js'

const shells: Record<string, ShellCompletion> = {
  zsh: Completion.zsh,
  bash: Completion.bash,
  fish: Completion.fish,
  nu: Completion.nu,
  pwsh: Completion.pwsh,
}

const rcFiles: Record<string, string> = {
  zsh: '.zshrc',
  bash: '.bashrc',
  fish: '.config/fish/config.fish',
}

function detectShell(): string | null {
  const shellPath = process.env.SHELL
  if (shellPath) {
    const name = nodePath.basename(shellPath)
    if (name in rcFiles) return name
  }

  try {
    const user = os.userInfo().username
    const passwd = fs.readFileSync('/etc/passwd', 'utf-8')
    const line = passwd.split('\n').find(l => l.startsWith(user + ':'))
    if (line) {
      const loginShell = nodePath.basename(line.split(':').pop()?.trim() || '')
      if (loginShell in rcFiles) return loginShell
    }
  } catch { /* not available */ }

  for (const name of ['zsh', 'bash', 'fish']) {
    try {
      execSync(`command -v ${name}`, { stdio: 'ignore' })
      return name
    } catch { /* not found */ }
  }

  return null
}

function ensureInRcFile(rcFile: string, marker: string, block: string): boolean {
  const content = fs.existsSync(rcFile) ? fs.readFileSync(rcFile, 'utf-8') : ''
  if (content.includes(marker)) return false
  fs.appendFileSync(rcFile, `\n${block}\n`)
  return true
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/** Source cargo env prefix for execSync - picks up freshly installed rust */
function cargoEnvPrefix(): string {
  const cargoEnv = nodePath.join(os.homedir(), '.cargo/env')
  return fs.existsSync(cargoEnv) ? `. "${cargoEnv}" && ` : ''
}

async function checkRust(sink: Sink, fmt: ReturnType<typeof Fmt.usingColor>, manualSteps: string[]): Promise<string[]> {
  const lines: string[] = []

  let version: string | null = null
  let minor = 0
  try {
    version = execSync(`${cargoEnvPrefix()}rustc --version 2>/dev/null`, { encoding: 'utf-8', shell: '/bin/sh' }).trim()
    minor = parseInt(version.split(' ')[1]?.split('.')[1] ?? '0', 10)
  } catch { /* not installed */ }

  if (!version) {
    lines.push(`${fmt.yellow('!')} Rust not found - max will run in direct mode (slower)`)
    const reply = await prompt('Install rust via rustup? [y/N] ')
    if (reply === 'y' || reply === 'Y') {
      try {
        execSync('curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh', {
          stdio: 'inherit',
          shell: '/bin/sh',
        })
        lines.push(`${fmt.green('✓')} Rust installed`)
        manualSteps.push('. "$HOME/.cargo/env"')
      } catch {
        lines.push(`${fmt.yellow('!')} Rust installation failed`)
      }
    }
  } else if (minor < 68) {
    sink.write(`${fmt.yellow('!')} Found ${version}, but max requires rustc 1.68 or newer.\n`)
    const hasRustup = (() => { try { execSync('command -v rustup', { stdio: 'ignore' }); return true } catch { return false } })()
    if (hasRustup) {
      const reply = await prompt('  Update to latest stable via rustup? [y/N] ')
      if (reply === 'y' || reply === 'Y') {
        try {
          execSync('rustup update stable', { stdio: 'inherit' })
          lines.push(`${fmt.green('✓')} Rust updated`)
          manualSteps.push('. "$HOME/.cargo/env"')
        } catch {
          lines.push(`${fmt.yellow('!')} Rust update failed`)
        }
      }
    } else {
      sink.write(`  Your system rust is too old and isn't managed by rustup.\n`)
      const reply = await prompt('  Install rustup to manage rust versions? [y/N] ')
      if (reply === 'y' || reply === 'Y') {
        try {
          execSync('curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh', {
            stdio: 'inherit',
            shell: '/bin/sh',
          })
          lines.push(`${fmt.green('✓')} Rust installed via rustup`)
          manualSteps.push('. "$HOME/.cargo/env"')
        } catch {
          lines.push(`${fmt.yellow('!')} Rust installation failed`)
        }
      }
    }
  } else {
    lines.push(`${fmt.green('✓')} Rust: ${version}`)
  }

  return lines
}

async function buildRustProxy(sink: Sink, fmt: ReturnType<typeof Fmt.usingColor>): Promise<void> {
  const repoRoot = nodePath.resolve(import.meta.dirname, '../../../../')
  const proxyDir = nodePath.join(repoRoot, 'packages/cli/rust-proxy')
  const binary = nodePath.join(proxyDir, 'target/release/max')

  if (fs.existsSync(binary)) return

  const prefix = cargoEnvPrefix()
  try {
    execSync(`${prefix}command -v cargo`, { stdio: 'ignore', shell: '/bin/sh' })
  } catch {
    return
  }

  sink.write('Building max CLI...\n')
  try {
    execSync(`${prefix}cargo build --release`, { cwd: proxyDir, stdio: 'inherit', shell: '/bin/sh' })
    sink.write(`${fmt.green('✓')} CLI built\n`)
  } catch {
    sink.write(`${fmt.yellow('!')} CLI build failed - max will run in direct mode (slower)\n`)
  }
}

export async function handleSetup(sink: Sink, color: boolean): Promise<ExecuteResult> {
  const fmt = Fmt.usingColor(color)
  const home = os.homedir()
  const lines: string[] = []
  const manualSteps: string[] = []

  const shellName = detectShell()
  const binDir = nodePath.join(home, '.local/bin')

  // -- Bun PATH: check if bun is reachable without our exports --
  const bunDir = nodePath.join(home, '.bun/bin')
  if (fs.existsSync(nodePath.join(bunDir, 'bun'))) {
    const pathDirs = (process.env.PATH || '').split(':')
    if (!pathDirs.includes(bunDir)) {
      manualSteps.push(`export PATH="$HOME/.bun/bin:$PATH"`)
    }
  }

  if (shellName) {
    const rcFile = nodePath.join(home, rcFiles[shellName])

    // -- PATH --
    const pathAdded = ensureInRcFile(
      rcFile,
      '# max PATH',
      shellName === 'fish'
        ? `# max PATH\nfish_add_path ${binDir}`
        : `# max PATH\nexport PATH="$HOME/.local/bin:$PATH"`,
    )
    if (pathAdded) {
      lines.push(`${fmt.green('✓')} Added ~/.local/bin to PATH in ${rcFile}`)
      if (shellName === 'fish') {
        manualSteps.push(`fish_add_path ${binDir}`)
      } else {
        manualSteps.push(`export PATH="$HOME/.local/bin:$PATH"`)
      }
    }

    // -- Completions --
    const codec = shells[shellName]
    if (codec) {
      const script = codec.generateScript('max', ['completion', shellName])

      let completionFile: string
      if (shellName === 'fish') {
        completionFile = nodePath.join(home, '.config/fish/completions/max.fish')
      } else {
        completionFile = nodePath.join(home, '.max/completions', shellName === 'zsh' ? '_max' : `max.${shellName}`)
      }

      fs.mkdirSync(nodePath.dirname(completionFile), { recursive: true })
      fs.writeFileSync(completionFile, script)
      lines.push(`${fmt.green('✓')} Completions installed for ${shellName}`)

      if (shellName !== 'fish') {
        const sourceLine = `[ -f "${completionFile}" ] && source "${completionFile}"`
        const added = ensureInRcFile(
          rcFile,
          '# max shell completions',
          `# max shell completions\n${sourceLine}`,
        )
        if (added) {
          lines.push(`${fmt.green('✓')} Added completion source to ${rcFile}`)
          manualSteps.push(`source "${completionFile}"`)
        } else {
          lines.push(`  Completions already sourced in ${rcFile}`)
        }
      }
    }
  } else {
    lines.push(`${fmt.yellow('!')} Could not detect shell (SHELL=${process.env.SHELL || 'unset'})`)
    lines.push(`  Run 'max completion <shell>' manually`)
    lines.push(`  Supported: ${Object.keys(shells).join(', ')}`)
  }

  // -- Rust check + build proxy --
  lines.push(...await checkRust(sink, fmt, manualSteps))
  await buildRustProxy(sink, fmt)

  // -- Welcome --
  lines.push('')
  lines.push(`${fmt.green('max is ready!')} Here's what to try:`)
  lines.push('')
  lines.push(`  max -g status              Check global status`)
  lines.push(`  max init my-project        Create a new workspace`)
  lines.push(`  max llm-bootstrap          Teach your AI agent about max`)
  lines.push('')

  if (manualSteps.length > 0) {
    lines.push(fmt.yellow(fmt.underline('Restart your shell to apply changes.')))
    lines.push('')
    lines.push('Or, apply them to your current session:')
    lines.push('')
    for (const step of manualSteps) {
      lines.push(`  ${step}`)
    }
  }

  lines.push('')
  lines.push(`Docs: https://docs.max.cloud`)

  sink.write(lines.join('\n') + '\n')

  // Force exit - readline on /dev/tty can keep bun's event loop alive
  process.exit(0)
}
