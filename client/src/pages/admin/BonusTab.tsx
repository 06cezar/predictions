import { useState, useEffect } from 'react';
import { api, BonusCategory, Settings, errorMessage } from '../../api';
import { Toggle } from './shared';

interface Props {
  settings: Settings;
  onChanged: (changes: Partial<Settings>) => void;
}

export function BonusTab({ settings, onChanged }: Props) {
  const [categories, setCategories] = useState<BonusCategory[]>([]);
  const [players, setPlayers] = useState<{ id: number; name: string }[]>([]);
  const [newName, setNewName] = useState('');
  const [newPoints, setNewPoints] = useState(5);
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPoints, setEditPoints] = useState(5);

  useEffect(() => {
    api.bonus
      .get()
      .then(b => {
        setCategories(b.categories);
        setPlayers(b.users);
      })
      .catch(() => {});
  }, []);

  const toggleActive = async () => {
    try {
      const result = await api.admin.toggleBonusActive();
      onChanged({ bonusActive: result.bonusActive });
    } catch (err) {
      alert(errorMessage(err));
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const cat = await api.bonus.createCategory(newName.trim(), newPoints);
      setCategories(prev => [...prev, { ...cat, myVotes: [], tally: undefined, winners: [] }]);
      setNewName('');
      setNewPoints(5);
    } catch (err) {
      alert(errorMessage(err));
    }
  };

  const handleUpdate = async (id: number) => {
    try {
      await api.bonus.updateCategory(id, { name: editName.trim(), points: editPoints });
      setCategories(prev => prev.map(c => (c.id === id ? { ...c, name: editName.trim(), points: editPoints } : c)));
      setEditing(null);
    } catch (err) {
      alert(errorMessage(err));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this category and all votes for it?')) return;
    try {
      await api.bonus.deleteCategory(id);
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      alert(errorMessage(err));
    }
  };

  return (
    <div className="space-y-5">
      <div className="card space-y-3">
        <h3 className="font-medium">Add Category</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Most likely to move abroad"
            className="input flex-1"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={newPoints}
              onChange={e => setNewPoints(parseInt(e.target.value) || 0)}
              min={-100}
              max={100}
              className="input w-20 text-center"
            />
            <span className="text-xs text-white/40">pts</span>
          </div>
          <button onClick={handleCreate} className="btn-primary">
            Add
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">🎖️ Bonus Round</h3>
            <p className="text-xs text-white/40 mt-0.5">
              {settings.bonusActive ? 'Active - users can vote now' : 'Inactive - activate to open voting'}
            </p>
          </div>
          <Toggle on={settings.bonusActive} onClick={toggleActive} color="bg-amber" />
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="card text-center py-8 text-white/30">No categories yet. Add one above.</div>
      ) : (
        <div className="space-y-3">
          {categories.map(cat => {
            const tallyEntries = cat.tally
              ? Object.entries(cat.tally as Record<string, number>)
                  .map(([id, pts]) => ({
                    id: parseInt(id),
                    pts,
                    name: players.find(u => u.id === parseInt(id))?.name ?? '?',
                  }))
                  .sort((a, b) => b.pts - a.pts)
              : [];
            const winnerCount = cat.winners?.length ?? 0;
            const pointsEach = winnerCount > 0 ? Math.round((cat.points / winnerCount) * 10) / 10 : cat.points;

            return (
              <div key={cat.id} className="card space-y-3">
                {editing === cat.id ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="input flex-1 text-sm"
                    />
                    <input
                      type="number"
                      value={editPoints}
                      onChange={e => setEditPoints(parseInt(e.target.value) || 0)}
                      min={-100}
                      className="input w-20 text-center text-sm"
                    />
                    <span className="text-xs text-white/40 self-center">pts</span>
                    <button onClick={() => handleUpdate(cat.id)} className="btn-primary text-sm px-3">
                      Save
                    </button>
                    <button onClick={() => setEditing(null)} className="btn-ghost text-sm px-3">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="font-medium">{cat.name}</p>
                      <p className="text-xs text-white/40">
                        {cat.points < 0
                          ? `${Math.abs(cat.points)} point penalty for winner`
                          : `${cat.points} bonus point${cat.points !== 1 ? 's' : ''} for winner`}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditing(cat.id);
                        setEditName(cat.name);
                        setEditPoints(cat.points);
                      }}
                      className="text-sm text-white/40 hover:text-white px-3 py-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="text-orange/60 hover:text-orange text-sm px-3 py-2"
                    >
                      Delete
                    </button>
                  </div>
                )}
                {tallyEntries.length > 0 && (
                  <div className="border-t border-white/10 pt-2 space-y-1">
                    <p className="text-xs text-white/30 uppercase tracking-wider">Live tally</p>
                    {tallyEntries.slice(0, 3).map((entry, i) => (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-2 text-xs ${cat.winners?.includes(entry.id) ? 'text-amber' : 'text-white/50'}`}
                      >
                        <span className="w-4">{i + 1}.</span>
                        <span className="flex-1">{entry.name}</span>
                        <span>{entry.pts} pts</span>
                        {cat.winners?.includes(entry.id) && winnerCount > 0 && (
                          <span className={cat.points < 0 ? 'text-orange' : 'text-amber'}>
                            {cat.points < 0 ? `→ ${pointsEach}` : `→ +${pointsEach}`} bonus
                          </span>
                        )}
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
  );
}
