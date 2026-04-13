import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Settings } from '../api';

type Tab = 'users' | 'predictions' | 'settings' | 'bonus' | 'preview' | 'invites';

const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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
  const [phaseConfirm, setPhaseConfirm] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [bonusDoneWarning, setBonusDoneWarning] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [expandedPred, setExpandedPred] = useState<number | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [showAboutMe, setShowAboutMe] = useState(false);
  const [revealedPreds, setRevealedPreds] = useState<Set<number>>(new Set());
  const [editingUser, setEditingUser] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [progressMode, setProgressMode] = useState<'submission' | 'rating' | 'outcomes'>('submission');
  const [customToken, setCustomToken] = useState('');
  const [tokenMode, setTokenMode] = useState<'auto' | 'custom'>('auto');
  const [previewBoard, setPreviewBoard] = useState<any[] | null>(null);
  const [previewHof, setPreviewHof] = useState<Record<string, any> | null>(null);
  const [bonusCats, setBonusCats] = useState<any[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatPoints, setNewCatPoints] = useState(5);
  const [editingCat, setEditingCat] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatPoints, setEditCatPoints] = useState(5);
  const [bonusUsers, setBonusUsers] = useState<any[]>([]);
  const [inviteLinks, setInviteLinks] = useState<any[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  useEffect(() => {
    api.users.me().then(me => setMeId(me.id)).catch(() => {});
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
    api.bonus.get().then(b => {
      setBonusCats(b.categories);
      setBonusUsers(b.users);
    }).catch(() => {});
    api.invite.list().then(setInviteLinks).catch(() => {});
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
    } catch (err: any) {
      alert(err.message);
    }
  };

  const refreshStats = () => {
    api.admin.stats().then(s => setStats(s as any)).catch(() => {});
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm('Delete this user? All their predictions, ratings and outcomes will also be deleted.')) return;
    try {
      await api.admin.deleteUser(id);
      setAdminUsers(prev => prev.filter(u => u.id !== id));
      refreshStats();
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

  const handleDeletePrediction = async (id: number) => {
    if (!confirm('Delete this prediction? This also removes its ratings and outcomes.')) return;
    try {
      await api.admin.deletePrediction(id);
      setAdminPredictions(prev => prev.filter(p => p.id !== id));
      refreshStats();
    } catch (err: any) { alert(err.message); }
  };

  const applyPhase = (newPhase: string) => {
    setSettings(prev => prev ? { ...prev, currentPhase: newPhase as any } : prev);
    if (newPhase === 'submission') setProgressMode('submission');
  };

  const handleAdvancePhase = async () => {
    if (!advanceConfirm) { setAdvanceConfirm(true); setReverseConfirm(false); return; }
    try {
      const result = await api.admin.advancePhase() as any;
      applyPhase(result.newPhase);
      setAdvanceConfirm(false);
    } catch (err: any) { alert(err.message); }
  };

  const handleReversePhase = async () => {
    if (!reverseConfirm) { setReverseConfirm(true); setAdvanceConfirm(false); return; }
    try {
      const result = await api.admin.reversePhase() as any;
      applyPhase(result.newPhase);
      setReverseConfirm(false);
    } catch (err: any) { alert(err.message); }
  };

  const handleSetPhase = async (phase: string) => {
    if (phaseConfirm !== phase) { setPhaseConfirm(phase); return; }
    try {
      const result = await api.admin.setPhase(phase) as any;
      applyPhase(result.newPhase);
      setPhaseConfirm(null);
    } catch (err: any) { alert(err.message); }
  };

  const handleSettingChange = async (key: string, value: any) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await api.admin.updateSettings({ [key]: value });
    if (key === 'anonymousPredictions') {
      const fresh = await api.admin.predictions();
      setAdminPredictions(fresh as any[]);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCreateInvite = async () => {
    try {
      const link = await api.invite.create() as any;
      setInviteLinks(prev => [link, ...prev]);
    } catch (err: any) { alert(err.message); }
  };

  const handleRevokeInvite = async (id: number) => {
    if (!confirm('Revoke this invite link?')) return;
    try {
      await api.invite.revoke(id);
      setInviteLinks(prev => prev.filter(l => l.id !== id));
    } catch (err: any) { alert(err.message); }
  };

  const copyInviteLink = (code: string) => {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(code);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleCreateCat = async () => {
    if (!newCatName.trim()) return;
    try {
      const cat = await api.bonus.createCategory(newCatName.trim(), newCatPoints) as any;
      setBonusCats(prev => [...prev, { ...cat, myVotes: [], tally: undefined, winners: [] }]);
      setNewCatName('');
      setNewCatPoints(5);
    } catch (err: any) { alert(err.message); }
  };

  const handleUpdateCat = async (id: number) => {
    try {
      await api.bonus.updateCategory(id, { name: editCatName.trim(), points: editCatPoints });
      setBonusCats(prev => prev.map(c => c.id === id ? { ...c, name: editCatName.trim(), points: editCatPoints } : c));
      setEditingCat(null);
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteCat = async (id: number) => {
    if (!confirm('Delete this category and all votes for it?')) return;
    try {
      await api.bonus.deleteCategory(id);
      setBonusCats(prev => prev.filter(c => c.id !== id));
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-white/50">Loading...</p></div>;

  return (
    <div className="min-h-screen p-4 pb-24 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-6">
        <Link to="/" className="btn-ghost text-sm px-3">← Back</Link>
        <div>
          <h1 className="font-display text-2xl font-bold">Admin Panel</h1>
          {stats && (
            <p className="text-white/40 text-sm">
              {stats.submissionCount} predictions · {stats.ratingCount} ratings · avg {stats.avgRating ?? '-'}%
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(['users', 'predictions', 'settings', 'bonus', 'preview', 'invites'] as Tab[]).map(t => (
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
          {stats && stats.totalUsers > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { id: 'submission', label: '✍️ Submission' },
                  { id: 'rating', label: '⭐ Rating' },
                  ...((settings?.currentPhase === 'reveal' || settings?.currentPhase === 'done')
                    ? [{ id: 'outcomes', label: '🎯 Outcomes' }]
                    : []),
                ] as { id: 'submission' | 'rating' | 'outcomes'; label: string }[]).map(mode => (
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
              {(() => {
                if (progressMode === 'outcomes') {
                  const marked = stats.markedPredictions ?? 0;
                  const total = stats.submissionCount ?? 0;
                  const done = total > 0 && marked === total;
                  return (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/40 text-xs">predictions with outcome marked</span>
                        <span className="font-medium">
                          <span className={done ? 'text-green-400' : 'text-amber'}>{marked}/{total}</span>
                          <span className="text-white/30 ml-1">marked</span>
                        </span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${done ? 'bg-green-400' : 'bg-amber'}`}
                          style={{ width: `${total > 0 ? (marked / total) * 100 : 0}%` }}
                        />
                      </div>
                    </>
                  );
                }
                const completed = progressMode === 'submission' ? stats.completedUsers : stats.completedRaters;
                const total = stats.totalUsers;
                const done = completed === total;
                return (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/40 text-xs">
                        {progressMode === 'submission' ? 'wrote all predictions' : 'rated all predictions'}
                      </span>
                      <span className="font-medium">
                        <span className={done ? 'text-green-400' : 'text-amber'}>{completed}/{total}</span>
                        <span className="text-white/30 ml-1">complete</span>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${done ? 'bg-green-400' : 'bg-amber'}`}
                        style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
                      />
                    </div>
                  </>
                );
              })()}
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
                  placeholder="e.g. penny-sud"
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
                      {stats && (() => {
                        const arr = progressMode === 'submission' ? stats.userProgress : progressMode === 'rating' ? stats.ratingProgress : stats.outcomesProgress;
                        const p = arr?.find((x: any) => x.id === u.id);
                        if (!p || p.expected === 0) return null;
                        return p.complete
                          ? <span className="text-xs text-green-400 font-normal">✓ Done</span>
                          : <span className="text-xs text-white/30 font-normal">{p.written}/{p.expected}</span>;
                      })()}
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
      )}

      {tab === 'predictions' && (
        <div className="space-y-3">
          {settings?.currentPhase === 'done' && (
            <div className="bg-orange/10 border border-orange/30 rounded-xl px-4 py-3 text-sm text-orange/90">
              ⚠️ Game is in <span className="font-semibold">done</span> phase — deleting predictions will affect leaderboard scores and Hall of Fame results.
            </div>
          )}
          {meId !== null && adminPredictions.some(p => p.target?.id === meId) && (
            <button
              onClick={() => setShowAboutMe(v => !v)}
              className="w-full card text-sm text-white/50 hover:text-white/80 transition-colors text-center py-3"
            >
              {showAboutMe ? '🙈 Hide predictions about you' : `👁️ Show predictions about you (${adminPredictions.filter(p => p.target?.id === meId).length})`}
            </button>
          )}
          {adminPredictions.filter(p => showAboutMe || p.target?.id !== meId).map(p => (
            <div key={p.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex gap-3 text-xs text-white/40 mb-2">
                    <span>✍️ {p.author?.name}</span>
                    <span>→</span>
                    <span>👤 {p.target?.name}</span>
                    {p.editCount > 0 && <span className="text-violet/80">Edited ×{p.editCount}{p.forgivenEdits > 0 && ` (${p.forgivenEdits} forgiven)`}</span>}
                  </div>
                  {!revealedPreds.has(p.id) ? (
                    <div className="flex items-center gap-2">
                      <p className="text-white/30 text-sm">••••••••••••••••</p>
                      <button
                        onClick={() => setRevealedPreds(prev => new Set([...prev, p.id]))}
                        className="text-xs text-amber/60 hover:text-amber px-2 py-0.5 rounded hover:bg-amber/10 transition-colors"
                      >
                        Reveal
                      </button>
                    </div>
                  ) : (
                    <p className="text-white/90 text-sm leading-relaxed">{p.currentText}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="text-right">
                    {p.avgRating !== null && (
                      <p className="font-display font-bold text-amber">{p.avgRating}%</p>
                    )}
                    <p className="text-xs text-white/30">{p.ratingCount} ratings</p>
                  </div>
                  <button
                    onClick={() => handleDeletePrediction(p.id)}
                    className="text-red-400/50 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {p.editCount > 0 && (
                <div className="flex gap-3 items-center">
                  <button
                    onClick={() => setExpandedPred(expandedPred === p.id ? null : p.id)}
                    className="text-xs text-white/40 hover:text-white/70"
                  >
                    {expandedPred === p.id ? 'Hide history' : 'Show edit history'}
                  </button>
                  {p.editCount > (p.forgivenEdits ?? 0) && (
                    <button
                      onClick={async () => {
                        try {
                          const result = await api.admin.forgiveEdit(p.id);
                          setAdminPredictions(prev => prev.map((pr: any) => pr.id === p.id ? { ...pr, forgivenEdits: result.forgivenEdits } : pr));
                        } catch (err: any) { alert(err.message); }
                      }}
                      className="text-xs text-green-400/60 hover:text-green-400 hover:bg-green-500/10 px-2 py-0.5 rounded transition-colors"
                    >
                      Forgive 1 edit
                    </button>
                  )}
                  {(p.forgivenEdits ?? 0) > 0 && (
                    <button
                      onClick={async () => {
                        try {
                          const result = await api.admin.unforgiveEdit(p.id);
                          setAdminPredictions(prev => prev.map((pr: any) => pr.id === p.id ? { ...pr, forgivenEdits: result.forgivenEdits } : pr));
                        } catch (err: any) { alert(err.message); }
                      }}
                      className="text-xs text-red-400/60 hover:text-red-400 hover:bg-red-500/10 px-2 py-0.5 rounded transition-colors"
                    >
                      Unforgive 1 edit
                    </button>
                  )}
                </div>
              )}
              {expandedPred === p.id && p.history && (
                <div className="border-t border-white/10 pt-3 space-y-2">
                  {p.history.map((h: any) => (
                    <div key={h.id} className="text-xs text-white/40 bg-white/5 rounded-lg p-3">
                      <p className="text-white/60 mb-1">{new Date(h.editedAt.replace(' ', 'T') + 'Z').toLocaleString(undefined, { hour12: false })}</p>
                      <p>{!revealedPreds.has(p.id) ? '••••••••••••••••' : h.oldText}</p>
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
            <div className="grid grid-cols-3 gap-3">
              {([
                { id: 'submission', label: 'Submission', emoji: '✍️', color: 'bg-amber/20 border-amber/40 text-amber' },
                { id: 'reveal',     label: 'Reveal',     emoji: '👁️', color: 'bg-violet/20 border-violet/40 text-[#a99eff]' },
                { id: 'done',       label: 'Done',       emoji: '🏁', color: 'bg-orange/20 border-orange/40 text-orange' },
              ] as const).map(({ id, label, emoji, color }) => {
                const isActive = settings.currentPhase === id;
                const isConfirming = phaseConfirm === id;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      if (isActive) return;
                      if (id === 'done' && !settings.bonusActive && !bonusDoneWarning) {
                        setBonusDoneWarning(true);
                        setPhaseConfirm(null);
                      } else {
                        setBonusDoneWarning(false);
                        handleSetPhase(id);
                      }
                    }}
                    onBlur={() => setPhaseConfirm(null)}
                    disabled={isActive}
                    className={`relative flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all font-medium text-sm
                      ${isActive
                        ? `${color} scale-105 shadow-lg cursor-default`
                        : isConfirming
                          ? 'bg-white/20 border-white/40 text-white animate-pulse'
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70 hover:border-white/20'
                      }`}
                  >
                    <span className="text-2xl">{emoji}</span>
                    <span>{isConfirming ? 'Confirm?' : label}</span>
                    {isActive && (
                      <span className="absolute -top-2 -right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center text-navy text-xs font-bold">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
            {bonusDoneWarning && (
              <div className="bg-amber/10 border border-amber/30 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm text-amber font-medium">🎖️ Skip Bonus Round?</p>
                <p className="text-xs text-white/50">Bonus round is not active. Do you want to go to Done without it?</p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={async () => {
                      setBonusDoneWarning(false);
                      try {
                        const result = await api.admin.setPhase('done') as any;
                        applyPhase(result.newPhase);
                      } catch (err: any) { alert(err.message); }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange/20 text-orange hover:bg-orange/30 transition-colors"
                  >
                    Skip bonus → Done
                  </button>
                  <button
                    onClick={() => setBonusDoneWarning(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-white/30 text-center">Click a phase to switch · click again to confirm</p>
          </div>

          <div className="card space-y-4">
            <h3 className="font-medium">Deadlines</h3>
            <div>
              <label className="block text-sm text-white/60 mb-2">Submission Deadline</label>
              <input
                type="datetime-local"
                value={toLocalInput(settings.submissionDeadline)}
                onChange={e => handleSettingChange('submissionDeadline', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-2">Reveal Deadline</label>
              <input
                type="datetime-local"
                value={toLocalInput(settings.revealDeadline)}
                onChange={e => handleSettingChange('revealDeadline', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="input"
              />
            </div>
          </div>

          <div className="card space-y-4">
            <h3 className="font-medium">Settings</h3>
            <div>
              <label className="block text-sm font-medium mb-0.5">
                Rating Threshold: <span className="text-orange font-semibold">{settings.ratingThreshold}%</span>
              </label>
              <p className="text-xs text-white/40 mb-2">Predictions rated above this are considered "likely" - lower ratings score more points</p>
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
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Anonymous Predictions</p>
                <p className="text-xs text-white/40">
                  {settings.anonymousPredictions
                    ? 'Author names are hidden at reveal'
                    : 'Author names are shown at reveal'}
                </p>
              </div>
              <button
                onClick={() => handleSettingChange('anonymousPredictions', !settings.anonymousPredictions)}
                className={`w-12 h-6 rounded-full transition-colors ${settings.anonymousPredictions ? 'bg-violet' : 'bg-white/20'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${settings.anonymousPredictions ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </div>

          <div className="card border border-red-500/20 space-y-3">
            <h3 className="font-medium text-red-400">Danger Zone</h3>
            <p className="text-xs text-white/40">Reset the game - all predictions, ratings and outcomes will be deleted. Users are kept. Phase resets to submission.</p>
            <button
              onClick={async () => {
                if (!resetConfirm) { setResetConfirm(true); return; }
                try {
                  await api.admin.resetGame();
                  setResetConfirm(false);
                  setSettings(prev => prev ? { ...prev, currentPhase: 'submission', submissionDeadline: null, revealDeadline: null } : prev);
                  window.location.reload();
                } catch (err: any) { alert(err.message); }
              }}
              onBlur={() => setResetConfirm(false)}
              className={`w-full py-2.5 rounded-xl font-medium text-sm transition-all ${
                resetConfirm ? 'bg-red-500 text-white animate-pulse' : 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
              }`}
            >
              {resetConfirm ? '⚠️ Click again to confirm reset' : '🗑️ Reset Game'}
            </button>
          </div>

          <div className="card space-y-3">
            <h3 className="font-medium">Export Data</h3>
            <p className="text-xs text-white/40">Download game data as CSV files.</p>
            <div className="flex gap-2">
              <a href="/api/admin/export/predictions.csv" download className="btn-secondary flex-1 text-center text-sm py-2">
                📋 Predictions
              </a>
              <a href="/api/admin/export/scores.csv" download className="btn-secondary flex-1 text-center text-sm py-2">
                🏆 Scores
              </a>
              <a href="/api/admin/export/hof.csv" download className="btn-secondary flex-1 text-center text-sm py-2">
                ✨ Hall of Fame
              </a>
            </div>
            <a href="/api/admin/export/db" download className="btn-secondary w-full text-center text-sm py-2 block">
              🗄️ Full Database (.db)
            </a>
          </div>
        </div>
      )}
      {tab === 'bonus' && (
        <div className="space-y-5">
          {/* Add category form */}
          <div className="card space-y-3">
            <h3 className="font-medium">Add Category</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="e.g. Best Wingman"
                className="input flex-1"
                onKeyDown={e => e.key === 'Enter' && handleCreateCat()}
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={newCatPoints}
                  onChange={e => setNewCatPoints(parseInt(e.target.value) || 1)}
                  min={1}
                  max={100}
                  className="input w-20 text-center"
                />
                <span className="text-xs text-white/40">pts</span>
              </div>
              <button onClick={handleCreateCat} className="btn-primary">Add</button>
            </div>
          </div>

          {/* Bonus active toggle */}
          {settings && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">🎖️ Bonus Round</h3>
                  <p className="text-xs text-white/40 mt-0.5">
                    {settings.bonusActive ? 'Active - users can vote now' : 'Inactive - activate to open voting'}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const result = await api.admin.toggleBonusActive();
                      setSettings(prev => prev ? { ...prev, bonusActive: result.bonusActive } : prev);
                    } catch (err: any) { alert(err.message); }
                  }}
                  className={`w-12 h-6 rounded-full transition-colors ${settings.bonusActive ? 'bg-amber' : 'bg-white/20'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${settings.bonusActive ? 'translate-x-6' : ''}`} />
                </button>
              </div>
            </div>
          )}

          {/* Categories list */}
          {bonusCats.length === 0 ? (
            <div className="card text-center py-8 text-white/30">No categories yet. Add one above.</div>
          ) : (
            <div className="space-y-3">
              {bonusCats.map(cat => {
                // Compute tally for results preview
                const tallyEntries = cat.tally
                  ? Object.entries(cat.tally as Record<string, number>)
                      .map(([id, pts]) => ({ id: parseInt(id), pts, name: bonusUsers.find((u: any) => u.id === parseInt(id))?.name ?? '?' }))
                      .sort((a, b) => b.pts - a.pts)
                  : [];
                const winnerCount = cat.winners?.length ?? 0;
                const pointsEach = winnerCount > 0 ? Math.round((cat.points / winnerCount) * 10) / 10 : cat.points;

                return (
                  <div key={cat.id} className="card space-y-3">
                    {editingCat === cat.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editCatName}
                          onChange={e => setEditCatName(e.target.value)}
                          className="input flex-1 text-sm"
                        />
                        <input
                          type="number"
                          value={editCatPoints}
                          onChange={e => setEditCatPoints(parseInt(e.target.value) || 1)}
                          min={1}
                          className="input w-20 text-center text-sm"
                        />
                        <span className="text-xs text-white/40 self-center">pts</span>
                        <button onClick={() => handleUpdateCat(cat.id)} className="btn-primary text-sm px-3">Save</button>
                        <button onClick={() => setEditingCat(null)} className="btn-ghost text-sm px-3">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <p className="font-medium">{cat.name}</p>
                          <p className="text-xs text-white/40">{cat.points} bonus point{cat.points !== 1 ? 's' : ''} for winner</p>
                        </div>
                        <button
                          onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name); setEditCatPoints(cat.points); }}
                          className="text-sm text-white/40 hover:text-white px-3 py-2"
                        >Edit</button>
                        <button
                          onClick={() => handleDeleteCat(cat.id)}
                          className="text-orange/60 hover:text-orange text-sm px-3 py-2"
                        >Delete</button>
                      </div>
                    )}
                    {tallyEntries.length > 0 && (
                      <div className="border-t border-white/10 pt-2 space-y-1">
                        <p className="text-xs text-white/30 uppercase tracking-wider">Live tally</p>
                        {tallyEntries.slice(0, 3).map((entry, i) => (
                          <div key={entry.id} className={`flex items-center gap-2 text-xs ${cat.winners?.includes(entry.id) ? 'text-amber' : 'text-white/50'}`}>
                            <span className="w-4">{i + 1}.</span>
                            <span className="flex-1">{entry.name}</span>
                            <span>{entry.pts} pts</span>
                            {cat.winners?.includes(entry.id) && winnerCount > 0 && <span className="text-amber">→ +{pointsEach} bonus</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {tab === 'preview' && (
        <div className="space-y-4">
          {/* Score Preview */}
          <div className="card space-y-3">
            <h3 className="font-medium">Score Preview</h3>
            <p className="text-xs text-white/40">Current scores based on outcomes marked so far. Does not affect the real leaderboard.</p>
            <button
              onClick={async () => {
                try {
                  const board = await api.leaderboard.preview() as any[];
                  setPreviewBoard(board);
                } catch (err: any) { alert(err.message); }
              }}
              className="btn-primary w-full"
            >
              🔄 Calculate Scores
            </button>
          </div>

          {previewBoard && (
            <div className="space-y-2">
              {previewBoard.length === 0 ? (
                <div className="card text-center py-8 text-white/40">No scores yet - no outcomes marked.</div>
              ) : previewBoard.map((u: any) => (
                <div key={u.id} className="card flex items-center gap-4">
                  <div className={`font-display text-2xl font-bold w-8 text-center ${u.rank === 1 ? 'text-amber' : u.rank === 2 ? 'text-white/70' : u.rank === 3 ? 'text-orange/70' : 'text-white/30'}`}>
                    {u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : `#${u.rank}`}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-white/40">{u.score} true prediction{u.score !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-bold text-orange text-xl">{u.weightedScore}</p>
                    <p className="text-xs text-white/30">pts</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hall of Fame Preview */}
          <div className="card space-y-3">
            <h3 className="font-medium">Hall of Fame Preview</h3>
            <p className="text-xs text-white/40">Preview all Hall of Fame cards based on current outcomes. Only available in reveal/done phase.</p>
            <button
              onClick={async () => {
                try {
                  const [courageous, miss, controversial, revised, bestFriends, star, joker, lastMinute, first] = await Promise.allSettled([
                    api.leaderboard.mostCourageous(),
                    api.leaderboard.biggestMiss(),
                    api.leaderboard.mostControversial(),
                    api.leaderboard.mostRevised(),
                    api.leaderboard.bestFriends(),
                    api.leaderboard.mrDoesItAll(),
                    api.leaderboard.mostUnpredictable(),
                    api.leaderboard.lastMinute(),
                    api.leaderboard.firstToSubmit(),
                  ]);
                  setPreviewHof({
                    courageous: courageous.status === 'fulfilled' ? courageous.value : null,
                    miss: miss.status === 'fulfilled' ? miss.value : null,
                    controversial: controversial.status === 'fulfilled' ? controversial.value : null,
                    revised: revised.status === 'fulfilled' ? revised.value : null,
                    bestFriends: bestFriends.status === 'fulfilled' ? bestFriends.value : null,
                    star: star.status === 'fulfilled' ? star.value : null,
                    joker: joker.status === 'fulfilled' ? joker.value : null,
                    lastMinute: lastMinute.status === 'fulfilled' ? lastMinute.value : null,
                    first: first.status === 'fulfilled' ? first.value : null,
                  });
                } catch (err: any) { alert(err.message); }
              }}
              className="btn-primary w-full"
            >
              🏆 Preview Hall of Fame
            </button>
          </div>

          {previewHof && (
            <div className="space-y-2">
              {[
                { key: 'courageous', emoji: '🦁', label: 'Most Courageous' },
                { key: 'miss', emoji: '💨', label: 'Biggest Miss' },
                { key: 'controversial', emoji: '🔥', label: 'Most Controversial' },
                { key: 'revised', emoji: '🔄', label: "Can't Make Up Their Mind" },
                { key: 'bestFriends', emoji: '🤝', label: 'Best Friends' },
                { key: 'star', emoji: '⭐', label: 'Star of the Show' },
                { key: 'joker', emoji: '🃏', label: 'The Joker' },
                { key: 'lastMinute', emoji: '⚡', label: 'Last Minute' },
                { key: 'first', emoji: '🌅', label: 'First to Submit' },
              ].map(({ key, emoji, label }) => {
                const val = previewHof[key];
                if (!val || (Array.isArray(val) && val.length === 0)) return (
                  <div key={key} className="card flex items-center gap-3 opacity-40">
                    <span className="text-xl">{emoji}</span>
                    <div>
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-white/40">No data yet</p>
                    </div>
                  </div>
                );
                const names = Array.isArray(val) ? val.map((v: any) => v.name || (v.userA && v.userB ? `${v.userA} & ${v.userB}` : v.names?.join(', ') || '')).join(', ') : val.names?.join(', ') || val.name || val.text || '';
                const detail = Array.isArray(val) ? null : val.avgRating != null ? `${val.avgRating}% avg` : val.count != null ? `${val.count}x` : val.editCount != null ? `${val.editCount} edits` : null;
                return (
                  <div key={key} className="card flex items-center gap-3">
                    <span className="text-xl">{emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-white/60 truncate">{names}</p>
                    </div>
                    {detail && <span className="text-xs text-amber flex-shrink-0">{detail}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {tab === 'invites' && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Invite Links</h3>
                <p className="text-xs text-white/40 mt-0.5">One-use links for new users to join</p>
              </div>
              <button onClick={handleCreateInvite} className="btn-primary text-sm">
                + Generate Link
              </button>
            </div>
          </div>

          {inviteLinks.length === 0 ? (
            <div className="card text-center py-8 text-white/30">No invite links yet. Generate one above.</div>
          ) : (
            <div className="space-y-2">
              {inviteLinks.map(link => {
                const url = `${window.location.origin}/join/${link.code}`;
                const isUsed = !!link.usedBy;
                return (
                  <div key={link.id} className={`card space-y-2 ${isUsed ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {isUsed ? (
                            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">✓ Used</span>
                          ) : (
                            <span className="text-xs bg-amber/20 text-amber px-2 py-0.5 rounded-full">Active</span>
                          )}
                          <span className="text-xs text-white/30">
                            {new Date(link.createdAt.replace(' ', 'T') + 'Z').toLocaleString(undefined, { hour12: false, dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        <p className="text-sm font-mono text-white/60 truncate">{url}</p>
                        {isUsed && link.usedByName && (
                          <p className="text-xs text-white/40 mt-1">Registered: <span className="text-white/60">{link.usedByName}</span></p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {!isUsed && (
                          <>
                            <button
                              onClick={() => copyInviteLink(link.code)}
                              className="btn-ghost text-xs px-3 py-1"
                            >
                              {copiedLink === link.code ? '✓ Copied' : 'Copy Link'}
                            </button>
                            <button
                              onClick={() => handleRevokeInvite(link.id)}
                              className="text-orange/60 hover:text-orange text-xs px-3 py-1 rounded-lg hover:bg-orange/10 transition-colors"
                            >
                              Revoke
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
