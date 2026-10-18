import { useState, useEffect } from 'react';

interface Props {
  deadline: string | null;
  label: string;
  /** Show the "last day" / "less than 2 hours" banners (off in demos, whose phases last minutes). */
  warnings?: boolean;
}

function formatTime(ms: number) {
  if (ms <= 0) return { display: "Time's up!", warning: null };

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let display = '';
  if (days > 0) display = `${days}d ${hours}h ${minutes}m`;
  else if (hours > 0) display = `${hours}h ${minutes}m ${seconds}s`;
  else if (minutes > 0) display = `${minutes}m ${seconds}s`;
  else display = `${seconds}s`;

  let warning: 'day' | 'hours' | null = null;
  if (ms < 2 * 60 * 60 * 1000) warning = 'hours';
  else if (ms < 24 * 60 * 60 * 1000) warning = 'day';

  return { display, warning };
}

export function Countdown({ deadline, label, warnings = true }: Props) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!deadline) return;

    const update = () => {
      setTimeLeft(new Date(deadline).getTime() - Date.now());
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (!deadline) return null;

  const { display, warning: timeWarning } = formatTime(timeLeft);
  const warning = warnings ? timeWarning : null;

  return (
    <div>
      {warning === 'hours' && (
        <div className="bg-orange/20 border border-orange/30 rounded-xl px-4 py-3 mb-3 text-orange text-sm font-medium">
          ⚠️ Less than 2 hours remaining!
        </div>
      )}
      {warning === 'day' && (
        <div className="bg-amber/20 border border-amber/30 rounded-xl px-4 py-3 mb-3 text-amber text-sm font-medium">
          ⏰ Last day! {label} closes soon.
        </div>
      )}
      <div className="card overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber/10 blur-2xl pointer-events-none" />
        <p className="text-white/50 text-xs uppercase tracking-widest mb-1">{label} closes in</p>
        <p className="font-display text-3xl font-bold text-amber text-glow tabular-nums">{display}</p>
      </div>
    </div>
  );
}
