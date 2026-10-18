import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { api, AppNotification, User, UserRow, PublicSettings } from '../api';
import { Countdown } from '../components/Countdown';
import { PhaseBadge } from '../components/PhaseBadge';
import { UserRow as UserRowComponent } from '../components/UserRow';

interface Props {
  user: User;
}

export function Dashboard({ user }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);

  useEffect(() => {
    Promise.all([api.users.list(), api.settings.get(), api.users.me(), api.notifications.get()])
      .then(([userList, s, meData, n]) => {
        setUsers(userList);
        setSettings(s);
        setMe(meData);
        setNotifs(n.items);
        if (n.unread > 0) api.notifications.readAll().catch(() => {});
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/50">Loading...</p>
      </div>
    );

  const phase = settings?.currentPhase || 'submission';
  const bonusActive = settings?.bonusActive ?? false;
  const deadline =
    phase === 'submission' ? settings?.submissionDeadline : phase === 'reveal' ? settings?.revealDeadline : null;

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center justify-between py-6 mb-6 animate-fade-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-glow">{user.game?.name ?? 'Predictions'}</h1>
          <p className="text-white/40 text-sm mt-1">
            Welcome back, <span className="text-amber/80 font-medium">{user.name}</span>
          </p>
        </div>
        <PhaseBadge phase={phase} bonusActive={bonusActive} />
      </div>

      {bonusActive && (
        <Link
          to="/bonus"
          className="card mb-4 text-center py-4 animate-fade-up border border-amber/20 hover:border-amber/40 transition-colors block"
          style={{ animationDelay: '0.04s' }}
        >
          <p className="text-2xl mb-1">🎖️</p>
          <p className="font-medium text-white/80">Bonus Round is live!</p>
          <p className="text-xs text-white/40 mt-1">
            {phase === 'done' ? 'See bonus round results →' : 'Vote in each category →'}
          </p>
        </Link>
      )}

      {phase === 'done' ? (
        <div
          className="card mb-6 text-center py-5 animate-fade-up border border-orange/20"
          style={{ animationDelay: '0.05s' }}
        >
          <p className="text-2xl mb-1">🏁</p>
          <p className="font-medium text-white/80">Game over - results are in!</p>
          <p className="text-xs text-white/40 mt-1">Check the leaderboard to see who won.</p>
        </div>
      ) : deadline ? (
        <div className="mb-6 animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <Countdown
            deadline={deadline}
            label={phase === 'submission' ? 'Submission' : 'Reveal'}
            warnings={!settings?.isDemo}
          />
        </div>
      ) : null}

      {notifs.length > 0 && (
        <div className="mb-6 animate-fade-up space-y-2" style={{ animationDelay: '0.08s' }}>
          <p className="text-xs text-white/40 uppercase tracking-wider font-medium">🔔 Notifications</p>
          {notifs.map(n => (
            <div
              key={n.id}
              className={`rounded-xl px-4 py-3 border text-sm flex items-center gap-2 ${n.read ? 'bg-white/3 border-white/8 text-white/40' : 'bg-orange/10 border-orange/20 text-white/80'}`}
            >
              <span>{n.type === 'outcome_marked' ? '📋' : n.type === 'token_conflict' ? '⚠️' : '🎯'}</span>
              <span className="flex-1">{n.message}</span>
              <button
                onClick={() => {
                  api.notifications.dismiss(n.id).catch(() => {});
                  setNotifs(prev => prev.filter(x => x.id !== n.id));
                }}
                className="text-white/30 hover:text-white/70 transition-colors text-base leading-none flex-shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {me?.stats && (
        <div className="grid grid-cols-2 gap-3 mb-6 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="card text-center">
            <p className="font-display text-4xl font-bold text-orange">{me.stats.predictionsWritten}</p>
            <p className="text-white/50 text-sm mt-1">of {me.stats.totalTargets} written</p>
          </div>
          <div className="card text-center">
            <p className="font-display text-4xl font-bold text-amber">{me.stats.predictionsReceived}</p>
            <p className="text-white/50 text-sm mt-1">predictions about you</p>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between animate-fade-up" style={{ animationDelay: '0.15s' }}>
        <h2 className="font-medium text-white/70">Write predictions for</h2>
        <span className="text-white/40 text-sm">
          {users.filter(u => u.hasPrediction).length}/{users.length} done
        </span>
      </div>

      {users.length === 0 ? (
        <div className="card text-center py-12 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <p className="font-display text-2xl mb-2">✨</p>
          <p className="text-white/50">No other users yet - the future is wide open!</p>
        </div>
      ) : (
        <div className="space-y-2 stagger">
          {users.map(u => (
            <UserRowComponent key={u.id} user={u} />
          ))}
        </div>
      )}
    </div>
  );
}
