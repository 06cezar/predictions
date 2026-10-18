import { useState, useEffect, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, HallOfFame, LeaderboardEntry, ScoringTiers } from '../api';
import { HallOfFameCards, hasWinners } from '../components/HallOfFame';

const AVATAR_COLORS = ['bg-orange', 'bg-violet', 'bg-amber/80', 'bg-cyan-500', 'bg-pink-500', 'bg-emerald-500'];
const MEDALS = ['🥇', '🥈', '🥉'];

type Reveal = 'hidden' | 'drumroll' | 'shown';

/** Results stay behind a button; clicking plays a short drum roll first. */
function useDrumRoll() {
  const [state, setState] = useState<Reveal>('hidden');
  const start = () => {
    setState('drumroll');
    setTimeout(() => setState('shown'), 1800);
  };
  return [state, start] as const;
}

function RevealButton({
  state,
  onClick,
  icon,
  label,
  rollClass,
  rollText,
}: {
  state: Reveal;
  onClick: () => void;
  icon: string;
  label: string;
  /** Border and background while the drum rolls. */
  rollClass: string;
  rollText: string;
}) {
  const rolling = state === 'drumroll';
  return (
    <button
      onClick={onClick}
      disabled={rolling}
      className={`w-full card text-center py-6 transition-all ${rolling ? `animate-pulse ${rollClass}` : 'hover:bg-white/10 hover:border-white/20'}`}
    >
      {rolling ? (
        <div className="space-y-1">
          <p className="text-3xl">🥁</p>
          <p className={`${rollText} font-medium text-sm`}>drum roll...</p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-2xl">{icon}</p>
          <p className="text-white/50 text-sm">{label}</p>
        </div>
      )}
    </button>
  );
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4 animate-fade-up">
      <div className="flex-1 h-px bg-white/10" />
      <p className="text-xs text-white/30 uppercase tracking-widest font-medium">{children}</p>
      <div className="flex-1 h-px bg-white/10" />
    </div>
  );
}

const pts = (n: number) => (
  <span className="text-amber font-medium">
    {n} pt{n !== 1 ? 's' : ''}
  </span>
);

function ScoringRules({ tiers, className }: { tiers: ScoringTiers; className: string }) {
  const { tier1, tier2, tier3, threshold } = tiers;
  return (
    <div className={`rounded-2xl bg-white/5 border border-white/10 px-4 py-3 space-y-1.5 ${className}`}>
      <p className="text-sm font-medium text-white/80">🏆 How scoring works</p>
      <p className="text-xs text-white/40">
        Points go to the person who <span className="text-white/60">wrote</span> the prediction, not the one it's about.
      </p>
      <ul className="text-xs text-white/50 space-y-1">
        <li>
          · Predictions that <span className="text-white/70 font-medium">didn't come true score 0</span> - bonuses and
          penalties only apply to correct predictions.
        </li>
        <li>
          · <span className="text-white/70 font-medium">Score</span> - raw count of predictions that came true.
        </li>
        <li>
          · <span className="text-white/70 font-medium">Weighted score</span> - the actual ranking. The lower the avg
          rating on a correct prediction, the more points:
        </li>
        <li className="pl-3">
          under {tier1}% → {pts(5)} · {tier1}-{tier2}% → {pts(4)} · {tier2}-{tier3}% → {pts(3)} · {tier3}-{threshold}% →{' '}
          {pts(2)} · {threshold}%+ → {pts(1)}
        </li>
        <li>
          · Each edit costs <span className="text-orange font-medium">-0.5 pts</span>, minimum 0.5 pts - only counts if
          the prediction came true.
        </li>
      </ul>
    </div>
  );
}

