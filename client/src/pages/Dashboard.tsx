import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

  const handleLogout = async () => {
    await api.auth.logout();
    onLogout();
    navigate('/login');
  };

  useEffect(() => {
    Promise.all([
      api.users.list(),
      api.admin.settings().catch(() => null),
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
  const deadline = phase === 'submission' ? settings?.submissionDeadline : settings?.revealDeadline;

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center justify-between py-6 mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Predictions</h1>
          <p className="text-white/40 text-sm mt-1">Welcome back, {user.name}</p>
        </div>
        <PhaseBadge phase={phase} />
      </div>

      {deadline && (
        <div className="mb-6">
          <Countdown deadline={deadline} label={phase === 'submission' ? 'Submission' : 'Reveal'} />
        </div>
      )}

      {me?.stats && (
        <div className="grid grid-cols-2 gap-3 mb-6">
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

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-white/70">Write predictions for</h2>
        <span className="text-white/40 text-sm">{users.filter(u => u.hasPrediction).length}/{users.length} done</span>
      </div>

      {users.length === 0 ? (
        <div className="card text-center py-12">
          <p className="font-display text-2xl mb-2">✨</p>
          <p className="text-white/50">No other users yet — the future is wide open!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u, i) => (
            <UserRowComponent key={u.id} user={u} index={i} />
          ))}
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-navy/95 backdrop-blur border-t border-white/10 flex">
        <Link to="/" className="flex-1 py-4 text-center text-xs text-orange font-medium">Home</Link>
        <Link to="/rate" className="flex-1 py-4 text-center text-xs text-white/50 font-medium">Rate</Link>
        {phase !== 'submission' && (
          <Link to="/reveal" className="flex-1 py-4 text-center text-xs text-white/50 font-medium">Reveal</Link>
        )}
        <Link to="/leaderboard" className="flex-1 py-4 text-center text-xs text-white/50 font-medium">Board</Link>
        {user.isAdmin && (
          <Link to="/admin" className="flex-1 py-4 text-center text-xs text-white/50 font-medium">Admin</Link>
        )}
        <button onClick={handleLogout} className="flex-1 py-4 text-center text-xs text-white/30 font-medium hover:text-orange transition-colors">
          Log out
        </button>
      </nav>
    </div>
  );
}
