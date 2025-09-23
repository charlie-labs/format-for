import { type FormatOptions } from '../types.js';

/**
 * Route renderer warnings according to centralized options.
 *
 * Semantics:
 * - Always invoke onWarn(message) when provided.
 * - Call console.warn(message) unless mode === 'silent'.
 */
export function warn(message: string, opts?: FormatOptions['warnings']): void {
  if (opts?.onWarn) {
    // Best-effort: never throw from user callback
    try {
      opts.onWarn(String(message));
    } catch {
      // swallow
    }
  }
  if (!opts || opts.mode !== 'silent') {
    // eslint-disable-next-line no-console
    console.warn(String(message));
  }
}