function RankingRow({ entry, place }: { entry: LeaderboardEntry; place: number }) {
  const first = place === 0;
  const initials = entry.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const color = AVATAR_COLORS[entry.id % AVATAR_COLORS.length];
  return (
    <div
      className={`card flex items-center gap-4 animate-fade-up overflow-hidden ${
        first
          ? '!border-amber/40 shadow-[0_0_32px_-8px_rgba(255,179,71,0.35),inset_0_1px_0_rgba(255,255,255,0.07)]'
          : ''
      }`}
      style={{ animationDelay: `${place * 0.07}s` }}
    >
      {first && (
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-amber/15 blur-3xl pointer-events-none" />
      )}
      <div className={`w-8 text-center font-display font-bold ${first ? 'text-2xl' : 'text-lg'} text-white/40`}>
        {MEDALS[place] || `#${entry.rank}`}
      </div>
      <div
        className={`${color} w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm text-white flex-shrink-0 ${first ? 'ring-2 ring-amber/60 ring-offset-2 ring-offset-[#15142A]' : ''}`}
      >
        {initials}
      </div>
      <div className="flex-1">
        <p className={`font-medium ${first ? 'font-display text-lg' : ''}`}>{entry.name}</p>
        <p className="text-sm text-white/40">
          {entry.score} prediction{entry.score !== 1 ? 's' : ''} happened
        </p>
      </div>
      <div className="text-right relative">
        <p className={`font-display text-2xl font-bold text-amber ${first ? 'text-glow text-3xl' : ''}`}>
          {entry.weightedScore}
        </p>
        <p className="text-xs text-white/40">{entry.score} correct</p>
      </div>
    </div>
  );
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [awards, setAwards] = useState<HallOfFame | null>(null);
  const [tiers, setTiers] = useState<ScoringTiers | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [hofReveal, revealHof] = useDrumRoll();
  const [rankingsReveal, revealRankings] = useDrumRoll();

  useEffect(() => {
    api.settings
      .get()
      .then(s => setTiers(s.scoringTiers))
      .catch(() => {});
    Promise.all([api.leaderboard.get(), api.leaderboard.hallOfFame()])
      .then(([board, hof]) => {
        setEntries(board);
        setAwards(hof);
      })
      .catch(() => setLocked(true)) // the results are not out yet
      .finally(() => setLoading(false));
  }, []);

  const header = (
    <div className="flex items-center gap-4 py-6 mb-6">
      <Link to="/" className="btn-ghost text-sm px-3">
        ← Back
      </Link>
      <h1 className="font-display text-2xl font-bold flex-1">Leaderboard</h1>
      {rankingsReveal === 'shown' && entries.length > 0 && (
        <a href="/api/leaderboard/export.csv" download className="btn-secondary text-sm px-4 py-2">
          ↓ Export
        </a>
      )}
    </div>
  );

  if (locked)
    return (
      <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
        {header}
        <div className="card text-center py-12 space-y-3">
          <p className="text-4xl">🔒</p>
          <p className="font-medium text-white/80">Results are not out yet</p>
          <p className="text-sm text-white/40">The leaderboard will be revealed when the game is done.</p>
        </div>
        {tiers && <ScoringRules tiers={tiers} className="mt-6" />}
      </div>
    );

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      {header}

      {loading ? (
        <div className="text-center py-12 text-white/50">Loading...</div>
      ) : (
        <>
          {tiers && <ScoringRules tiers={tiers} className="mb-6" />}

          {awards && hasWinners(awards) && (
            <div className="mb-6">
              <Divider>✨ Hall of Fame</Divider>
              {hofReveal === 'shown' ? (
                <HallOfFameCards awards={awards} />
              ) : (
                <RevealButton
                  state={hofReveal}
                  onClick={revealHof}
                  icon="🥁"
                  label="Reveal Hall of Fame"
                  rollClass="border-amber/40 bg-amber/5"
                  rollText="text-amber"
                />
              )}
            </div>
          )}

          <Divider>🏆 Rankings</Divider>
          {entries.length === 0 ? (
            <div className="card text-center py-12">
              <p className="font-display text-3xl mb-3">🏆</p>
              <p className="text-white/50">No scores yet - mark some outcomes first!</p>
            </div>
          ) : rankingsReveal === 'shown' ? (
            <div className="space-y-3">
              {entries.map((entry, i) => (
                <RankingRow key={entry.id} entry={entry} place={i} />
              ))}
            </div>
          ) : (
            <RevealButton
              state={rankingsReveal}
              onClick={revealRankings}
              icon="🏆"
              label="Reveal Rankings"
              rollClass="border-violet/40 bg-violet/5"
              rollText="text-[#a99eff]"
            />
          )}
        </>
      )}
    </div>
  );
}
