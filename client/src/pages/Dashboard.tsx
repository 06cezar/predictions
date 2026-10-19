import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { api, AppNotification, User, UserRow, PublicSettings } from '../api';
import { Countdown } from '../components/Countdown';
import { PhaseBadge } from '../components/PhaseBadge';
import { UserRow as UserRowComponent } from '../components/UserRow';
import { Award, Bell, ClipboardCheck, Flag, Sparkles, Target, TriangleAlert } from 'lucide-react';
import { StickerIcon } from '../components/Sticker';

interface Props {
  user: User;
}

/** The icon in front of a notification, by its type. */
function NotificationIcon({ type }: { type: string }) {
  const Icon = type === 'outcome_marked' ? ClipboardCheck : type === 'token_conflict' ? TriangleAlert : Target;
  return <Icon className="w-4 h-4 mt-0.5 shrink-0" />;
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
      <div className="flex items-center justify-between py-6 mb-6">
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
          className="card mb-4 text-center py-4 border border-amber/20 hover:border-amber/40 transition-colors block"
        >
          <StickerIcon icon={Award} size="sm" className="mb-1" />
          <p className="font-medium text-white/80">Bonus Round is live!</p>
          <p className="text-xs text-white/40 mt-1">
            {phase === 'done' ? 'See bonus round results' : 'Vote in each category'}
          </p>
        </Link>
      )}

      {phase === 'done' ? (
        <div className="card mb-6 text-center py-5 border border-orange/20">
          <StickerIcon icon={Flag} size="sm" tone="mint" className="mb-1" />
          <p className="font-medium text-white/80">Game over - results are in!</p>
          <p className="text-xs text-white/40 mt-1">Check the leaderboard to see who won.</p>
        </div>
      ) : deadline ? (
        <div className="mb-6">
          <Countdown
            deadline={deadline}
            label={phase === 'submission' ? 'Submission' : 'Reveal'}
            warnings={!settings?.isDemo}
          />
        </div>
      ) : null}

      {notifs.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-wider font-medium">
            <Bell className="inline-block w-4 h-4 -mt-0.5 mr-1.5" />
            Notifications
          </p>
          {notifs.map(n => (
            <div
              key={n.id}
              className={`rounded-xl px-4 py-3 border text-sm flex items-center gap-2 ${n.read ? 'bg-white/3 border-white/8 text-white/40' : 'bg-orange/10 border-orange/20 text-white/80'}`}
            >
              <NotificationIcon type={n.type} />
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
        <div className="grid grid-cols-2 gap-3 mb-6">
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

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-white/70">Write predictions for</h2>
        <span className="text-white/40 text-sm">
          {users.filter(u => u.hasPrediction).length}/{users.length} done
        </span>
      </div>

      {users.length === 0 ? (
        <div className="card text-center py-12">
          <StickerIcon icon={Sparkles} className="mb-2" />
          <p className="text-white/50">No other users yet - the future is wide open!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <UserRowComponent key={u.id} user={u} />
          ))}
        </div>
      )}
    </div>
  );
}
