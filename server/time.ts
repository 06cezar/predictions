/**
 * Milliseconds since the epoch for a stored timestamp. Rows get SQLite's
 * "YYYY-MM-DD HH:MM:SS" (UTC) when created and ISO-8601 when the app sets
 * them later, and the two formats don't compare correctly as text.
 */
export function parseTimestamp(value: string): number {
  return Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
}

/** A stored timestamp as ISO-8601, whichever format it was saved in. */
export function toIso(value: string): string {
  return new Date(parseTimestamp(value)).toISOString();
}
