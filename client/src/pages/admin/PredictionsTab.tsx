import { useState, useEffect } from 'react';
import { api, Settings } from '../../api';
import { parseServerTime } from '../../time';

interface Props {
  phase: Settings['currentPhase'];
  /** A prediction was deleted, so progress stats are stale. */
  onChanged: () => void;
}

export function PredictionsTab({ phase, onChanged }: Props) {
  const [predictions, setPredictions] = useState<any[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [showAboutMe, setShowAboutMe] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    api.users.me().then(me => setMeId(me.id)).catch(() => {});
    api.admin.predictions().then(setPredictions).catch(() => {});
  }, []);

  const setForgiven = (id: number, forgivenEdits: number) =>
    setPredictions(prev => prev.map(p => p.id === id ? { ...p, forgivenEdits } : p));

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this prediction? This also removes its ratings and outcomes.')) return;
    try {
      await api.admin.deletePrediction(id);
      setPredictions(prev => prev.filter(p => p.id !== id));
      onChanged();
    } catch (err: any) { alert(err.message); }
  };

  const forgive = async (id: number, undo: boolean) => {
    try {
      const result = undo ? await api.admin.unforgiveEdit(id) : await api.admin.forgiveEdit(id);
      setForgiven(id, result.forgivenEdits);
    } catch (err: any) { alert(err.message); }
  };

  const aboutMe = predictions.filter(p => p.target?.id === meId);

  return (
    <div className="space-y-3">
      {phase === 'done' && (
        <div className="bg-orange/10 border border-orange/30 rounded-xl px-4 py-3 text-sm text-orange/90">
          ⚠️ Game is in <span className="font-semibold">done</span> phase — deleting predictions will affect leaderboard scores and Hall of Fame results.
        </div>
      )}
      {meId !== null && aboutMe.length > 0 && (
        <button
          onClick={() => setShowAboutMe(v => !v)}
          className="w-full card text-sm text-white/50 hover:text-white/80 transition-colors text-center py-3"
        >
          {showAboutMe ? '🙈 Hide predictions about you' : `👁️ Show predictions about you (${aboutMe.length})`}
        </button>
      )}
      {predictions.filter(p => showAboutMe || p.target?.id !== meId).map(p => (
        <div key={p.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex gap-3 text-xs text-white/40 mb-2">
                <span>✍️ {p.author?.name}</span>
                <span>→</span>
                <span>👤 {p.target?.name}</span>
                {p.editCount > 0 && <span className="text-violet/80">Edited ×{p.editCount}{p.forgivenEdits > 0 && ` (${p.forgivenEdits} forgiven)`}</span>}
              </div>
              {!revealed.has(p.id) ? (
                <div className="flex items-center gap-2">
                  <p className="text-white/30 text-sm">••••••••••••••••</p>
                  <button
                    onClick={() => setRevealed(prev => new Set([...prev, p.id]))}
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
                onClick={() => handleDelete(p.id)}
                className="text-red-400/50 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
          {p.editCount > 0 && (
            <div className="flex gap-3 items-center">
              <button
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                className="text-xs text-white/40 hover:text-white/70"
              >
                {expanded === p.id ? 'Hide history' : 'Show edit history'}
              </button>
              {p.editCount > (p.forgivenEdits ?? 0) && (
                <button
                  onClick={() => forgive(p.id, false)}
                  className="text-xs text-green-400/60 hover:text-green-400 hover:bg-green-500/10 px-2 py-0.5 rounded transition-colors"
                >
                  Forgive 1 edit
                </button>
              )}
              {(p.forgivenEdits ?? 0) > 0 && (
                <button
                  onClick={() => forgive(p.id, true)}
                  className="text-xs text-red-400/60 hover:text-red-400 hover:bg-red-500/10 px-2 py-0.5 rounded transition-colors"
                >
                  Unforgive 1 edit
                </button>
              )}
            </div>
          )}
          {expanded === p.id && p.history && (
            <div className="border-t border-white/10 pt-3 space-y-2">
              {p.history.map((h: any) => (
                <div key={h.id} className="text-xs text-white/40 bg-white/5 rounded-lg p-3">
                  <p className="text-white/60 mb-1">{parseServerTime(h.editedAt).toLocaleString(undefined, { hour12: false })}</p>
                  <p>{!revealed.has(p.id) ? '••••••••••••••••' : h.oldText}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
