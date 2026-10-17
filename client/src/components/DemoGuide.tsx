import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, API_MUTATED, DemoProgress } from '../api';
import { DEMO_GUIDE_CHANGED, demoSettingsSeen, loadFlag, saveFlag } from '../demoGuide';

interface Props {
  gameId: number;
  /** Re-read the logged-in player after starting a fresh demo. */
  onLogin: () => Promise<void>;
}

interface Step {
  title: string;
  detail?: string;
  done: boolean;
  /** Not reachable yet (a later phase). */
  locked?: boolean;
  to?: string;
  skip?: true;
  /** Nice to try, but the guide doesn't wait for it. */
  optional?: true;
}

const COLLAPSED_KEY = 'demo-guide-collapsed';

/** "or wait 12 min" hint for skipping: phases also end on their own (30 min each in a demo). */
function waitHint(deadline: string | null) {
  if (!deadline) return '';
  const minutes = Math.ceil((Date.parse(deadline) - Date.now()) / 60_000);
  return minutes <= 1 ? ', any moment now' : ` (or wait ${minutes} min, it happens on its own)`;
}

function buildSteps(p: DemoProgress, settingsSeen: boolean): Step[] {
  const submission = p.phase === 'submission';
  const done = p.phase === 'done';
  return [
    {
      title: 'Look at the rules',
      detail: 'Rating threshold, anonymous mode, deadlines',
      done: settingsSeen || !submission,
      to: '/admin?tab=settings',
    },
    {
      title: 'Write a prediction about each bot',
      detail: `${p.written} of ${p.writeTotal}`,
      done: p.written >= p.writeTotal || !submission,
      to: '/',
    },
    {
      title: "Rate the bots' predictions",
      detail: p.rateTotal === 0 ? 'Opens up once you write about someone' : `${p.rated} of ${p.rateTotal}`,
      done: (p.rateTotal > 0 && p.rated >= p.rateTotal) || !submission,
      to: '/rate',
    },
    {
      title: 'Skip to the reveal',
      detail: 'The bots rate your predictions and the deadline passes' + (submission ? waitHint(p.nextDeadline) : ''),
      done: !submission,
      skip: true,
    },
    {
      title: 'Mark what came true about you',
      detail: `${p.marked} of ${p.markTotal}`,
      done: p.marked >= p.markTotal || done,
      locked: submission,
      to: '/reveal',
    },
    {
      title: 'Bonus round',
      detail: p.bonusTotal > 0 && p.bonusVoted >= p.bonusTotal
        ? 'Voted. Winners get bonus points'
        : p.bonusActive
          ? 'Vote on silly categories like "most likely to become famous"'
          : 'Optional, for extra laughs (or not 🙂): switch it on in Admin → Bonus, then vote',
      done: p.bonusTotal > 0 && p.bonusVoted >= p.bonusTotal,
      locked: done,
      to: p.bonusActive ? '/bonus' : '/admin?tab=bonus',
      optional: true,
    },
    {
      title: 'Skip to the results',
      detail: 'The reveal deadline passes' + (p.phase === 'reveal' ? waitHint(p.nextDeadline) : ''),
      done,
      locked: submission,
      skip: true,
    },
    {
      title: 'See the leaderboard and Hall of Fame',
      done: false,
      locked: !done,
      to: '/leaderboard',
    },
  ];
}

