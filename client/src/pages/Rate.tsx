import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Prediction } from '../api';
import { PredictionCard } from '../components/PredictionCard';

export function Rate() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [myPredictionsCount, setMyPredictionsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<string>('submission');

  useEffect(() => {
    Promise.all([api.predictions.toRate(), api.settings.get(), api.predictions.mine()])
      .then(([preds, s, mine]) => {
        setPredictions(preds);
        setPhase(s.currentPhase);
        setMyPredictionsCount(mine.length);
      })
      .finally(() => setLoading(false));
  }, []);

  // Poll phase every 10s so UI updates if admin changes phase while user is on this page
  useEffect(() => {
    const interval = setInterval(() => {
      api.settings
        .get()
        .then(s => setPhase(s.currentPhase))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const rated = predictions.filter(p => p.myRating !== null).length;

  const handleRated = async (id: number, score: number) => {
    setPredictions(prev => prev.map(p => (p.id === id ? { ...p, myRating: score } : p)));
    const fresh = await api.predictions.toRate();
    setPredictions(prev =>
      prev.map(p => {
        const updated = fresh.find(f => f.id === p.id);
        return updated ? { ...p, avgRating: updated.avgRating } : p;
      }),
    );
  };

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-4">
        <Link to="/" className="btn-ghost text-sm px-3">
          ← Back
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold">Rate Predictions</h1>
          {predictions.length > 0 && (
            <p className="text-white/40 text-xs mt-0.5">
              {rated} out of {predictions.length} rated
            </p>
          )}
        </div>
      </div>

      {phase !== 'submission' && (
        <div className="card mb-4 flex gap-3 items-center border border-orange/20">
          <span className="text-2xl">🔒</span>
          <div>
            <p className="font-medium text-sm text-white/90">Rating is closed</p>
            <p className="text-xs text-white/40 mt-0.5">Predictions can only be rated during the submission phase.</p>
          </div>
        </div>
      )}

      {predictions.length > 0 && phase === 'submission' && (
        <div className="rounded-2xl bg-violet/10 border border-violet/20 px-4 py-3 mb-6 flex gap-3 items-start">
          <span className="text-lg mt-0.5">🎯</span>
          <p className="text-sm text-white/70 leading-relaxed">
            For each prediction, rate{' '}
            <span className="text-white font-medium">how likely you think it is to come true</span> - 0% means no
            chance, 100% means certain. Bolder (lower) ratings score more if they're right.
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-white/50">Loading...</div>
      ) : predictions.length === 0 ? (
        <div className="card text-center py-12">
          {myPredictionsCount === 0 ? (
            <>
              <p className="font-display text-3xl mb-3">✍️</p>
              <p className="text-white font-medium mb-2">Write your predictions first</p>
              <p className="text-white/50 text-sm">
                You can only rate predictions about people you've already written a prediction for.
              </p>
              <Link to="/" className="btn-secondary mt-4 inline-block text-sm px-4 py-2">
                Go write predictions →
              </Link>
            </>
          ) : (
            <>
              <p className="font-display text-3xl mb-3">🌟</p>
              <p className="text-white font-medium mb-2">All caught up!</p>
              <p className="text-white/50 text-sm">No predictions to rate right now.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {predictions.map(p => (
            <PredictionCard key={p.id} prediction={p} showRating onRated={handleRated} />
          ))}
        </div>
      )}
    </div>
  );
}
