import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

/** Explains the demo sandbox and how to play it through on your own. */
export function DemoBanner() {
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    api.settings.get().then(s => setExpiresAt(s.demoExpiresAt)).catch(() => {});
  }, []);

  const until = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4">
      <div className="rounded-xl border border-lilac/25 bg-violet/15 px-4 py-3 text-sm text-white/75 space-y-1">
        <p>
          <span className="font-medium text-lilac">🧪 Demo game.</span> You're the admin and the other four players
          are bots. Write a few predictions, then move the game to <b>Reveal</b> and <b>Done</b> from{' '}
          <Link to="/admin" className="text-amber hover:underline">Admin → Settings</Link> to see the scoring and Hall of Fame.
        </p>
        <p className="text-white/45 text-xs">
          {until && <>This sandbox is private to you and deleted on {until}. </>}
          <Link to="/about" className="text-lilac hover:underline">How does the game work?</Link>
        </p>
      </div>
    </div>
  );
}
