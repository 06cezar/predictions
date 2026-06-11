import type { Prediction } from '../api';
import { RatingSlider } from './RatingSlider';
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

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
  const [animating, setAnimating] = useState<boolean | null | undefined>(undefined);
  const [animPos, setAnimPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const isEdited = prediction.editCount > 0;

  const handleOutcome = (happened: boolean | null) => {
    if (happened !== null) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) setAnimPos({ top: rect.top + rect.height / 2 - 24, left: rect.right + 16 });
      setAnimating(happened);
      setTimeout(() => { setAnimating(undefined); setAnimPos(null); }, 900);
    }
    setOutcome(happened === null ? null : { happened, markedAt: new Date().toISOString() });
    onOutcome?.(prediction.id, happened);
  };

  const isRated = myRating !== null;

  return (
    <div ref={cardRef} className={`card space-y-4 transition-all ${showRating ? 'border-l-4 border-l-violet/50' : ''}`}>
      {animating !== undefined && animPos && createPortal(
        <div className="fixed pointer-events-none z-50" style={{ top: animPos.top, left: animPos.left }}>
          <span className="animate-outcome-reveal text-4xl select-none">
            {animating ? '✅' : '❌'}
          </span>
        </div>,
        document.body
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {prediction.authorName && (
            <p className="text-xs text-amber/80 uppercase tracking-wider mb-1 font-semibold">✍️ {prediction.authorName}</p>
          )}
          {prediction.targetName && (
            <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
              About <span className="text-white/60 font-medium">{prediction.targetName}</span>
            </p>
          )}
          <p className="text-white/90 leading-relaxed">{prediction.currentText}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {isEdited && (
            <span className="badge bg-violet/20 text-lilac border border-violet/30 text-xs">Edited ×{prediction.editCount}</span>
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
          <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
            {onOutcome ? 'Did this happen?' : 'Outcome'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onOutcome && handleOutcome(true)}
              disabled={!onOutcome}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                outcome?.happened === true
                  ? 'bg-gradient-to-b from-green-400 to-green-600 text-white shadow-[0_4px_16px_-4px_rgba(34,197,94,0.5)]'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              ✅ Happened
            </button>
            <button
              onClick={() => onOutcome && handleOutcome(false)}
              disabled={!onOutcome}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                outcome?.happened === false
                  ? 'bg-gradient-to-b from-red-400 to-red-600 text-white shadow-[0_4px_16px_-4px_rgba(239,68,68,0.5)]'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              ❌ Didn't happen
            </button>
            <button
              onClick={() => onOutcome && handleOutcome(null)}
              disabled={!onOutcome}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                outcome === null || outcome === undefined ? 'bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' : 'bg-white/10 hover:bg-white/20'
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
