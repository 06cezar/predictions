interface Props {
  phase: 'submission' | 'reveal' | 'done';
  bonusActive?: boolean;
}

const phaseConfig = {
  submission: { label: 'Submission', color: 'bg-amber/20 text-amber border-2 border-amber/40', emoji: '✏️' },
  reveal:     { label: 'Reveal',     color: 'bg-violet/20 text-[#a99eff] border-2 border-violet/40', emoji: '🔮' },
  done:       { label: 'Done',       color: 'bg-white/10 text-white/60 border-2 border-white/20', emoji: '✅' },
};

export function PhaseBadge({ phase, bonusActive }: Props) {
  const config = phaseConfig[phase];
  return (
    <span className={`badge text-base px-5 py-2.5 ${config.color} animate-fade-in`}>
      <span className="text-lg">{config.emoji}</span>
      {config.label}
      {bonusActive && <span className="ml-1 text-amber">🎖️</span>}
    </span>
  );
}
