import { useState, ReactNode } from 'react';
import type { HallOfFame, PredictionAward } from '../api';
import { parseServerTime } from '../time';
import { ChevronDown, Drama, Handshake, RefreshCw, Rocket, Scale, Skull, Star, Sunrise, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Card colours (written out in full so Tailwind keeps the classes). */
const THEMES = {
  amber: { card: '!border-ink bg-[#FFE7A3]', accent: 'text-amber' },
  orange: { card: '!border-ink bg-[#FFD3C4]', accent: 'text-orange' },
  violet: { card: '!border-ink bg-[#E9E1FF]', accent: 'text-lilac' },
  pink: { card: '!border-ink bg-[#FFD6EC]', accent: 'text-pink-600' },
  rose: { card: '!border-ink bg-[#FFE3F1]', accent: 'text-pink-600' },
  cyan: { card: '!border-ink bg-[#CDF3FF]', accent: 'text-cyan-700' },
  emerald: { card: '!border-ink bg-[#C9F5E3]', accent: 'text-emerald-700' },
  mint: { card: '!border-ink bg-[#DFF7CF]', accent: 'text-emerald-600' },
};
type Theme = (typeof THEMES)[keyof typeof THEMES];

/** One icon per award, shared with the admin preview. */
export const AWARD_ICONS: Record<keyof HallOfFame, LucideIcon> = {
  mostCourageous: Rocket,
  biggestMiss: Skull,
  mostControversial: Scale,
  mostRevised: RefreshCw,
  lastMinute: Zap,
  firstToSubmit: Sunrise,
  starOfTheShow: Star,
  theJoker: Drama,
  bestFriends: Handshake,
};

/** True when at least one award has a winner. */
export function hasWinners(awards: HallOfFame) {
  return Object.values(awards).some(award => (Array.isArray(award) ? award.length > 0 : award !== null));
}

function AwardCard({
  icon: Icon,
  title,
  theme,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  theme: Theme;
  children: ReactNode;
}) {
  return (
    <div data-reveal className={`card mb-3 border ${theme.card} space-y-2`}>
      <p className={`flex items-center gap-1.5 text-xs ${theme.accent} uppercase tracking-widest font-bold`}>
        <Icon className="w-4 h-4 shrink-0" strokeWidth={2.5} />
        <span>{title}</span>
      </p>
      {children}
    </div>
  );
}

/** An award for one prediction: its text, who wrote it about whom, and a detail on the right. */
function PredictionAwardCard({
  icon,
  title,
  theme,
  award,
  detail,
  children,
}: {
  icon: LucideIcon;
  title: string;
  theme: Theme;
  award: PredictionAward;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <AwardCard icon={icon} title={title} theme={theme}>
      <p className="text-white/90 leading-relaxed">"{award.text}"</p>
      <div className="flex items-center justify-between text-xs text-white/40 pt-1">
        <span>
          {award.authorName && (
            <>
              by <span className="text-white/70">{award.authorName}</span>{' '}
            </>
          )}
          about <span className="text-white/70">{award.targetName}</span>
        </span>
        <span className={`${theme.accent} font-medium`}>{detail}</span>
      </div>
      {children}
    </AwardCard>
  );
}

/** An award that can go to several people at once; ties each get a card. */
function WinnerCards<T>({
  winners,
  icon,
  title,
  theme,
  keyOf,
  children,
}: {
  winners: T[];
  icon: LucideIcon;
  title: string;
  theme: Theme;
  keyOf: (winner: T) => string;
  children: (winner: T) => ReactNode;
}) {
  const tied = winners.length > 1;
  return (
    <>
      {winners.map((winner, i) => (
        <AwardCard
          key={keyOf(winner)}
          icon={icon}
          theme={theme}
          title={
            <>
              {title}
              {tied && ` ${i + 1}`}
              {tied && <span className="text-white/30 ml-1">(equal scores)</span>}
            </>
          }
        >
          {children(winner)}
        </AwardCard>
      ))}
    </>
  );
}

function Expandable({ showLabel, hideLabel, children }: { showLabel: string; hideLabel: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(v => !v)} className="text-xs text-white/30 hover:text-white/60 transition-colors">
        <ChevronDown
          className={`inline-block w-3.5 h-3.5 -mt-0.5 mr-1 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        {open ? hideLabel : showLabel}
      </button>
      {open && children}
    </>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;

/** Every Hall of Fame card with a winner, in reveal order. */
export function HallOfFameCards({ awards }: { awards: HallOfFame }) {
  const {
    mostCourageous,
    biggestMiss,
    mostControversial,
    lastMinute,
    firstToSubmit,
    bestFriends,
    mostRevised,
    theJoker,
    starOfTheShow,
  } = awards;

  return (
    <>
      {mostCourageous && (
        <PredictionAwardCard
          icon={AWARD_ICONS.mostCourageous}
          title="Most Courageous Prediction"
          theme={THEMES.amber}
          award={mostCourageous}
          detail={`${mostCourageous.avg}% avg rating`}
        />
      )}
      {biggestMiss && (
        <PredictionAwardCard
          icon={AWARD_ICONS.biggestMiss}
          title="Biggest Miss"
          theme={THEMES.orange}
          award={biggestMiss}
          detail={`${biggestMiss.avg}% avg rating`}
        />
      )}
      {mostControversial && (
        <PredictionAwardCard
          icon={AWARD_ICONS.mostControversial}
          title="Most Controversial Prediction"
          theme={THEMES.violet}
          award={mostControversial}
          detail={`avg ${mostControversial.avg}% - spread ±${mostControversial.stdDev}%`}
        >
          <Expandable
            showLabel={`Show individual ratings (${mostControversial.individualRatings.length})`}
            hideLabel="Hide ratings"
          >
            <div className="flex flex-wrap gap-1.5 pt-1">
              {mostControversial.individualRatings.map((rating, i) => (
                <span key={i} className="px-2 py-0.5 rounded-lg bg-white/10 text-xs text-white/70 font-medium">
                  {rating}%
                </span>
              ))}
            </div>
          </Expandable>
        </PredictionAwardCard>
      )}
      {lastMinute && (
        <PredictionAwardCard
          icon={AWARD_ICONS.lastMinute}
          title="Last Minute"
          theme={THEMES.orange}
          award={lastMinute}
          detail={parseServerTime(lastMinute.updatedAt).toLocaleString(undefined, { hour12: false })}
        />
      )}
      {firstToSubmit && (
        <AwardCard icon={AWARD_ICONS.firstToSubmit} title="First to Submit" theme={THEMES.mint}>
          <p className="text-white/90">
            {firstToSubmit.tied ? (
              <>
                {firstToSubmit.names.map((n, i) => (
                  <span key={n}>
                    {i > 0 && ' & '}
                    <span className="text-white font-medium">{n}</span>
                  </span>
                ))}{' '}
                finished first
              </>
            ) : (
              <>
                <span className="text-white font-medium">{firstToSubmit.names[0]}</span> was the first to finish all
                predictions
              </>
            )}
          </p>
        </AwardCard>
      )}
      <WinnerCards
        winners={bestFriends}
        icon={AWARD_ICONS.bestFriends}
        title="Best Friends"
        theme={THEMES.rose}
        keyOf={p => `${p.userA}-${p.userB}`}
      >
        {pair => (
          <>
            <p className="text-white/90">
              <span className="text-white font-medium">{pair.userA}</span> &{' '}
              <span className="text-white font-medium">{pair.userB}</span> knew each other best
            </p>
            <p className="text-xs text-white/40">both predicted each other correctly</p>
          </>
        )}
      </WinnerCards>
      {mostRevised && (
        <PredictionAwardCard
          icon={AWARD_ICONS.mostRevised}
          title="Can't Make Up Their Mind"
          theme={THEMES.pink}
          award={mostRevised}
          detail={plural(mostRevised.editCount, 'edit')}
        >
          <Expandable showLabel="Show edit history" hideLabel="Hide edit history">
            <div className="space-y-1.5 pt-1">
              {mostRevised.history.map((text, i) => (
                <div key={i} className="text-xs text-white/50 bg-white/5 rounded-lg px-3 py-2 line-through">
                  v{i + 1}: "{text}"
                </div>
              ))}
            </div>
          </Expandable>
        </PredictionAwardCard>
      )}
      <WinnerCards
        winners={theJoker}
        icon={AWARD_ICONS.theJoker}
        title="The Joker"
        theme={THEMES.cyan}
        keyOf={w => w.name}
      >
        {winner => (
          <>
            <p className="text-white/90">
              <span className="text-white font-medium">{winner.name}</span> kept everyone guessing
            </p>
            <p className="text-xs text-white/40">only {plural(winner.count, 'prediction')} about them came true</p>
          </>
        )}
      </WinnerCards>
      <WinnerCards
        winners={starOfTheShow}
        icon={AWARD_ICONS.starOfTheShow}
        title="Star of the Show"
        theme={THEMES.emerald}
        keyOf={w => w.name}
      >
        {winner => (
          <>
            <p className="text-white/90">
              <span className="text-white font-medium">{winner.name}</span> had the most predictions come true about
              them
            </p>
            <p className="text-xs text-white/40">{plural(winner.count, 'prediction')} about them happened</p>
          </>
        )}
      </WinnerCards>
    </>
  );
}
