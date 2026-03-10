import { Fmt } from './fmt.js'
import { ErrPrinterNotRegistered } from './errors/errors.js'
import { StaticTypeCompanion } from './companion.js'

// ============================================================================
// Sink - minimal write target for streaming output
// ============================================================================

export interface Sink {
  write(data: string): void
  /** True if the sink's downstream has closed (e.g. EPIPE). */
  readonly broken?: boolean
  /** Wait for buffered writes to flush. Resolves immediately if no backpressure. */
  drain?(): Promise<void>
}

export const Sink = StaticTypeCompanion({
  /** Collects all writes into a string. Use in tests and Printable.toString(). */
  string(): Sink & { readonly value: string } {
    const chunks: string[] = []
    return {
      write(s: string) { chunks.push(s) },
      get value() { return chunks.join('') },
    }
  },
})

// ============================================================================
// Printable - deferred output that writes to a Sink given a Fmt
// ============================================================================

export interface Printable {
  writeTo(sink: Sink, fmt: Fmt): void
}

export const Printable = StaticTypeCompanion({
  /** Wrap a literal string (no formatting needed). */
  text(s: string): Printable {
    return { writeTo: (sink) => sink.write(s) }
  },

  /** Bind a value to a Printer. Fmt is deferred to write time. */
  of<T>(printer: Printer<T>, value: T): Printable {
    return { writeTo: (sink, fmt) => sink.write(printer.print(value, fmt)) }
  },

  /** Empty — writes nothing. */
  empty: { writeTo() {} } as Printable,

  /** Materialize to string (for tests, compat). */
  toString(p: Printable, fmt: Fmt = Fmt.plain): string {
    const sink = Sink.string()
    p.writeTo(sink, fmt)
    return sink.value
  },
})

// ============================================================================
// Printer - defines how to render T as a string
// ============================================================================

type PrintFn<T> = (value: T, fmt: Fmt) => string

export class Printer<T> {
  constructor(private fn: PrintFn<T>) {}

  static define<T>(fn: (value: T, fmt: Fmt) => string) {
    return new Printer(fn)
  }

  print(value: T, fmt: Fmt): string {
    return this.fn(value, fmt)
  }

  /** Convenience function for multi-line output */
  static lines(strings: string[]): string {
    return strings.join('\n')
  }
}

export class PrintFormatter<P extends Record<string, Printer<any>> = Record<string, Printer<any>>> {
  constructor(private fmt: Fmt, private platformPrinters?: P) {}

  /** Key-based print — looks up the printer from the platform registry. */
  print<K extends string & keyof P>(key: K, value: P[K] extends Printer<infer T> ? T : never): string
  /** Direct print — uses the provided Printer instance. */
  print<T>(printer: Printer<T>, value: T): string
  print(printerOrKey: any, value: any): string {
    const printer = typeof printerOrKey === 'string'
      ? this.platformPrinters?.[printerOrKey]
      : printerOrKey
    if (!printer) throw ErrPrinterNotRegistered.create({ key: String(printerOrKey) })
    return printer.print(value, this.fmt)
  }

  /** Key-based printList — looks up the printer from the platform registry. */
  printList<K extends string & keyof P>(key: K, values: (P[K] extends Printer<infer T> ? T : never)[]): string
  /** Direct printList — uses the provided Printer instance. */
  printList<T>(printer: Printer<T>, values: T[]): string
  printList(printerOrKey: any, values: any[]): string {
    const printer = typeof printerOrKey === 'string'
      ? this.platformPrinters?.[printerOrKey]
      : printerOrKey
    if (!printer) throw ErrPrinterNotRegistered.create({ key: String(printerOrKey) })
    return values.map(v => printer.print(v, this.fmt)).join('\n')
  }

  printVia<T>(printer: Printer<T>, value: T): string {
    return printer.print(value, this.fmt)
  }
  printListVia<T>(printer: Printer<T>, values: T[], separator: string = '\n\n'): string {
    return values.map((t) => printer.print(t, this.fmt)).join(separator)
  }
}
