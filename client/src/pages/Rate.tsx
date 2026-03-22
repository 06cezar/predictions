import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Prediction } from '../api';
import { PredictionCard } from '../components/PredictionCard';

export function Rate() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.predictions.toRate()
      .then(setPredictions)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-6">
        <Link to="/" className="btn-ghost text-sm px-3">← Back</Link>
        <h1 className="font-display text-2xl font-bold">Rate Predictions</h1>
      </div>

      {loading ? (
        <div className="text-center py-12 text-white/50">Loading...</div>
      ) : predictions.length === 0 ? (
        <div className="card text-center py-12">
          <p className="font-display text-3xl mb-3">🌟</p>
          <p className="text-white font-medium mb-2">All caught up!</p>
          <p className="text-white/50 text-sm">No predictions to rate right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {predictions.map(p => (
            <PredictionCard key={p.id} prediction={p} showRating />
          ))}
        </div>
      )}
    </div>
  );
}
