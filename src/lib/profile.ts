/** Accepts a bare profile id or a pasted aoe4world.com profile URL. */
export function parseProfileInput(input: string): number | null {
  const trimmed = input.trim();
  const match = trimmed.match(/players\/(\d+)/) ?? trimmed.match(/^(\d+)$/);
  return match ? Number(match[1]) : null;
}

const STORAGE_KEY = "feudal.profileId";

export function loadProfileId(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveProfileId(id: number | null): void {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Not persisted; still works for this session.
  }
}
