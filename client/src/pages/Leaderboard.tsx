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

type HofCard = { text: string; authorName: string | null; targetName: string; avg: number; stdDev?: number; individualRatings?: number[] } | null | undefined;

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [tiers, setTiers] = useState({ threshold: 40, tier1: 10, tier2: 20, tier3: 30 });
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [courageous, setCourageous] = useState<HofCard>(undefined);
  const [biggestMiss, setBiggestMiss] = useState<HofCard>(undefined);
  const [controversial, setControversial] = useState<HofCard>(undefined);
  const [mostRevised, setMostRevised] = useState<{ text: string; authorName: string | null; targetName: string; editCount: number; history: string[] } | null | undefined>(undefined);
  const [lastMinute, setLastMinute] = useState<{ text: string; authorName: string | null; targetName: string; updatedAt: string } | null | undefined>(undefined);
  const [firstToSubmit, setFirstToSubmit] = useState<{ names: string[]; tied: boolean } | null | undefined>(undefined);
  const [bestFriends, setBestFriends] = useState<{ userA: string; userB: string }[]>([]);
  const [showRatings, setShowRatings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [mrDoesItAll, setMrDoesItAll] = useState<{ name: string; count: number }[]>([]);
  const [mostUnpredictable, setMostUnpredictable] = useState<{ name: string; count: number }[]>([]);
  const [hofRevealing, setHofRevealing] = useState(false);
  const [hofRevealed, setHofRevealed] = useState(false);
  const [rankingsRevealing, setRankingsRevealing] = useState(false);
  const [rankingsRevealed, setRankingsRevealed] = useState(false);

  const reveal = (setRevealing: (v: boolean) => void, setRevealed: (v: boolean) => void) => {
    setRevealing(true);
    setTimeout(() => { setRevealing(false); setRevealed(true); }, 1800);
  };

  useEffect(() => {
    api.leaderboard.get().then(data => {
      setEntries(data);
      if (data.length > 0) {
        const { threshold, tier1, tier2, tier3 } = data[0] as any;
        if (threshold) setTiers({ threshold, tier1, tier2, tier3 });
      }
      api.leaderboard.mostCourageous().then(setCourageous).catch(() => {});
      api.leaderboard.biggestMiss().then(setBiggestMiss).catch(() => {});
      api.leaderboard.mostControversial().then(setControversial).catch(() => {});
      api.leaderboard.mostRevised().then(setMostRevised).catch(() => {});
      api.leaderboard.lastMinute().then(setLastMinute).catch(() => {});
      api.leaderboard.firstToSubmit().then(setFirstToSubmit).catch(() => {});
      api.leaderboard.bestFriends().then(setBestFriends).catch(() => {});
      api.leaderboard.mrDoesItAll().then(setMrDoesItAll).catch(() => {});
      api.leaderboard.mostUnpredictable().then(setMostUnpredictable).catch(() => {});
    }).catch(() => {
      setLocked(true);
      api.settings.get().then(s => {
        const t = s.ratingThreshold;
        setTiers({ threshold: t, tier1: Math.floor(t * 0.25), tier2: Math.floor(t * 0.5), tier3: Math.floor(t * 0.75) });
      }).catch(() => {});
    }).finally(() => setLoading(false));
  }, []);

  if (locked) return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-6">
        <Link to="/" className="btn-ghost text-sm px-3">← Back</Link>
        <h1 className="font-display text-2xl font-bold flex-1">Leaderboard</h1>
      </div>
      <div className="card text-center py-12 space-y-3">
        <p className="text-4xl">🔒</p>
        <p className="font-medium text-white/80">Results are not out yet</p>
        <p className="text-sm text-white/40">The leaderboard will be revealed when the game is done.</p>
      </div>
      <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 mt-6 space-y-1.5">
        <p className="text-sm font-medium text-white/80">🏆 How scoring works</p>
        <p className="text-xs text-white/40">Points go to the person who <span className="text-white/60">wrote</span> the prediction, not the one it's about.</p>
        <ul className="text-xs text-white/50 space-y-1">
          <li>· Predictions that <span className="text-white/70 font-medium">didn't come true score 0</span> - bonuses and penalties only apply to correct predictions.</li>
          <li>· <span className="text-white/70 font-medium">Score</span> - raw count of predictions that came true.</li>
          <li>· <span className="text-white/70 font-medium">Weighted score</span> - the actual ranking. The lower the avg rating on a correct prediction, the more points:</li>
          <li className="pl-3">
            under {tiers.tier1}% → <span className="text-amber font-medium">5 pts</span> · {tiers.tier1}-{tiers.tier2}% → <span className="text-amber font-medium">4 pts</span> · {tiers.tier2}-{tiers.tier3}% → <span className="text-amber font-medium">3 pts</span> · {tiers.tier3}-{tiers.threshold}% → <span className="text-amber font-medium">2 pts</span> · {tiers.threshold}%+ → <span className="text-amber font-medium">1 pt</span>
          </li>
          <li>· Each edit costs <span className="text-orange font-medium">-0.5 pts</span>, minimum 0.5 pts - only counts if the prediction came true.</li>
        </ul>
      </div>
    </div>
  );

  const hasHof = courageous || biggestMiss || controversial || mostRevised || lastMinute || firstToSubmit || bestFriends.length > 0 || mrDoesItAll.length > 0 || mostUnpredictable.length > 0;

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-6">
        <Link to="/" className="btn-ghost text-sm px-3">← Back</Link>
        <h1 className="font-display text-2xl font-bold flex-1">Leaderboard</h1>
        {rankingsRevealed && entries.length > 0 && (
          <button onClick={() => exportCSV(entries)} className="btn-secondary text-sm px-4 py-2">
            ↓ Export
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-white/50">Loading...</div>
      ) : (<>

      <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3 mb-6 space-y-1.5">
        <p className="text-sm font-medium text-white/80">🏆 How scoring works</p>
        <p className="text-xs text-white/40">Points go to the person who <span className="text-white/60">wrote</span> the prediction, not the one it's about.</p>
        <ul className="text-xs text-white/50 space-y-1">
          <li>· Predictions that <span className="text-white/70 font-medium">didn't come true score 0</span> - bonuses and penalties only apply to correct predictions.</li>
          <li>· <span className="text-white/70 font-medium">Score</span> - raw count of predictions that came true.</li>
          <li>· <span className="text-white/70 font-medium">Weighted score</span> - the actual ranking. The lower the avg rating on a correct prediction, the more points:</li>
          <li className="pl-3">
            under {tiers.tier1}% → <span className="text-amber font-medium">5 pts</span> · {tiers.tier1}-{tiers.tier2}% → <span className="text-amber font-medium">4 pts</span> · {tiers.tier2}-{tiers.tier3}% → <span className="text-amber font-medium">3 pts</span> · {tiers.tier3}-{tiers.threshold}% → <span className="text-amber font-medium">2 pts</span> · {tiers.threshold}%+ → <span className="text-amber font-medium">1 pt</span>
          </li>
          <li>· Each edit costs <span className="text-orange font-medium">-0.5 pts</span>, minimum 0.5 pts - only counts if the prediction came true.</li>
        </ul>
      </div>

      {/* Hall of Fame */}
      {hasHof && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4 animate-fade-up">
            <div className="flex-1 h-px bg-white/10" />
            <p className="text-xs text-white/30 uppercase tracking-widest font-medium">✨ Hall of Fame</p>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {!hofRevealed ? (
            <button
              onClick={() => reveal(setHofRevealing, setHofRevealed)}
              disabled={hofRevealing}
              className={`w-full card text-center py-6 transition-all ${hofRevealing ? 'animate-pulse border-amber/40 bg-amber/5' : 'hover:bg-white/10 hover:border-white/20'}`}
            >
              {hofRevealing ? (
                <div className="space-y-1">
                  <p className="text-3xl">🥁</p>
                  <p className="text-amber font-medium text-sm">drum roll...</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-2xl">🥁</p>
                  <p className="text-white/50 text-sm">Reveal Hall of Fame</p>
                </div>
              )}
            </button>
          ) : (
            <>
              {courageous && (
                <div className="card mb-3 border border-amber/30 bg-amber/5 space-y-2 animate-fade-up">
                  <p className="text-xs text-amber uppercase tracking-widest font-medium">🦁 Most Courageous Prediction</p>
                  <p className="text-white/90 leading-relaxed">"{courageous.text}"</p>
                  <div className="flex items-center justify-between text-xs text-white/40 pt-1">
                    <span>
                      {courageous.authorName && <>by <span className="text-white/70">{courageous.authorName}</span> </>}
                      about <span className="text-white/70">{courageous.targetName}</span>
                    </span>
                    <span className="text-amber font-medium">{courageous.avg}% avg rating</span>
                  </div>
                </div>
              )}
              {biggestMiss && (
                <div className="card mb-3 border border-orange/30 bg-orange/5 space-y-2 animate-fade-up" style={{ animationDelay: '0.1s' }}>
                  <p className="text-xs text-orange uppercase tracking-widest font-medium">💀 Biggest Miss</p>
                  <p className="text-white/90 leading-relaxed">"{biggestMiss.text}"</p>
                  <div className="flex items-center justify-between text-xs text-white/40 pt-1">
                    <span>
                      {biggestMiss.authorName && <>by <span className="text-white/70">{biggestMiss.authorName}</span> </>}
                      about <span className="text-white/70">{biggestMiss.targetName}</span>
                    </span>
                    <span className="text-orange font-medium">{biggestMiss.avg}% avg rating</span>
                  </div>
                </div>
              )}
              {controversial && (
                <div className="card mb-3 border border-violet/30 bg-violet/5 space-y-2 animate-fade-up" style={{ animationDelay: '0.18s' }}>
                  <p className="text-xs text-[#a99eff] uppercase tracking-widest font-medium">📊 Most Controversial Prediction</p>
                  <p className="text-white/90 leading-relaxed">"{controversial.text}"</p>
                  <div className="flex items-center justify-between text-xs text-white/40 pt-1">
                    <span>
                      {controversial.authorName && <>by <span className="text-white/70">{controversial.authorName}</span> </>}
                      about <span className="text-white/70">{controversial.targetName}</span>
                    </span>
                    <span className="text-[#a99eff] font-medium">avg {controversial.avg}% - spread ±{controversial.stdDev}%</span>
                  </div>
                  <button onClick={() => setShowRatings(v => !v)} className="text-xs text-white/30 hover:text-white/60 transition-colors">
                    {showRatings ? '▲ Hide ratings' : `▼ Show individual ratings (${controversial.individualRatings?.length ?? 0})`}
                  </button>
                  {showRatings && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(controversial.individualRatings ?? []).map((r, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-lg bg-white/10 text-xs text-white/70 font-medium">{r}%</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {lastMinute && (
                <div className="card mb-3 border border-orange/30 bg-orange/5 space-y-2 animate-fade-up" style={{ animationDelay: '0.30s' }}>
                  <p className="text-xs text-orange uppercase tracking-widest font-medium">⚡ Last Minute</p>
                  <p className="text-white/90 leading-relaxed">"{lastMinute.text}"</p>
                  <div className="flex items-center justify-between text-xs text-white/40 pt-1">
                    <span>
                      {lastMinute.authorName && <>by <span className="text-white/70">{lastMinute.authorName}</span> </>}
                      about <span className="text-white/70">{lastMinute.targetName}</span>
                    </span>
                    <span className="text-orange font-medium">{new Date(lastMinute.updatedAt).toLocaleString(undefined, { hour12: false })}</span>
                  </div>
                </div>
              )}
              {firstToSubmit && (
                <div className="card mb-3 border border-emerald-400/30 bg-emerald-400/5 space-y-2 animate-fade-up" style={{ animationDelay: '0.36s' }}>
                  <p className="text-xs text-emerald-300 uppercase tracking-widest font-medium">🌅 First to Submit</p>
                  <p className="text-white/90">
                    {firstToSubmit.tied
                      ? <>{firstToSubmit.names.map((n, i) => <span key={n}>{i > 0 && ' & '}<span className="text-white font-medium">{n}</span></span>)} finished first</>
                      : <><span className="text-white font-medium">{firstToSubmit.names[0]}</span> was the first to finish all predictions</>
                    }
                  </p>
                </div>
              )}
              {bestFriends.map((pair, i) => (
                <div key={`${pair.userA}-${pair.userB}`} className="card mb-3 border border-pink-400/30 bg-pink-400/5 space-y-2 animate-fade-up" style={{ animationDelay: `${0.22 + i * 0.08}s` }}>
                  <p className="text-xs text-pink-300 uppercase tracking-widest font-medium">
                    🤝 Best Friends{bestFriends.length > 1 ? ` ${i + 1}` : ''}
                    {bestFriends.length > 1 && <span className="text-white/30 ml-1">(equal scores)</span>}
                  </p>
                  <p className="text-white/90">
                    <span className="text-white font-medium">{pair.userA}</span> & <span className="text-white font-medium">{pair.userB}</span> knew each other best
                  </p>
                  <p className="text-xs text-white/40">both predicted each other correctly</p>
                </div>
              ))}
              {mostRevised && (
                <div className="card mb-3 border border-pink-500/30 bg-pink-500/5 space-y-2 animate-fade-up" style={{ animationDelay: '0.26s' }}>
                  <p className="text-xs text-pink-400 uppercase tracking-widest font-medium">🔄 Can't Make Up Their Mind</p>
                  <p className="text-white/90 leading-relaxed">"{mostRevised.text}"</p>
                  <div className="flex items-center justify-between text-xs text-white/40 pt-1">
                    <span>
                      {mostRevised.authorName && <>by <span className="text-white/70">{mostRevised.authorName}</span> </>}
                      about <span className="text-white/70">{mostRevised.targetName}</span>
                    </span>
                    <span className="text-pink-400 font-medium">{mostRevised.editCount} edit{mostRevised.editCount !== 1 ? 's' : ''}</span>
                  </div>
                  <button onClick={() => setShowHistory(v => !v)} className="text-xs text-white/30 hover:text-white/60 transition-colors">
                    {showHistory ? '▲ Hide edit history' : '▼ Show edit history'}
                  </button>
                  {showHistory && (
                    <div className="space-y-1.5 pt-1">
                      {mostRevised.history.map((t, i) => (
                        <div key={i} className="text-xs text-white/50 bg-white/5 rounded-lg px-3 py-2 line-through">
                          v{i + 1}: "{t}"
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {mostUnpredictable.map((winner, i) => (
                <div key={winner.name} className="card mb-3 border border-cyan-500/30 bg-cyan-500/5 space-y-2 animate-fade-up" style={{ animationDelay: `${0.26 + i * 0.08}s` }}>
                  <p className="text-xs text-cyan-400 uppercase tracking-widest font-medium">
                    🃏 The Joker{mostUnpredictable.length > 1 ? ` ${i + 1}` : ''}
                    {mostUnpredictable.length > 1 && <span className="text-white/30 ml-1">(equal scores)</span>}
                  </p>
                  <p className="text-white/90">
                    <span className="text-white font-medium">{winner.name}</span> kept everyone guessing
                  </p>
                  <p className="text-xs text-white/40">only {winner.count} prediction{winner.count !== 1 ? 's' : ''} about them came true</p>
                </div>
              ))}
              {mrDoesItAll.map((winner, i) => (
                <div key={winner.name} className="card mb-3 border border-emerald-500/30 bg-emerald-500/5 space-y-2 animate-fade-up" style={{ animationDelay: `${0.26 + i * 0.08}s` }}>
                  <p className="text-xs text-emerald-400 uppercase tracking-widest font-medium">
                    ⭐ Star of the Show{mrDoesItAll.length > 1 ? ` ${i + 1}` : ''}
                    {mrDoesItAll.length > 1 && <span className="text-white/30 ml-1">(equal scores)</span>}
                  </p>
                  <p className="text-white/90">
                    <span className="text-white font-medium">{winner.name}</span> had the most predictions come true about them
                  </p>
                  <p className="text-xs text-white/40">{winner.count} prediction{winner.count !== 1 ? 's' : ''} about them happened</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Rankings */}
      <div className="flex items-center gap-3 mb-4 animate-fade-up">
        <div className="flex-1 h-px bg-white/10" />
        <p className="text-xs text-white/30 uppercase tracking-widest font-medium">🏆 Rankings</p>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {entries.length === 0 ? (
        <div className="card text-center py-12">
          <p className="font-display text-3xl mb-3">🏆</p>
          <p className="text-white/50">No scores yet - mark some outcomes first!</p>
        </div>
      ) : !rankingsRevealed ? (
        <button
          onClick={() => reveal(setRankingsRevealing, setRankingsRevealed)}
          disabled={rankingsRevealing}
          className={`w-full card text-center py-6 transition-all ${rankingsRevealing ? 'animate-pulse border-violet/40 bg-violet/5' : 'hover:bg-white/10 hover:border-white/20'}`}
        >
          {rankingsRevealing ? (
            <div className="space-y-1">
              <p className="text-3xl">🥁</p>
              <p className="text-[#a99eff] font-medium text-sm">drum roll...</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-2xl">🏆</p>
              <p className="text-white/50 text-sm">Reveal Rankings</p>
            </div>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => {
            const initials = entry.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const color = AVATAR_COLORS[entry.id % AVATAR_COLORS.length];
            return (
              <div
                key={entry.id}
                className={`card flex items-center gap-4 animate-fade-up overflow-hidden ${
                  i === 0 ? '!border-amber/40 shadow-[0_0_32px_-8px_rgba(255,179,71,0.35),inset_0_1px_0_rgba(255,255,255,0.07)]' : ''
                }`}
                style={{ animationDelay: `${i * 0.07}s` }}
              >
                {i === 0 && (
                  <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-amber/15 blur-3xl pointer-events-none" />
                )}
                <div className={`w-8 text-center font-display font-bold ${i === 0 ? 'text-2xl' : 'text-lg'} text-white/40`}>
                  {MEDALS[i] || `#${entry.rank}`}
                </div>
                <div className={`${color} w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm text-white flex-shrink-0 ${i === 0 ? 'ring-2 ring-amber/60 ring-offset-2 ring-offset-[#15142A]' : ''}`}>
                  {initials}
                </div>
                <div className="flex-1">
                  <p className={`font-medium ${i === 0 ? 'font-display text-lg' : ''}`}>{entry.name}</p>
                  <p className="text-sm text-white/40">
                    {entry.score} prediction{entry.score !== 1 ? 's' : ''} happened
                  </p>
                </div>
                <div className="text-right relative">
                  <p className={`font-display text-2xl font-bold text-amber ${i === 0 ? 'text-glow text-3xl' : ''}`}>{entry.weightedScore}</p>
                  <p className="text-xs text-white/40">{entry.score} correct</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </>
      )}
    </div>
  );
}
