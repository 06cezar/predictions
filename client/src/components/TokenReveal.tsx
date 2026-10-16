import { useCopied } from '../hooks/useCopied';

interface Props {
  title: string;
  token: string;
  /** Shown to admins of a new game so they can invite people. */
  joinCode?: string;
  onContinue: () => void;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopied(1500);

  return (
    <div>
      <p className="text-xs text-white/50 uppercase tracking-widest mb-1.5">{label}</p>
      <div className="flex gap-2">
        <code className="input flex-1 font-mono text-amber truncate select-all">{value}</code>
        <button type="button" onClick={() => copy(value)} className="btn-secondary text-sm px-3 shrink-0">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/** One-time screen after creating or joining a game: the token is the only way back in. */
export function TokenReveal({ title, token, joinCode, onContinue }: Props) {
  const joinLink = joinCode ? `${window.location.origin}/game/${joinCode}` : null;

  return (
    <div className="card space-y-5 animate-fade-up">
      <div className="text-center">
        <p className="text-4xl mb-2">🎉</p>
        <h2 className="font-display text-2xl font-bold">{title}</h2>
      </div>

      <CopyField label="Your token (save it - it's how you log back in)" value={token} />

      {joinCode && joinLink && (
        <>
          <CopyField label="Join code" value={joinCode} />
          <CopyField label="Invite link" value={joinLink} />
          <p className="text-white/40 text-xs">
            Anyone with the code can join while the game is in the submission phase.
            You can turn this off or change the code in Admin → Settings.
          </p>
        </>
      )}

      <button onClick={onContinue} className="btn-primary w-full py-3">Enter the game →</button>
    </div>
  );
}
