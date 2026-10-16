import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Settings } from '../api';
import { UsersTab } from './admin/UsersTab';
import { PredictionsTab } from './admin/PredictionsTab';
import { SettingsTab } from './admin/SettingsTab';
import { BonusTab } from './admin/BonusTab';
import { PreviewTab } from './admin/PreviewTab';
import { InvitesTab } from './admin/InvitesTab';

const TABS = ['users', 'predictions', 'settings', 'bonus', 'preview', 'invites'] as const;
type Tab = typeof TABS[number];

/**
 * Admin panel for the player's own game. Holds what several tabs share (the
 * game's settings and progress stats); each tab loads the rest itself.
 */
export function Admin() {
  const [tab, setTab] = useState<Tab>('users');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refreshStats = () => {
    api.admin.stats().then(setStats).catch(() => {});
  };

  useEffect(() => {
    Promise.allSettled([api.admin.settings(), api.admin.stats()]).then(([s, st]) => {
      if (s.status === 'fulfilled') setSettings(s.value);
      if (st.status === 'fulfilled') setStats(st.value);
    }).finally(() => setLoading(false));
  }, []);

  /** Reflect changes the server already made. */
  const applyChanges = (changes: Partial<Settings>) => {
    setSettings(prev => prev ? { ...prev, ...changes } : prev);
    if (changes.currentPhase) refreshStats();
  };

  /** Save changes, showing them straight away. */
  const updateSettings = async (changes: Partial<Settings>) => {
    applyChanges(changes);
    try {
      await api.admin.updateSettings(changes);
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-white/50">Loading...</p></div>;
  if (!settings) return <div className="min-h-screen flex items-center justify-center"><p className="text-white/50">Could not load the admin panel.</p></div>;

  return (
    <div className="min-h-screen p-4 pb-24 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-6">
        <Link to="/" className="btn-ghost text-sm px-3">← Back</Link>
        <div>
          <h1 className="font-display text-2xl font-bold">{settings.name} · Admin</h1>
          {stats && (
            <p className="text-white/40 text-sm">
              {stats.submissionCount} predictions · {stats.ratingCount} ratings · avg {stats.avgRating ?? '-'}%
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
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

      {tab === 'users' && <UsersTab settings={settings} stats={stats} onChanged={refreshStats} />}
      {tab === 'predictions' && <PredictionsTab phase={settings.currentPhase} onChanged={refreshStats} />}
      {tab === 'settings' && <SettingsTab settings={settings} onUpdate={updateSettings} onChanged={applyChanges} />}
      {tab === 'bonus' && <BonusTab settings={settings} onChanged={applyChanges} />}
      {tab === 'preview' && <PreviewTab />}
      {tab === 'invites' && <InvitesTab />}
    </div>
  );
}
