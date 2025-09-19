export function transformOutsideCode(
  input: string,
  transform: (s: string) => string
): string {
  const lines = String(input).split('\n');
  let inFence = false;
  return lines
    .map((line) => {
      if (/^```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : transform(line);
    })
    .join('\n');
}
