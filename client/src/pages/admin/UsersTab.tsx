import { useState, useEffect } from 'react';
import { api, Settings } from '../../api';
import { useCopied } from '../../hooks/useCopied';

type ProgressMode = 'submission' | 'rating' | 'outcomes';

interface Props {
  settings: Settings;
  stats: any;
  /** Players were added or removed, so progress stats are stale. */
  onChanged: () => void;
}

export function UsersTab({ settings, stats, onChanged }: Props) {
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserToken, setNewUserToken] = useState('');
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [progressMode, setProgressMode] = useState<ProgressMode>('submission');
  const [customToken, setCustomToken] = useState('');
  const [tokenMode, setTokenMode] = useState<'auto' | 'custom'>('auto');
  const { copied: copiedToken, copy: copyToken } = useCopied();

  useEffect(() => {
    api.admin.users().then(setAdminUsers).catch(() => {});
  }, []);

  const handleCreateUser = async () => {
    if (!newUserName.trim()) return;
    if (tokenMode === 'custom' && !customToken.trim()) return;
    try {
      const user = await api.admin.createUser(newUserName.trim(), tokenMode === 'custom' ? customToken.trim() : undefined) as any;
      setAdminUsers(prev => [...prev, user]);
      setNewUserToken(user.token);
      setNewUserName('');
      setCustomToken('');
      onChanged();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Delete this user? All their predictions, ratings and outcomes will also be deleted.')) return;
    try {
      await api.admin.deleteUser(id);
      setAdminUsers(prev => prev.filter(u => u.id !== id));
      onChanged();
    } catch (err: any) { alert(err.message); }
  };

  const handleRenameUser = async (id: number) => {
    if (!editName.trim()) return;
    try {
      const updated = await api.admin.updateUser(id, { name: editName.trim() }) as any;
      setAdminUsers(prev => prev.map(u => u.id === id ? { ...u, name: updated.name } : u));
      setEditingUser(null);
    } catch (err: any) { alert(err.message); }
  };

  const handleRegenerateToken = async (id: number) => {
    if (!confirm('Regenerate token? The user will need the new token to log in.')) return;
    try {
      const updated = await api.admin.updateUser(id, { regenerateToken: true }) as any;
      setAdminUsers(prev => prev.map(u => u.id === id ? { ...u, token: updated.token } : u));
      setNewUserToken(updated.token);
      setEditingUser(null);
    } catch (err: any) { alert(err.message); }
  };

  const revealed = settings.currentPhase === 'reveal' || settings.currentPhase === 'done';
  const modes: { id: ProgressMode; label: string }[] = [
    { id: 'submission', label: '✍️ Submission' },
    { id: 'rating', label: '⭐ Rating' },
    ...(revealed ? [{ id: 'outcomes' as const, label: '🎯 Outcomes' }] : []),
  ];

  return (
    <div className="space-y-4">
      {stats && stats.totalUsers > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {modes.map(mode => (
              <button
                key={mode.id}
                onClick={() => setProgressMode(mode.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  progressMode === mode.id ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/60'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {progressMode === 'outcomes' ? (
            <ProgressBar
              label="predictions with outcome marked"
              done={stats.markedPredictions ?? 0}
              total={stats.submissionCount ?? 0}
              unit="marked"
            />
          ) : (
            <ProgressBar
              label={progressMode === 'submission' ? 'wrote all predictions' : 'rated all predictions'}
              done={progressMode === 'submission' ? stats.completedUsers : stats.completedRaters}
              total={stats.totalUsers}
              unit="complete"
            />
          )}
        </div>
      )}
      <div className="card space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            value={newUserName}
            onChange={e => setNewUserName(e.target.value)}
            placeholder="New user name"
            className="input flex-1"
            onKeyDown={e => e.key === 'Enter' && handleCreateUser()}
          />
          <button onClick={handleCreateUser} className="btn-primary">Add User</button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {(['auto', 'custom'] as const).map(m => (
              <button
                key={m}
                onClick={() => setTokenMode(m)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  tokenMode === m ? 'bg-white/20 text-white' : 'text-white/30 hover:text-white/60'
                }`}
              >
                {m === 'auto' ? '🎲 Auto token' : '✏️ Custom token'}
              </button>
            ))}
          </div>
          {tokenMode === 'custom' && (
            <input
              type="text"
              value={customToken}
              onChange={e => setCustomToken(e.target.value)}
              placeholder="e.g. brave-owl-4821"
              className="input flex-1 text-sm font-mono"
            />
          )}
        </div>
      </div>

      {newUserToken && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 text-sm">
          New user created! Token: <span className="font-mono font-bold">{newUserToken}</span>
          <button onClick={() => setNewUserToken('')} className="ml-3 text-green-300 hover:text-white">×</button>
        </div>
      )}

      <div className="space-y-2">
        {adminUsers.map(u => (
          <div key={u.id} className="card space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="font-medium flex items-center gap-2">
                  {u.name}
                  {u.isAdmin && <span className="text-amber text-xs">Admin</span>}
                  {stats && <PlayerProgress stats={stats} mode={progressMode} userId={u.id} />}
                </p>
                <p className="text-sm text-white/40 font-mono">
                  {u.token.slice(0, 4)}···{u.token.slice(-4)}
                </p>
              </div>
              <button onClick={() => copyToken(u.token)} className="btn-ghost text-sm">
                {copiedToken === u.token ? '✓ Copied' : 'Copy Token'}
              </button>
              <button
                onClick={() => { setEditingUser(editingUser === u.id ? null : u.id); setEditName(u.name); }}
                className="text-white/40 hover:text-white text-sm px-3 py-2"
              >
                {editingUser === u.id ? '✕' : 'Edit'}
              </button>
              {!u.isAdmin && (
                <button
                  onClick={() => handleDeleteUser(u.id)}
                  className="text-orange/60 hover:text-orange text-sm px-3 py-2"
                >
                  Delete
                </button>
              )}
            </div>
            {editingUser === u.id && (
              <div className="border-t border-white/10 pt-3 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRenameUser(u.id)}
                    className="input flex-1 text-sm"
                    placeholder="New name"
                  />
                  <button
                    onClick={() => handleRenameUser(u.id)}
                    disabled={!editName.trim() || editName.trim() === u.name}
                    className="btn-primary text-sm px-4 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Rename
                  </button>
                </div>
                <button
                  onClick={() => handleRegenerateToken(u.id)}
                  className="text-left text-xs text-white/40 hover:text-orange transition-colors"
                >
                  🔄 Regenerate token
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ label, done, total, unit }: { label: string; done: number; total: number; unit: string }) {
  const complete = total > 0 && done === total;
  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/40 text-xs">{label}</span>
        <span className="font-medium">
          <span className={complete ? 'text-green-400' : 'text-amber'}>{done}/{total}</span>
          <span className="text-white/30 ml-1">{unit}</span>
        </span>
      </div>
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${complete ? 'bg-green-400' : 'bg-amber'}`}
          style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
        />
      </div>
    </>
  );
}

function PlayerProgress({ stats, mode, userId }: { stats: any; mode: ProgressMode; userId: number }) {
  const rows = mode === 'submission' ? stats.userProgress : mode === 'rating' ? stats.ratingProgress : stats.outcomesProgress;
  const p = rows?.find((x: any) => x.id === userId);
  if (!p || p.expected === 0) return null;
  return p.complete
    ? <span className="text-xs text-green-400 font-normal">✓ Done</span>
    : <span className="text-xs text-white/30 font-normal">{p.written}/{p.expected}</span>;
}
