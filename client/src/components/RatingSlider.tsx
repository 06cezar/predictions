import { useState } from 'react';
import { api, errorMessage } from '../api';

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
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const getScoreColor = (val: number) => {
    if (val >= 70) return 'text-green-700';
    if (val >= 40) return 'text-amber';
    return 'text-orange';
  };

  const getLabel = (val: number) => {
    if (val <= 10) return 'No chance';
    if (val <= 25) return 'Unlikely';
    if (val <= 45) return 'Doubtful';
    if (val <= 55) return 'Coin flip';
    if (val <= 75) return 'Probable';
    if (val <= 90) return 'Very likely';
    return 'Certain';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-white/40 uppercase tracking-wider">Probability</span>
          {avgRating !== null && (
            <span className="text-xs text-white/40">
              Average: <span className="text-white/60 font-medium">{avgRating}%</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">{getLabel(score)}</span>
          <span className={`font-display text-2xl font-bold leading-none ${getScoreColor(score)}`}>{score}%</span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={score}
        onChange={e => setScore(parseInt(e.target.value))}
        className="w-full"
        style={{ '--p': `${score}%` } as React.CSSProperties}
      />

      <div className="flex justify-between text-xs text-white/20 px-0.5">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving}
        className={`btn-primary w-full text-sm transition-colors ${saved ? '!bg-green-600' : ''}`}
      >
        {saved ? 'Saved!' : saving ? 'Saving...' : initialScore !== null ? 'Update Rating' : 'Submit Rating'}
      </button>
      {error && <p className="text-xs text-orange text-center">{error}</p>}
    </div>
  );
}
