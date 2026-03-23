import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, Prediction, Settings } from '../api';

interface UserInfo {
  id: number;
  name: string;
  hasPrediction: boolean;
  avgRating: number | null;
}

export function Predict() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [targetUser, setTargetUser] = useState<UserInfo | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [text, setText] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      api.users.list(),
      api.predictions.mine(),
      api.admin.settings().catch(() => null),
    ]).then(([users, mine, s]) => {
      const target = users.find(u => u.id === parseInt(userId!));
      if (!target) { navigate('/'); return; }
      setTargetUser(target);

      const existingPred = mine.find(p => p.targetId === parseInt(userId!));
      if (existingPred) {
        setPrediction(existingPred);
        setText(existingPred.currentText);
      }
      setSettings(s);
    }).finally(() => setLoading(false));
  }, [userId, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !targetUser) return;
    setSaving(true);
    setError('');

    try {
      if (prediction) {
        await api.predictions.update(prediction.id, text.trim());
      } else {
        await api.predictions.create(targetUser.id, text.trim());
      }
      setSaved(true);
      setTimeout(() => { setSaved(false); navigate('/'); }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const isSubmissionClosed = settings && settings.currentPhase !== 'submission' && !settings.adminOverride;
  const threshold = settings?.ratingThreshold ?? 40;
  const showLowRatingWarning = prediction && prediction.avgRating !== null && prediction.avgRating > threshold;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-white/50">Loading...</p></div>;

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-6">
        <Link to="/" className="btn-ghost text-sm px-3">← Back</Link>
        <h1 className="font-display text-2xl font-bold">
          Predict {targetUser?.name}
        </h1>
      </div>

      {isSubmissionClosed && (
        <div className="bg-orange/20 border border-orange/30 rounded-xl px-4 py-3 mb-4 text-orange text-sm">
          Submission period has ended. Predictions are locked.
        </div>
      )}

      {showLowRatingWarning && (
        <div className="bg-amber/20 border border-amber/30 rounded-xl px-4 py-3 mb-4 text-amber text-sm">
          ⚠️ This prediction is rated high ({prediction.avgRating}%) - everyone thinks it'll happen, so you'll score fewer points if it does.
        </div>
      )}

      {prediction && (
        <div className="mb-4 text-sm text-white/40">
          {prediction.editCount > 0 && `Edited ${prediction.editCount} time${prediction.editCount !== 1 ? 's' : ''} · `}
          Last updated {new Date(prediction.updatedAt).toLocaleDateString()}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`What do you predict for ${targetUser?.name}'s future?`}
          disabled={!!isSubmissionClosed}
          rows={6}
          className="input resize-none text-base leading-relaxed"
        />

        {error && <p className="text-orange text-sm">{error}</p>}

        <button
          type="submit"
          disabled={saving || !text.trim() || !!isSubmissionClosed}
          className={`btn-primary w-full ${saved ? 'bg-green-600' : ''}`}
        >
          {saved ? '✓ Saved!' : saving ? 'Saving...' : prediction ? 'Update Prediction' : 'Save Prediction'}
        </button>
      </form>

      {prediction?.avgRating !== null && prediction?.avgRating !== undefined && (
        <div className="mt-6 card">
          <p className="text-white/50 text-sm mb-1">Community rating</p>
          <p className="font-display text-3xl font-bold text-amber">{prediction.avgRating}%</p>
        </div>
      )}
    </div>
  );
}
