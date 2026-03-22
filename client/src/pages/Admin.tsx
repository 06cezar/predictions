import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Settings } from '../api';

type Tab = 'users' | 'predictions' | 'settings';

export function Admin() {
  const [tab, setTab] = useState<Tab>('users');
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminPredictions, setAdminPredictions] = useState<any[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newUserName, setNewUserName] = useState('');
  const [newUserToken, setNewUserToken] = useState('');
  const [advanceConfirm, setAdvanceConfirm] = useState(false);
  const [reverseConfirm, setReverseConfirm] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [expandedPred, setExpandedPred] = useState<number | null>(null);

  useEffect(() => {
    Promise.allSettled([
      api.admin.users(),
      api.admin.predictions(),
      api.admin.settings(),
      api.admin.stats(),
    ]).then(([u, p, s, st]) => {
      if (u.status === 'fulfilled') setAdminUsers(u.value as any[]);
      if (p.status === 'fulfilled') setAdminPredictions(p.value as any[]);
      if (s.status === 'fulfilled') setSettings(s.value as Settings);
      if (st.status === 'fulfilled') setStats(st.value);
    }).finally(() => setLoading(false));
  }, []);

  const handleCreateUser = async () => {
    if (!newUserName.trim()) return;
    try {
      const user = await api.admin.createUser(newUserName.trim()) as any;
      setAdminUsers(prev => [...prev, user]);
      setNewUserToken(user.token);
      setNewUserName('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    await api.admin.deleteUser(id);
    setAdminUsers(prev => prev.filter(u => u.id !== id));
  };

  const handleAdvancePhase = async () => {
    if (!advanceConfirm) { setAdvanceConfirm(true); setReverseConfirm(false); return; }
    try {
      const result = await api.admin.advancePhase() as any;
      setSettings(prev => prev ? { ...prev, currentPhase: result.newPhase } : prev);
      setAdvanceConfirm(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReversePhase = async () => {
    if (!reverseConfirm) { setReverseConfirm(true); setAdvanceConfirm(false); return; }
    try {
      const result = await api.admin.reversePhase() as any;
      setSettings(prev => prev ? { ...prev, currentPhase: result.newPhase } : prev);
      setReverseConfirm(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSettingChange = async (key: string, value: any) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await api.admin.updateSettings({ [key]: value });
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-white/50">Loading...</p></div>;

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-6">
        <Link to="/" className="btn-ghost text-sm px-3">← Back</Link>
        <div>
          <h1 className="font-display text-2xl font-bold">Admin Panel</h1>
          {stats && (
            <p className="text-white/40 text-sm">
              {stats.submissionCount} predictions · {stats.ratingCount} ratings · avg {stats.avgRating ?? '—'}%
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['users', 'predictions', 'settings'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-orange text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="card flex gap-3">
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

          {newUserToken && (
            <div className="bg-green-500/20 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 text-sm">
              New user created! Token: <span className="font-mono font-bold">{newUserToken}</span>
              <button onClick={() => setNewUserToken('')} className="ml-3 text-green-300 hover:text-white">×</button>
            </div>
          )}

          <div className="space-y-2">
            {adminUsers.map(u => (
              <div key={u.id} className="card flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-medium">{u.name} {u.isAdmin && <span className="text-amber text-xs ml-1">Admin</span>}</p>
                  <p className="text-sm text-white/40 font-mono">
                    {u.token.slice(0, 4)}···{u.token.slice(-4)}
                  </p>
                </div>
                <button
                  onClick={() => copyToken(u.token)}
                  className="btn-ghost text-sm"
                >
                  {copiedToken === u.token ? '✓ Copied' : 'Copy Token'}
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
            ))}
          </div>
        </div>
      )}

      {tab === 'predictions' && (
        <div className="space-y-3">
          {adminPredictions.map(p => (
            <div key={p.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex gap-3 text-xs text-white/40 mb-2">
                    <span>✍️ {p.author?.name}</span>
                    <span>→</span>
                    <span>👤 {p.target?.name}</span>
                    {p.editCount > 0 && <span className="text-violet/80">Edited ×{p.editCount}</span>}
                  </div>
                  <p className="text-white/90 text-sm leading-relaxed">{p.currentText}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {p.avgRating !== null && (
                    <p className="font-display font-bold text-amber">{p.avgRating}%</p>
                  )}
                  <p className="text-xs text-white/30">{p.ratingCount} ratings</p>
                </div>
              </div>
              {p.editCount > 0 && (
                <button
                  onClick={() => setExpandedPred(expandedPred === p.id ? null : p.id)}
                  className="text-xs text-white/40 hover:text-white/70"
                >
                  {expandedPred === p.id ? 'Hide history' : 'Show edit history'}
                </button>
              )}
              {expandedPred === p.id && p.history && (
                <div className="border-t border-white/10 pt-3 space-y-2">
                  {p.history.map((h: any) => (
                    <div key={h.id} className="text-xs text-white/40 bg-white/5 rounded-lg p-3">
                      <p className="text-white/60 mb-1">{new Date(h.editedAt).toLocaleString()}</p>
                      <p>{h.oldText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'settings' && settings && (
        <div className="space-y-5">
          <div className="card space-y-4">
            <h3 className="font-medium">Phase Control</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Current Phase</p>
                <p className="font-medium capitalize">{settings.currentPhase}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReversePhase}
                  className={`px-4 py-2 rounded-xl font-medium text-sm transition-colors ${
                    reverseConfirm ? 'bg-violet text-white animate-pulse' : 'btn-ghost'
                  }`}
                >
                  {reverseConfirm ? '← Confirm' : '← Back'}
                </button>
                <button
                  onClick={handleAdvancePhase}
                  className={`px-4 py-2 rounded-xl font-medium text-sm transition-colors ${
                    advanceConfirm ? 'bg-orange text-white animate-pulse' : 'btn-secondary'
                  }`}
                >
                  {advanceConfirm ? 'Confirm →' : 'Advance →'}
                </button>
              </div>
            </div>
          </div>

          <div className="card space-y-4">
            <h3 className="font-medium">Deadlines</h3>
            <div>
              <label className="block text-sm text-white/60 mb-2">Submission Deadline</label>
              <input
                type="datetime-local"
                value={settings.submissionDeadline?.slice(0, 16) || ''}
                onChange={e => handleSettingChange('submissionDeadline', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-2">Reveal Deadline</label>
              <input
                type="datetime-local"
                value={settings.revealDeadline?.slice(0, 16) || ''}
                onChange={e => handleSettingChange('revealDeadline', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="input"
              />
            </div>
          </div>

          <div className="card space-y-4">
            <h3 className="font-medium">Settings</h3>
            <div>
              <label className="block text-sm text-white/60 mb-2">
                Rating Threshold: <span className="text-white font-medium">{settings.ratingThreshold}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={settings.ratingThreshold}
                onChange={e => handleSettingChange('ratingThreshold', parseInt(e.target.value))}
                className="w-full accent-orange"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Auto-advance Phase</p>
                <p className="text-xs text-white/40">Automatically advance when deadline passes</p>
              </div>
              <button
                onClick={() => handleSettingChange('autoAdvancePhase', !settings.autoAdvancePhase)}
                className={`w-12 h-6 rounded-full transition-colors ${settings.autoAdvancePhase ? 'bg-orange' : 'bg-white/20'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${settings.autoAdvancePhase ? 'translate-x-6' : ''}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Admin Override</p>
                <p className="text-xs text-white/40">Allow submissions after deadline</p>
              </div>
              <button
                onClick={() => handleSettingChange('adminOverride', !settings.adminOverride)}
                className={`w-12 h-6 rounded-full transition-colors ${settings.adminOverride ? 'bg-orange' : 'bg-white/20'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${settings.adminOverride ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
