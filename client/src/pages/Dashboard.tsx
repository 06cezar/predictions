import { useState, useEffect } from 'react';

import { api, User, UserRow, Settings } from '../api';
import { Countdown } from '../components/Countdown';
import { PhaseBadge } from '../components/PhaseBadge';
import { UserRow as UserRowComponent } from '../components/UserRow';

interface Props {
  user: User;
  onLogout: () => void;
}

export function Dashboard({ user, onLogout }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.users.list(),
      api.settings.get(),
      api.users.me(),
    ]).then(([userList, s, meData]) => {
      setUsers(userList);
      setSettings(s);
      setMe(meData);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-white/50">Loading...</p>
    </div>
  );

  const phase = settings?.currentPhase || 'submission';
  const deadline = phase === 'submission'
    ? settings?.submissionDeadline
    : phase === 'reveal'
      ? settings?.revealDeadline
      : null;

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center justify-between py-6 mb-6 animate-fade-up">
        <div>
          <h1 className="font-display text-3xl font-bold">Predictions</h1>
          <p className="text-white/40 text-sm mt-1">Welcome back, {user.name}</p>
        </div>
        <PhaseBadge phase={phase} />
      </div>

      {phase === 'done' ? (
        <div className="card mb-6 text-center py-5 animate-fade-up border border-orange/20" style={{ animationDelay: '0.05s' }}>
          <p className="text-2xl mb-1">🏁</p>
          <p className="font-medium text-white/80">Game over - results are in!</p>
          <p className="text-xs text-white/40 mt-1">Check the leaderboard to see who won.</p>
        </div>
      ) : deadline ? (
        <div className="mb-6 animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <Countdown deadline={deadline} label={phase === 'submission' ? 'Submission' : 'Reveal'} />
        </div>
      ) : null}

      {me?.stats && (
        <div className="grid grid-cols-2 gap-3 mb-6 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="card text-center">
            <p className="font-display text-4xl font-bold text-orange">
              {me.stats.predictionsWritten}
            </p>
            <p className="text-white/50 text-sm mt-1">of {me.stats.totalTargets} written</p>
          </div>
          <div className="card text-center">
            <p className="font-display text-4xl font-bold text-amber">
              {me.stats.predictionsReceived}
            </p>
            <p className="text-white/50 text-sm mt-1">predictions about you</p>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between animate-fade-up" style={{ animationDelay: '0.15s' }}>
        <h2 className="font-medium text-white/70">Write predictions for</h2>
        <span className="text-white/40 text-sm">{users.filter(u => u.hasPrediction).length}/{users.length} done</span>
      </div>

      {users.length === 0 ? (
        <div className="card text-center py-12 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <p className="font-display text-2xl mb-2">✨</p>
          <p className="text-white/50">No other users yet - the future is wide open!</p>
        </div>
      ) : (
        <div className="space-y-2 stagger">
          {users.map((u, i) => (
            <UserRowComponent key={u.id} user={u} index={i} />
          ))}
        </div>
      )}

    </div>
  );
}
