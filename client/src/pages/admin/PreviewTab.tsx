import { useState } from 'react';
import { api, errorMessage, HallOfFame, LeaderboardEntry } from '../../api';
import { RefreshCw, Trophy } from 'lucide-react';
import { AWARD_ICONS } from '../../components/HallOfFame';
import { RankBadge } from '../../components/Sticker';

/** One line per award for the compact preview: who or what won, and a short detail. */
function awardRows(h: HallOfFame) {
  const names = (winners: { name: string }[]) => winners.map(w => w.name).join(', ');
  const edits = (n: number) => `${n} edit${n !== 1 ? 's' : ''}`;
  return [
    {
      icon: AWARD_ICONS.mostCourageous,
      label: 'Most Courageous',
      winner: h.mostCourageous?.text,
      detail: h.mostCourageous && `${h.mostCourageous.avg}% avg`,
    },
    {
      icon: AWARD_ICONS.biggestMiss,
      label: 'Biggest Miss',
      winner: h.biggestMiss?.text,
      detail: h.biggestMiss && `${h.biggestMiss.avg}% avg`,
    },
    {
      icon: AWARD_ICONS.mostControversial,
      label: 'Most Controversial',
      winner: h.mostControversial?.text,
      detail: h.mostControversial && `${h.mostControversial.avg}% avg`,
    },
    {
      icon: AWARD_ICONS.mostRevised,
      label: "Can't Make Up Their Mind",
      winner: h.mostRevised?.text,
      detail: h.mostRevised && edits(h.mostRevised.editCount),
    },
    {
      icon: AWARD_ICONS.bestFriends,
      label: 'Best Friends',
      winner: h.bestFriends.map(p => `${p.userA} & ${p.userB}`).join(', '),
    },
    { icon: AWARD_ICONS.starOfTheShow, label: 'Star of the Show', winner: names(h.starOfTheShow) },
    { icon: AWARD_ICONS.theJoker, label: 'The Joker', winner: names(h.theJoker) },
    { icon: AWARD_ICONS.lastMinute, label: 'Last Minute', winner: h.lastMinute?.text },
    { icon: AWARD_ICONS.firstToSubmit, label: 'First to Submit', winner: h.firstToSubmit?.names.join(', ') },
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
          <RefreshCw className="inline-block w-4 h-4 -mt-0.5 mr-1.5" />
          Calculate Scores
        </button>
      </div>

      {board && (
        <div className="space-y-2">
          {board.length === 0 ? (
            <div className="card text-center py-8 text-white/40">No scores yet - no outcomes marked.</div>
          ) : (
            board.map(u => (
              <div key={u.id} className="card flex items-center gap-4">
                <div className="w-9 flex justify-center">
                  <RankBadge rank={u.rank} large />
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
          <Trophy className="inline-block w-4 h-4 -mt-0.5 mr-1.5" />
          Preview Hall of Fame
        </button>
      </div>

      {hof && (
        <div className="space-y-2">
          {awardRows(hof).map(({ icon: Icon, label, winner, detail }) =>
            winner ? (
              <div key={label} className="card flex items-center gap-3">
                <Icon className="w-5 h-5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-white/60 truncate">{winner}</p>
                </div>
                {detail && <span className="text-xs text-amber flex-shrink-0">{detail}</span>}
              </div>
            ) : (
              <div key={label} className="card flex items-center gap-3 opacity-40">
                <Icon className="w-5 h-5 shrink-0" />
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
