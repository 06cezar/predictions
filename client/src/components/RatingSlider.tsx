import { useState } from 'react';
import { api } from '../api';

interface Props {
  predictionId: number;
  initialScore: number | null;
  avgRating: number | null;
  onRate?: (score: number) => void;
}

export function RatingSlider({ predictionId, initialScore, avgRating, onRate }: Props) {
  const [score, setScore] = useState<number>(initialScore ?? 50);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      await api.ratings.submit(predictionId, score);
      setSaved(true);
      onRate?.(score);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const getColor = (val: number) => {
    if (val >= 70) return 'text-green-400';
    if (val >= 40) return 'text-amber';
    return 'text-orange';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/50">Your rating</span>
      </div>
      <p className="text-xs text-white/30">Rate the probability this prediction will come true (0% = no chance, 100% = certain)</p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={score}
          onChange={e => setScore(parseInt(e.target.value))}
          className="flex-1 accent-orange h-2"
        />
        <span className={`font-display text-xl font-bold w-14 text-right ${getColor(score)}`}>
          {score}%
        </span>
      </div>
      <button
        onClick={handleSubmit}
        disabled={saving}
        className={`btn-primary w-full text-sm ${saved ? 'bg-green-600' : ''}`}
      >
        {saved ? '✓ Saved!' : saving ? 'Saving...' : initialScore !== null ? 'Update Rating' : 'Submit Rating'}
      </button>
      {error && <p className="text-xs text-orange text-center">{error}</p>}
    </div>
  );
}
