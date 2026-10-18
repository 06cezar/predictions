import { useState } from 'react';

/** Copy text to the clipboard and remember which item was copied, briefly, for a "Copied" label. */
export function useCopied(resetAfterMs = 2000) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string = text) => {
    // navigator.clipboard only exists on https or localhost
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(key);
        setTimeout(() => setCopied(current => (current === key ? null : current)), resetAfterMs);
      })
      .catch(() => {});
  };

  return { copied, copy };
}
