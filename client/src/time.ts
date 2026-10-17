/**
 * A timestamp from the API as a Date. Rows created by the database use
 * SQLite's "YYYY-MM-DD HH:MM:SS" (UTC), which browsers would read as local
 * time; timestamps the server sets later are ISO-8601.
 */
export function parseServerTime(value: string) {
  return new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
}
