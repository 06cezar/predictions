import type { Settings } from '../../api';

export type SettingsUpdate = (changes: Partial<Settings>) => Promise<void>;

/** ISO timestamp → value for an <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Toggle({ on, onClick, color = 'bg-orange' }: { on: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`w-12 h-6 rounded-full transition-colors shrink-0 ${on ? color : 'bg-white/20'}`}
    >
      <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${on ? 'translate-x-6' : ''}`} />
    </button>
  );
}

/** A labelled on/off setting row. */
export function ToggleRow({
  title,
  description,
  on,
  onClick,
  color,
}: {
  title: string;
  description: string;
  on: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-white/40">{description}</p>
      </div>
      <Toggle on={on} onClick={onClick} color={color} />
    </div>
  );
}
