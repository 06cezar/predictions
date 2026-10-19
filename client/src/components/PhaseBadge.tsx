import { Award, Eye, Flag, PenLine } from 'lucide-react';
interface Props {
  phase: 'submission' | 'reveal' | 'done';
  bonusActive?: boolean;
}

const phaseConfig = {
  submission: {
    label: 'Submission',
    color: 'bg-amber/15 text-amber border border-amber/30 shadow-[0_0_24px_-6px_rgba(255,179,71,0.4)]',
    dot: 'bg-amber',
    icon: PenLine,
    live: true,
  },
  reveal: {
    label: 'Reveal',
    color: 'bg-violet/15 text-lilac border border-violet/40 shadow-[0_0_24px_-6px_rgba(59,47,245,0.5)]',
    dot: 'bg-lilac',
    icon: Eye,
    live: true,
  },
  done: {
    label: 'Done',
    color: 'bg-white/8 text-white/60 border border-white/15',
    dot: 'bg-white/40',
    icon: Flag,
    live: false,
  },
};

export function PhaseBadge({ phase, bonusActive }: Props) {
  const config = phaseConfig[phase];
  return (
    <span
      className={`badge text-sm px-3.5 py-2 sm:text-base sm:px-5 sm:py-2.5 flex-shrink-0 ${config.color} !border-ink`}
    >
      <span className="relative flex h-2 w-2">
        {config.live && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-60 animate-ping`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dot}`} />
      </span>
      <config.icon className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.4} />
      {config.label}
      {bonusActive && <Award className="ml-1 w-4 h-4 sm:w-5 sm:h-5 text-amber" strokeWidth={2.4} />}
    </span>
  );
}
