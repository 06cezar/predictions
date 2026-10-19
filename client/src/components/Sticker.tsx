import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';

const TONES = {
  yellow: 'bg-[#FFD23F]',
  coral: 'bg-[#FFD3C4]',
  violet: 'bg-[#E9E1FF]',
  mint: 'bg-[#C9F5E3]',
  pink: 'bg-[#FFD6EC]',
  white: 'bg-paper',
};

const SIZES = {
  sm: { box: 'w-10 h-10', icon: 'w-5 h-5' },
  md: { box: 'w-14 h-14', icon: 'w-7 h-7' },
  lg: { box: 'w-20 h-20', icon: 'w-10 h-10' },
};

/** A Lucide icon on a round sticker: the illustration for empty states and headers. */
export function StickerIcon({
  icon: Icon,
  tone = 'yellow',
  size = 'md',
  className = '',
}: {
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full border-2 border-ink text-ink shadow-[2px_2px_0_#1B1A1F] ${TONES[tone]} ${SIZES[size].box} ${className}`}
    >
      <Icon className={SIZES[size].icon} strokeWidth={2.2} />
    </span>
  );
}

/** The app's mark, used on the start, join and about pages. */
export function Logo() {
  return <StickerIcon icon={Sparkles} size="lg" className="-rotate-6" />;
}

const MEDAL_TONES = ['bg-[#FFD23F]', 'bg-[#E4E4E7]', 'bg-[#F4B183]'];

/** First, second and third get a coloured disc; everyone else just the number. */
export function RankBadge({ rank, large = false }: { rank: number; large?: boolean }) {
  const tone = MEDAL_TONES[rank - 1];
  if (!tone) return <span className="font-display font-bold text-white/50">#{rank}</span>;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border-2 border-ink font-display font-bold text-ink ${tone} ${large ? 'w-9 h-9 text-base' : 'w-7 h-7 text-sm'}`}
    >
      {rank}
    </span>
  );
}
