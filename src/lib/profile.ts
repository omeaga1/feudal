/** Accepts a bare profile id or a pasted aoe4world.com profile URL. */
export function parseProfileInput(input: string): number | null {
  const trimmed = input.trim();
  const match = trimmed.match(/players\/(\d+)/) ?? trimmed.match(/^(\d+)$/);
  return match ? Number(match[1]) : null;
}
