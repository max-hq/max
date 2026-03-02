import { describe, test, expect } from 'bun:test'
import { BufferedSocket } from '../util/buffered-socket.js'

/**
 * Mock Writable that records every call in order.
 * `writeReturn` controls how many bytes socket.write() claims to accept.
 */
function createMockSocket(writeReturn?: number) {
  const calls: string[] = []
  const socket = {
    write(data: string | Uint8Array): number {
      const len = typeof data === 'string' ? data.length : data.byteLength
      const accepted = writeReturn ?? len
      calls.push(`write(${accepted}/${len})`)
      return accepted
    },
    flush() {
      calls.push('flush')
    },
    end() {
      calls.push('end')
    },
  }
  return { socket, calls }
}

describe('BufferedSocket', () => {
  // -------------------------------------------------------------------
  // flush-before-end - the fix under test
  // -------------------------------------------------------------------

  test('end() flushes before closing when queue is empty', async () => {
    const { socket, calls } = createMockSocket()
    const buf = new BufferedSocket(socket)

    buf.write('hello\n')
    await buf.end()

    // write accepted all bytes → queue was empty → end() should flush then close
    expect(calls).toEqual([
      'write(6/6)',
      'flush',
      'end',
    ])
  })

  test('end() flushes before closing after drain empties the queue', async () => {
    // socket accepts 0 bytes on first write → everything queued
    const { socket, calls } = createMockSocket(0)
    const buf = new BufferedSocket(socket)

    buf.write('hi\n')

    // Queue is non-empty, so end() returns a pending promise
    const done = buf.end()

    // Now simulate the socket accepting all bytes on drain
    socket.write = (data: string | Uint8Array) => {
      const len = typeof data === 'string' ? data.length : data.byteLength
      calls.push(`write(${len}/${len})`)
      return len
    }
    buf.drain()

    await done

    expect(calls).toEqual([
      'write(0/3)',   // initial write: socket rejects all bytes
      'write(3/3)',   // drain: socket accepts remaining bytes
      'flush',        // flush before close
      'end',          // close
    ])
  })

  // -------------------------------------------------------------------
  // Without flush, data could be lost if socket.end() doesn't
  // implicitly send buffered data.
  // This test verifies the contract: flush MUST precede end.
  // -------------------------------------------------------------------

  test('flush is called even for a single small write', async () => {
    const { socket, calls } = createMockSocket()
    const buf = new BufferedSocket(socket)

    buf.write('x')
    await buf.end()

    const flushIdx = calls.indexOf('flush')
    const endIdx = calls.indexOf('end')
    expect(flushIdx).toBeGreaterThanOrEqual(0)
    expect(endIdx).toBeGreaterThan(flushIdx)
  })

  // -------------------------------------------------------------------
  // Partial write / queuing behaviour (pre-existing, not part of fix)
  // -------------------------------------------------------------------

  test('queues remainder when socket accepts fewer bytes', () => {
    // Socket only accepts 2 bytes per write
    const { socket, calls } = createMockSocket(2)
    const buf = new BufferedSocket(socket)

    buf.write('abcde')

    // Only 2 of 5 bytes accepted → remainder queued
    expect(calls).toEqual(['write(2/5)'])

    // Second write should go straight to queue (preserves ordering)
    buf.write('fg')
    expect(calls).toEqual(['write(2/5)'])
  })

  test('drain flushes queued chunks in order', async () => {
    const accepted: number[] = []
    const { socket, calls } = createMockSocket(0)
    const buf = new BufferedSocket(socket)

    buf.write('abc')
    buf.write('de')

    // Both writes queued since socket accepted 0 bytes
    // Now let drain succeed fully
    socket.write = (data: string | Uint8Array) => {
      const len = typeof data === 'string' ? data.length : data.byteLength
      accepted.push(len)
      calls.push(`write(${len}/${len})`)
      return len
    }

    buf.drain()

    // Should have drained both chunks
    expect(accepted).toEqual([3, 2])
  })
})
