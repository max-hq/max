import { describe, test, expect, afterEach } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { FsWorkspaceProvisioner } from '../services/fs-workspace-provisioner.js'
import { FsInstallationProvisioner } from '../services/fs-installation-provisioner.js'

const tmpDirs: string[] = []
function tmpDir() {
  const dir = fs.mkdtempSync('/tmp/max-prov-test-')
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tmpDirs.length = 0
})

// ---------------------------------------------------------------------------
// FsWorkspaceProvisioner
// ---------------------------------------------------------------------------

describe('FsWorkspaceProvisioner', () => {
  const provisioner = new FsWorkspaceProvisioner()

  test('creates .max directory', () => {
    const root = tmpDir()
    provisioner.provision(root)
    expect(fs.existsSync(path.join(root, '.max'))).toBe(true)
  })

  test('creates max.json if missing', () => {
    const root = tmpDir()
    provisioner.provision(root)
    const content = fs.readFileSync(path.join(root, 'max.json'), 'utf-8')
    expect(JSON.parse(content)).toEqual({})
  })

  test('does not overwrite existing max.json', () => {
    const root = tmpDir()
    const existing = JSON.stringify({ installations: { foo: {} } }, null, 2)
    fs.writeFileSync(path.join(root, 'max.json'), existing)

    provisioner.provision(root)

    const content = fs.readFileSync(path.join(root, 'max.json'), 'utf-8')
    expect(content).toBe(existing)
  })

  test('creates .gitignore with .max entry', () => {
    const root = tmpDir()
    provisioner.provision(root)
    const content = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8')
    expect(content).toBe('.max\n')
  })

  test('appends .max to existing .gitignore', () => {
    const root = tmpDir()
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n')

    provisioner.provision(root)

    const content = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8')
    expect(content).toBe('node_modules\n.max\n')
  })

  test('appends newline before .max if existing .gitignore lacks trailing newline', () => {
    const root = tmpDir()
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules')

    provisioner.provision(root)

    const content = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8')
    expect(content).toBe('node_modules\n.max\n')
  })

  test('does not duplicate .max in .gitignore', () => {
    const root = tmpDir()
    fs.writeFileSync(path.join(root, '.gitignore'), '.max\nnode_modules\n')

    provisioner.provision(root)

    const content = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8')
    expect(content).toBe('.max\nnode_modules\n')
  })

  test('is idempotent - calling twice produces same result', () => {
    const root = tmpDir()
    provisioner.provision(root)
    provisioner.provision(root)

    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8')
    expect(gitignore).toBe('.max\n')
    expect(fs.existsSync(path.join(root, '.max'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// FsInstallationProvisioner
// ---------------------------------------------------------------------------

describe('FsInstallationProvisioner', () => {
  const provisioner = new FsInstallationProvisioner()

  test('creates data directory', () => {
    const root = tmpDir()
    const dataDir = path.join(root, '.max', 'installations', 'test-inst')

    provisioner.provision(dataDir)

    expect(fs.existsSync(dataDir)).toBe(true)
  })

  test('creates nested directories recursively', () => {
    const root = tmpDir()
    const dataDir = path.join(root, 'a', 'b', 'c')

    provisioner.provision(dataDir)

    expect(fs.existsSync(dataDir)).toBe(true)
  })

  test('is idempotent - no error if directory exists', () => {
    const root = tmpDir()
    const dataDir = path.join(root, 'data')

    provisioner.provision(dataDir)
    provisioner.provision(dataDir)

    expect(fs.existsSync(dataDir)).toBe(true)
  })
})
