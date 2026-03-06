/**
 * Argv parser — thin wrapper around optique's parseAsync.
 *
 * Returns a discriminated result: success with parsed value, or
 * failure with the structured error Message from optique. The caller
 * (cli.ts) decides how to format and present errors.
 */

import { type Message, formatMessage } from '@optique/core/message'
import { type Mode, type Parser, parseAsync } from '@optique/core/parser'

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Message }

export async function parseArgs<T>(
  parser: Parser<Mode, T, unknown>,
  args: readonly string[],
): Promise<ParseResult<T>> {
  const result = await parseAsync(parser, args)
  if (result.success) {
    return { ok: true, value: result.value }
  }
  return { ok: false, error: result.error }
}

/**
 * Extract the unrecognized token from an optique error Message.
 * Optique errors for unknown commands look like:
 *   [{ type: 'text', text: 'Unexpected...: ' }, { type: 'value', value: 'connect' }, ...]
 */
export function extractErrorValue(error: Message): string | undefined {
  for (const term of error) {
    if (term.type === 'value') return term.value
    if (term.type === 'optionName') return term.optionName
  }
  return undefined
}

export { formatMessage }
