import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, LeaderboardEntry } from '../api';

const AVATAR_COLORS = ['bg-orange', 'bg-violet', 'bg-amber/80', 'bg-cyan-500', 'bg-pink-500', 'bg-emerald-500'];
const MEDALS = ['🥇', '🥈', '🥉'];

function exportCSV(entries: LeaderboardEntry[]) {
  const rows = [
    ['Rank', 'Name', 'Score', 'Weighted Score'],
    ...entries.map(e => [e.rank, e.name, e.score, e.weightedScore]),
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'predictions-leaderboard.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [tiers, setTiers] = useState({ threshold: 40, tier1: 10, tier2: 20 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.leaderboard.get().then(data => {
      setEntries(data);
      if (data.length > 0) {
        const { threshold, tier1, tier2 } = data[0] as any;
        if (threshold) setTiers({ threshold, tier1, tier2 });
      }
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-6">
        <Link to="/" className="btn-ghost text-sm px-3">← Back</Link>
        <h1 className="font-display text-2xl font-bold flex-1">Leaderboard</h1>
        {entries.length > 0 && (
          <button
            onClick={() => exportCSV(entries)}
            className="btn-secondary text-sm px-4 py-2"
          >
            ↓ Export
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 mb-6 space-y-1.5">
        <p className="text-sm font-medium text-white/80">🏆 How scoring works</p>
        <ul className="text-xs text-white/50 space-y-1">
          <li>· Predictions that <span className="text-white/70 font-medium">didn't come true score 0</span> - bonuses and penalties only apply to correct predictions.</li>
          <li>· <span className="text-white/70 font-medium">Score</span> - raw count of predictions that came true.</li>
          <li>· <span className="text-white/70 font-medium">Weighted score</span> - the actual ranking. The lower the avg rating on a correct prediction, the more points:</li>
          <li className="pl-3">
            under {tiers.tier1}% → <span className="text-amber font-medium">4 pts</span> · {tiers.tier1}-{tiers.tier2}% → <span className="text-amber font-medium">3 pts</span> · {tiers.tier2}-{tiers.threshold}% → <span className="text-amber font-medium">2 pts</span> · {tiers.threshold}%+ → <span className="text-amber font-medium">1 pt</span>
          </li>
          <li>· Each edit costs <span className="text-orange font-medium">-0.5 pts</span>, minimum 0.5 pts - only counts if the prediction came true.</li>
        </ul>
      </div>

      {loading ? (
        <div className="text-center py-12 text-white/50">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="card text-center py-12">
          <p className="font-display text-3xl mb-3">🏆</p>
          <p className="text-white/50">No scores yet - mark some outcomes first!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => {
            const initials = entry.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const color = AVATAR_COLORS[entry.id % AVATAR_COLORS.length];

            return (
              <div key={entry.id} className={`card flex items-center gap-4 ${i === 0 ? 'border-amber/40 bg-amber/5' : ''}`}>
                <div className="w-8 text-center font-display font-bold text-lg text-white/40">
                  {MEDALS[i] || `#${entry.rank}`}
                </div>
                <div className={`${color} w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm text-white flex-shrink-0`}>
                  {initials}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{entry.name}</p>
                  <p className="text-sm text-white/40">
                    {entry.score} prediction{entry.score !== 1 ? 's' : ''} happened
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl font-bold text-amber">{entry.score}</p>
                  {entry.weightedScore > 0 && (
                    <p className="text-xs text-white/40">{entry.weightedScore} weighted</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
