/**
 * Apply a transformation to text outside of inline/code fences.
 * Prefer AST transforms; this is a last-resort utility for simple pre-parsing cleanup.
 */
export function transformOutsideCode(
  input: string,
  transform: (s: string) => string
): string {
  // Very small implementation: split by code fences and transform only non-code parts
  const parts = input.split(/(```[\s\S]*?```)/g);
  return parts.map((p) => (p.startsWith('```') ? p : transform(p))).join('');
}
