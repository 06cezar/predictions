import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Prediction, errorMessage } from '../api';
import { PredictionCard } from '../components/PredictionCard';
import { ChevronLeft, Eye, Flag, Sparkles } from 'lucide-react';
import { StickerIcon } from '../components/Sticker';

export function Reveal() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<string>('reveal');
  const [revealDeadline, setRevealDeadline] = useState<string | null>(null);
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  useEffect(() => {
    Promise.all([api.predictions.aboutMe(), api.settings.get()])
      .then(([preds, s]) => {
        setPredictions(preds);
        setPhase(s.currentPhase);
        setRevealDeadline(s.revealDeadline ?? null);
        if (s.revealDeadline && new Date() >= new Date(s.revealDeadline)) {
          setDeadlinePassed(true);
        }
      })
      .catch(err => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!revealDeadline || deadlinePassed) return;
    const ms = new Date(revealDeadline).getTime() - Date.now();
    if (ms <= 0) {
      setDeadlinePassed(true);
      return;
    }
    const t = setTimeout(() => setDeadlinePassed(true), ms);
    return () => clearTimeout(t);
  }, [revealDeadline, deadlinePassed]);

  const handleOutcome = async (id: number, happened: boolean | null) => {
    try {
      await api.outcomes.mark(id, happened);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-6">
        <Link to="/" className="btn-ghost text-sm px-3">
          <ChevronLeft className="inline-block w-4 h-4 -mt-0.5" /> Back
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold">Predictions About You</h1>
          <p className="text-white/40 text-sm">What others thought would happen</p>
        </div>
      </div>

      {(phase === 'done' || deadlinePassed) && (
        <div className="card mb-4 flex gap-3 items-center border border-orange/20">
          <Flag className="w-6 h-6 shrink-0" />
          <div>
            <p className="font-medium text-sm text-white/90">
              {phase === 'done' ? 'Game over - outcomes are locked' : "Time's up - outcomes are locked"}
            </p>
            <p className="text-xs text-white/40 mt-0.5">You can no longer mark predictions as happened or not.</p>
          </div>
        </div>
      )}

      {phase === 'reveal' && !deadlinePassed && predictions.length > 0 && (
        <div className="rounded-2xl bg-[#E9E1FF] border-2 border-ink shadow-card px-4 py-3 mb-6 flex gap-3 items-start">
          <Eye className="w-5 h-5 mt-0.5 shrink-0 text-lilac" />
          <p className="text-sm text-white/70 leading-relaxed">
            These are the predictions others made about you.{' '}
            <span className="text-white font-medium">Mark each one</span> as happened or not - this affects the final
            leaderboard scores.
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-white/50">Loading...</div>
      ) : error ? (
        <div className="card text-center py-12">
          <p className="text-orange mb-2">Not available yet</p>
          <p className="text-white/50 text-sm">{error}</p>
        </div>
      ) : predictions.length === 0 ? (
        <div className="card text-center py-12">
          <StickerIcon icon={Sparkles} className="mb-3" />
          <p className="text-white font-medium mb-2">No predictions yet</p>
          <p className="text-white/50 text-sm">The future is wide open!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {predictions.map(p => (
            <PredictionCard
              key={p.id}
              prediction={p}
              showOutcome
              onOutcome={phase === 'done' || deadlinePassed ? undefined : handleOutcome}
            />
          ))}
        </div>
      )}
    </div>
  );
}