/** Step-by-step guide shown at the top of every page in a demo game. */
export function DemoGuide({ gameId, onLogin }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<DemoProgress | null>(null);
  const [settingsSeen, setSettingsSeen] = useState(() => demoSettingsSeen(gameId));
  // Collapsed by default on phones, where the full list fills the screen
  const [collapsed, setCollapsed] = useState(() => loadFlag(COLLAPSED_KEY, window.innerWidth < 640));
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api.demo.progress().then(setProgress).catch(() => {});
    setSettingsSeen(demoSettingsSeen(gameId));
  }, [gameId]);

  useEffect(refresh, [refresh, location.pathname, location.search]);
  useEffect(() => {
    // Keeps the countdown fresh and notices when a phase ends on its own
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    window.addEventListener(API_MUTATED, refresh);
    window.addEventListener(DEMO_GUIDE_CHANGED, refresh);
    return () => {
      window.removeEventListener(API_MUTATED, refresh);
      window.removeEventListener(DEMO_GUIDE_CHANGED, refresh);
    };
  }, [refresh]);

  if (!progress) return null;

  const steps = buildSteps(progress, settingsSeen);
  const currentIndex = steps.findIndex(s => !s.done && !s.locked && !s.optional);
  const current = steps[currentIndex];
  // Skipping ahead is always allowed, even before finishing this phase's steps
  const canSkip = steps.some(s => s.skip && !s.done && !s.locked);
  const finished = progress.phase === 'done';

  const toggle = () => {
    setCollapsed(c => {
      saveFlag(COLLAPSED_KEY, !c);
      return !c;
    });
  };

  const skip = async () => {
    if (progress.phase === 'reveal' && progress.marked < progress.markTotal) {
      const left = progress.markTotal - progress.marked;
      if (!confirm(`You haven't marked ${left} prediction${left === 1 ? '' : 's'} about you yet. Unmarked ones count as not happened. Skip anyway?`)) return;
    }
    setBusy(true);
    try {
      const { newPhase } = await api.demo.skip();
      navigate(newPhase === 'reveal' ? '/reveal' : '/leaderboard');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startOver = async () => {
    setBusy(true);
    try {
      await api.demo.start();
      await onLogin();
      navigate('/');
    } catch (err: any) {
      alert(err.message);
      setBusy(false);
    }
  };

  const until = new Date(progress.expiresAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4">
      <div className="rounded-xl border border-lilac/25 bg-violet/15 px-4 py-3 text-sm text-white/80">
        <div className="flex items-center gap-3">
          <p className="flex-1 min-w-0">
            <span className="font-medium text-lilac">🧪 Demo round</span>
            <span className="text-white/50"> · you're the admin, the other four are bots</span>
            {collapsed && current && (
              <span className="block text-white/70 truncate">
                Next: {current.title}{current.detail && !current.skip ? ` (${current.detail})` : ''}
              </span>
            )}
          </p>
          {collapsed && canSkip && (
            <button onClick={skip} disabled={busy} className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap">⏭ Skip</button>
          )}
          <button onClick={toggle} className="text-xs text-white/50 hover:text-white whitespace-nowrap">
            {collapsed ? 'Show steps' : 'Hide'}
          </button>
        </div>

        {!collapsed && (
          <ol className="mt-3 space-y-1.5">
            {steps.map((step, i) => {
              const isCurrent = i === currentIndex;
              const marker = step.done ? '✓' : step.skip ? '⏭' : step.optional ? '★'
                : String(steps.slice(0, i + 1).filter(s => !s.skip && !s.optional).length);
              return (
                <li
                  key={step.title}
                  className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${isCurrent ? 'bg-white/10' : ''} ${step.locked ? 'opacity-40' : ''}`}
                >
                  <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                    step.done ? 'bg-green-500/25 text-green-300' : isCurrent ? 'bg-orange text-white' : 'bg-white/10 text-white/60'
                  }`}>
                    {marker}
                  </span>
                  <div className="flex-1 min-w-0">
                    {step.to && !step.locked ? (
                      <Link to={step.to} className={`hover:underline ${step.done ? 'text-white/50' : 'text-white'}`}>{step.title}</Link>
                    ) : (
                      <span className={step.done ? 'text-white/50' : 'text-white'}>{step.title}</span>
                    )}
                    {step.detail && <span className="block text-xs text-white/40">{step.detail}</span>}
                  </div>
                  {step.skip && !step.done && !step.locked && (
                    <button onClick={skip} disabled={busy} className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap">
                      {busy ? 'Skipping...' : '⏭ Skip ahead'}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {!collapsed && (
          <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/45">
            {finished && (
              <button onClick={startOver} disabled={busy} className="text-amber hover:underline">🔁 Start a fresh demo</button>
            )}
            <Link to="/about" className="text-lilac hover:underline">How does the game work?</Link>
            <span>Private to you, deleted on {until}.</span>
          </div>
        )}
      </div>
    </div>
  );
}
