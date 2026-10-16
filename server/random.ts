import { customAlphabet } from 'nanoid';

const ADJECTIVES = ['swift', 'brave', 'calm', 'dark', 'wild', 'cool', 'bold', 'keen', 'wise', 'pure', 'quiet', 'lucky'];
const NOUNS = ['lion', 'hawk', 'wolf', 'bear', 'fox', 'deer', 'owl', 'elk', 'ram', 'jay', 'lynx', 'crow'];

const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/** A memorable login token like `brave-owl-4821` (~1.3M combinations). */
export function randomToken() {
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${num}`;
}

/** A six-character game join code without look-alike characters (no 0/O, 1/I/L). */
export const randomJoinCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
