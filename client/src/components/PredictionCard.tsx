import type { Prediction } from '../api';
import { RatingSlider } from './RatingSlider';
import { useState } from 'react';

interface Props {
  prediction: Prediction;
  showRating?: boolean;
  showOutcome?: boolean;
  onOutcome?: (id: number, happened: boolean | null) => void;
  onRated?: (id: number, score: number) => void;
}

export function PredictionCard({ prediction, showRating = false, showOutcome = false, onOutcome, onRated }: Props) {
  const [myRating, setMyRating] = useState(prediction.myRating ?? null);
  const [outcome, setOutcome] = useState(prediction.outcome);

  const isEdited = prediction.editCount > 0;

  const handleOutcome = (happened: boolean | null) => {
    setOutcome(happened === null ? null : { happened, markedAt: new Date().toISOString() });
    onOutcome?.(prediction.id, happened);
  };

  const isRated = myRating !== null;

  return (
    <div className={`card space-y-4 transition-all ${showRating ? 'border-l-4 border-l-violet/50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {prediction.targetName && (
            <p className="text-xs text-white/40 uppercase tracking-wider mb-2">About {prediction.targetName}</p>
          )}
          {prediction.authorName && (
            <p className="text-xs text-amber/70 uppercase tracking-wider mb-2">✍️ {prediction.authorName}</p>
          )}
          <p className="text-white/90 leading-relaxed">{prediction.currentText}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {isEdited && (
            <span className="badge bg-violet/20 text-[#a99eff] border border-violet/30 text-xs">Edited ×{prediction.editCount}</span>
          )}
          {showRating && isRated && (
            <span className="badge bg-green-500/20 text-green-400 border border-green-500/30 text-xs">✓ Rated</span>
          )}
        </div>
      </div>

      {prediction.avgRating !== null && !showRating && (
        <div className="flex items-center gap-2 text-sm text-white/50">
          <span>Avg rating:</span>
          <span className="text-white font-medium">{prediction.avgRating}%</span>
        </div>
      )}

      {showRating && (
        <div className="border-t border-white/10 pt-4">
          <RatingSlider
            predictionId={prediction.id}
            initialScore={myRating}
            avgRating={prediction.avgRating}
            onRate={score => { setMyRating(score); onRated?.(prediction.id, score); }}
          />
        </div>
      )}

      {showOutcome && (
        <div className="border-t border-white/10 pt-4">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Did this happen?</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleOutcome(true)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                outcome?.happened === true ? 'bg-green-500 text-white' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              ✅ Happened
            </button>
            <button
              onClick={() => handleOutcome(false)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                outcome?.happened === false ? 'bg-red-500 text-white' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              ❌ Didn't happen
            </button>
            <button
              onClick={() => handleOutcome(null)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                outcome === null || outcome === undefined ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              ⏳ Pending
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
