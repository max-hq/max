import { describe, test, expect, afterEach } from 'bun:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CollectionManager } from '../services/collection-manager.js'

const tmpDirs: string[] = []
function tmpDir() {
  const dir = fs.mkdtempSync('/tmp/max-coll-test-')
  tmpDirs.push(dir)
  return dir
}

/** Create a fake collection directory with connector-* subdirs. */
function fakeCollection(root: string, connectors: string[]): string {
  const dir = path.join(root, 'my-connectors')
  fs.mkdirSync(dir)
  for (const c of connectors) {
    fs.mkdirSync(path.join(dir, c))
  }
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tmpDirs.length = 0
})

// ---------------------------------------------------------------------------
// collectionName
// ---------------------------------------------------------------------------

describe('CollectionManager.collectionName', () => {
  test('extracts name from HTTPS URL', () => {
    expect(CollectionManager.collectionName('https://github.com/org/max-connectors.git'))
      .toBe('max-connectors')
  })

  test('extracts name from SSH URL', () => {
    expect(CollectionManager.collectionName('git@github.com:org/max-connectors.git'))
      .toBe('max-connectors')
  })

  test('extracts name from local path', () => {
    expect(CollectionManager.collectionName('/Users/ben/projects/max-connectors'))
      .toBe('max-connectors')
  })

  test('strips trailing slashes', () => {
    expect(CollectionManager.collectionName('/Users/ben/projects/max-connectors/'))
      .toBe('max-connectors')
    expect(CollectionManager.collectionName('/Users/ben/projects/max-connectors///'))
      .toBe('max-connectors')
  })
})

// ---------------------------------------------------------------------------
// installLocal (via install)
// ---------------------------------------------------------------------------

describe('install (local path)', () => {
  test('creates a symlink to the source directory', async () => {
    const root = tmpDir()
    const source = fakeCollection(root, ['connector-acme'])
    const maxHome = path.join(root, 'max-home')

    const manager = new CollectionManager(maxHome)
    const result = await manager.install(source)

    expect(result.action).toBe('linked')
    expect(result.name).toBe('my-connectors')
    expect(result.connectors).toEqual(['connector-acme'])

    // Verify it's actually a symlink
    const stat = fs.lstatSync(result.path)
    expect(stat.isSymbolicLink()).toBe(true)
    expect(fs.readlinkSync(result.path)).toBe(source)
  })

  test('discovers all connector-* subdirs', async () => {
    const root = tmpDir()
    const source = fakeCollection(root, [
      'connector-acme',
      'connector-google',
      'connector-linear',
      'not-a-connector',
    ])

    const manager = new CollectionManager(path.join(root, 'max-home'))
    const result = await manager.install(source)

    expect(result.connectors.sort()).toEqual([
      'connector-acme',
      'connector-google',
      'connector-linear',
    ])
  })

  test('replaces existing symlink on re-install', async () => {
    const root = tmpDir()
    const source = fakeCollection(root, ['connector-a'])
    const maxHome = path.join(root, 'max-home')
    const manager = new CollectionManager(maxHome)

    const result1 = await manager.install(source)
    expect(result1.action).toBe('linked')

    // Add a connector to the source and re-install
    fs.mkdirSync(path.join(source, 'connector-b'))
    const result2 = await manager.install(source)

    expect(result2.action).toBe('linked')
    expect(result2.connectors.sort()).toEqual(['connector-a', 'connector-b'])

    // Still a symlink
    const stat = fs.lstatSync(result2.path)
    expect(stat.isSymbolicLink()).toBe(true)
  })

  test('replaces existing real directory with symlink', async () => {
    const root = tmpDir()
    const source = fakeCollection(root, ['connector-acme'])
    const maxHome = path.join(root, 'max-home')

    // Pre-create the collections dir with a real directory (simulates previous git clone)
    const existingDir = path.join(maxHome, 'collections', 'my-connectors')
    fs.mkdirSync(existingDir, { recursive: true })
    fs.writeFileSync(path.join(existingDir, 'marker'), 'git-clone')

    const manager = new CollectionManager(maxHome)
    const result = await manager.install(source)

    expect(result.action).toBe('linked')
    const stat = fs.lstatSync(result.path)
    expect(stat.isSymbolicLink()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getCollectionPaths
// ---------------------------------------------------------------------------

describe('getCollectionPaths', () => {
  test('returns empty array when collections dir does not exist', () => {
    const manager = new CollectionManager(path.join(tmpDir(), 'nonexistent'))
    expect(manager.getCollectionPaths()).toEqual([])
  })

  test('includes real directories', () => {
    const root = tmpDir()
    const collectionsDir = path.join(root, 'collections')
    fs.mkdirSync(path.join(collectionsDir, 'coll-a'), { recursive: true })

    const manager = new CollectionManager(root)
    expect(manager.getCollectionPaths()).toEqual([
      path.join(collectionsDir, 'coll-a'),
    ])
  })

  test('includes symlinked directories', async () => {
    const root = tmpDir()
    const source = fakeCollection(root, ['connector-acme'])
    const maxHome = path.join(root, 'max-home')

    const manager = new CollectionManager(maxHome)
    await manager.install(source)

    const paths = manager.getCollectionPaths()
    expect(paths).toHaveLength(1)
    expect(paths[0]).toContain('my-connectors')
  })
})
