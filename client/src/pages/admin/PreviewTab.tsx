import { useState } from 'react';
import { api } from '../../api';

const AWARDS = [
  { key: 'courageous', emoji: '🦁', label: 'Most Courageous', load: api.leaderboard.mostCourageous },
  { key: 'miss', emoji: '💨', label: 'Biggest Miss', load: api.leaderboard.biggestMiss },
  { key: 'controversial', emoji: '🔥', label: 'Most Controversial', load: api.leaderboard.mostControversial },
  { key: 'revised', emoji: '🔄', label: "Can't Make Up Their Mind", load: api.leaderboard.mostRevised },
  { key: 'bestFriends', emoji: '🤝', label: 'Best Friends', load: api.leaderboard.bestFriends },
  { key: 'star', emoji: '⭐', label: 'Star of the Show', load: api.leaderboard.starOfTheShow },
  { key: 'joker', emoji: '🃏', label: 'The Joker', load: api.leaderboard.theJoker },
  { key: 'lastMinute', emoji: '⚡', label: 'Last Minute', load: api.leaderboard.lastMinute },
  { key: 'first', emoji: '🌅', label: 'First to Submit', load: api.leaderboard.firstToSubmit },
] as const;

/** Admin-only previews of the leaderboard and Hall of Fame before the game is done. */
export function PreviewTab() {
  const [board, setBoard] = useState<any[] | null>(null);
  const [hof, setHof] = useState<Record<string, any> | null>(null);

  const loadBoard = async () => {
    try {
      setBoard((await api.leaderboard.preview()) as any[]);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const loadHof = async () => {
    const results = await Promise.allSettled(AWARDS.map(a => (a.load as () => Promise<unknown>)()));
    setHof(
      Object.fromEntries(
        AWARDS.map((a, i) => {
          const r = results[i];
          return [a.key, r.status === 'fulfilled' ? r.value : null];
        }),
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h3 className="font-medium">Score Preview</h3>
        <p className="text-xs text-white/40">
          Current scores based on outcomes marked so far. Does not affect the real leaderboard.
        </p>
        <button onClick={loadBoard} className="btn-primary w-full">
          🔄 Calculate Scores
        </button>
      </div>

      {board && (
        <div className="space-y-2">
          {board.length === 0 ? (
            <div className="card text-center py-8 text-white/40">No scores yet - no outcomes marked.</div>
          ) : (
            board.map((u: any) => (
              <div key={u.id} className="card flex items-center gap-4">
                <div
                  className={`font-display text-2xl font-bold w-8 text-center ${u.rank === 1 ? 'text-amber' : u.rank === 2 ? 'text-white/70' : u.rank === 3 ? 'text-orange/70' : 'text-white/30'}`}
                >
                  {u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : `#${u.rank}`}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-white/40">
                    {u.score} true prediction{u.score !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display font-bold text-orange text-xl">{u.weightedScore}</p>
                  <p className="text-xs text-white/30">pts</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="card space-y-3">
        <h3 className="font-medium">Hall of Fame Preview</h3>
        <p className="text-xs text-white/40">Preview all Hall of Fame cards based on current outcomes.</p>
        <button onClick={loadHof} className="btn-primary w-full">
          🏆 Preview Hall of Fame
        </button>
      </div>

      {hof && (
        <div className="space-y-2">
          {AWARDS.map(({ key, emoji, label }) => {
            const val = hof[key];
            if (!val || (Array.isArray(val) && val.length === 0))
              return (
                <div key={key} className="card flex items-center gap-3 opacity-40">
                  <span className="text-xl">{emoji}</span>
                  <div>
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-white/40">No data yet</p>
                  </div>
                </div>
              );
            const names = Array.isArray(val)
              ? val.map((v: any) => v.name || (v.userA && v.userB ? `${v.userA} & ${v.userB}` : '')).join(', ')
              : val.names?.join(', ') || val.name || val.text || '';
            const detail = Array.isArray(val)
              ? null
              : val.avg != null
                ? `${val.avg}% avg`
                : val.editCount != null
                  ? `${val.editCount} edit${val.editCount !== 1 ? 's' : ''}`
                  : null;
            return (
              <div key={key} className="card flex items-center gap-3">
                <span className="text-xl">{emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-white/60 truncate">{names}</p>
                </div>
                {detail && <span className="text-xs text-amber flex-shrink-0">{detail}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
