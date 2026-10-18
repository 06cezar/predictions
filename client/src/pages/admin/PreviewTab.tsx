import { useState } from 'react';
import { api, errorMessage, HallOfFame, LeaderboardEntry } from '../../api';

const MEDALS = ['🥇', '🥈', '🥉'];
const RANK_COLORS = ['text-amber', 'text-white/70', 'text-orange/70'];

/** One line per award for the compact preview: who or what won, and a short detail. */
function awardRows(h: HallOfFame) {
  const names = (winners: { name: string }[]) => winners.map(w => w.name).join(', ');
  const edits = (n: number) => `${n} edit${n !== 1 ? 's' : ''}`;
  return [
    {
      emoji: '🦁',
      label: 'Most Courageous',
      winner: h.mostCourageous?.text,
      detail: h.mostCourageous && `${h.mostCourageous.avg}% avg`,
    },
    {
      emoji: '💨',
      label: 'Biggest Miss',
      winner: h.biggestMiss?.text,
      detail: h.biggestMiss && `${h.biggestMiss.avg}% avg`,
    },
    {
      emoji: '🔥',
      label: 'Most Controversial',
      winner: h.mostControversial?.text,
      detail: h.mostControversial && `${h.mostControversial.avg}% avg`,
    },
    {
      emoji: '🔄',
      label: "Can't Make Up Their Mind",
      winner: h.mostRevised?.text,
      detail: h.mostRevised && edits(h.mostRevised.editCount),
    },
    { emoji: '🤝', label: 'Best Friends', winner: h.bestFriends.map(p => `${p.userA} & ${p.userB}`).join(', ') },
    { emoji: '⭐', label: 'Star of the Show', winner: names(h.starOfTheShow) },
    { emoji: '🃏', label: 'The Joker', winner: names(h.theJoker) },
    { emoji: '⚡', label: 'Last Minute', winner: h.lastMinute?.text },
    { emoji: '🌅', label: 'First to Submit', winner: h.firstToSubmit?.names.join(', ') },
  ];
}

/** Admin-only previews of the leaderboard and Hall of Fame before the game is done. */
export function PreviewTab() {
  const [board, setBoard] = useState<LeaderboardEntry[] | null>(null);
  const [hof, setHof] = useState<HallOfFame | null>(null);

  const load = async <T,>(fetch: () => Promise<T>, set: (value: T) => void) => {
    try {
      set(await fetch());
    } catch (err) {
      alert(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h3 className="font-medium">Score Preview</h3>
        <p className="text-xs text-white/40">
          Current scores based on outcomes marked so far. Does not affect the real leaderboard.
        </p>
        <button onClick={() => load(api.leaderboard.preview, setBoard)} className="btn-primary w-full">
          🔄 Calculate Scores
        </button>
      </div>

      {board && (
        <div className="space-y-2">
          {board.length === 0 ? (
            <div className="card text-center py-8 text-white/40">No scores yet - no outcomes marked.</div>
          ) : (
            board.map(u => (
              <div key={u.id} className="card flex items-center gap-4">
                <div
                  className={`font-display text-2xl font-bold w-8 text-center ${RANK_COLORS[u.rank - 1] ?? 'text-white/30'}`}
                >
                  {MEDALS[u.rank - 1] ?? `#${u.rank}`}
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
        <button onClick={() => load(api.leaderboard.hallOfFame, setHof)} className="btn-primary w-full">
          🏆 Preview Hall of Fame
        </button>
      </div>

      {hof && (
        <div className="space-y-2">
          {awardRows(hof).map(({ emoji, label, winner, detail }) =>
            winner ? (
              <div key={label} className="card flex items-center gap-3">
                <span className="text-xl">{emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-white/60 truncate">{winner}</p>
                </div>
                {detail && <span className="text-xs text-amber flex-shrink-0">{detail}</span>}
              </div>
            ) : (
              <div key={label} className="card flex items-center gap-3 opacity-40">
                <span className="text-xl">{emoji}</span>
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-white/40">No data yet</p>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
