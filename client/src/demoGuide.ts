/**
 * Per-browser memory for the demo guide: whether the visitor has looked at
 * the game's settings yet. Storage can be unavailable (private mode), so
 * every access is guarded; the guide works without it.
 */

export const DEMO_GUIDE_CHANGED = 'demo-guide:changed';

const settingsKey = (gameId: number) => `demo-settings-seen:${gameId}`;

export function markDemoSettingsSeen(gameId: number) {
  try {
    localStorage.setItem(settingsKey(gameId), '1');
  } catch {
    // ignore: the step just stays unticked
  }
  window.dispatchEvent(new Event(DEMO_GUIDE_CHANGED));
}

export function demoSettingsSeen(gameId: number) {
  try {
    return localStorage.getItem(settingsKey(gameId)) === '1';
  } catch {
    return false;
  }
}

/** A remembered on/off choice, or `fallback` if none was made (or storage is unavailable). */
export function loadFlag(key: string, fallback = false) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

export function saveFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // ignore
  }
}
