interface Props {
  phase: 'submission' | 'reveal' | 'done';
}

const phaseConfig = {
  submission: { label: 'Submission', color: 'bg-amber/20 text-amber border border-amber/30' },
  reveal: { label: 'Reveal', color: 'bg-violet/20 text-violet border border-violet/30', textColor: 'text-[#a99eff]' },
  done: { label: 'Done', color: 'bg-white/10 text-white/60 border border-white/20' },
};

export function PhaseBadge({ phase }: Props) {
  const config = phaseConfig[phase];
  return (
    <span className={`badge ${config.color} ${(config as any).textColor || ''}`}>
      {phase === 'submission' && '✏️'}
      {phase === 'reveal' && '🔮'}
      {phase === 'done' && '✅'}
      {config.label}
    </span>
  );
}
