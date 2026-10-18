import { useState, useEffect, FormEvent, ReactNode } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, JoinedGame } from '../api';
import { TokenReveal } from '../components/TokenReveal';

interface Props {
  onLogin: () => Promise<void>;
}

type GameInfo = Awaited<ReturnType<typeof api.games.lookup>>;

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full bg-orange/10 blur-[120px] pointer-events-none" />
      <div className="w-full max-w-md space-y-8 relative">{children}</div>
    </div>
  );
}

/** /game/:code - join a game with its code, as a new player or with an existing token. */
export function JoinGame({ onLogin }: Props) {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [game, setGame] = useState<GameInfo | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<JoinedGame | null>(null);

  useEffect(() => {
    api.games
      .lookup(code)
      .then(setGame)
      .catch((err: any) => setLookupError(err.message || 'No game with that code'));
  }, [code]);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setJoined(await api.games.join(code, name.trim(), token.trim() || undefined));
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const enter = async () => {
    await onLogin();
    navigate('/');
  };

  if (!game && !lookupError) {
    return (
      <Shell>
        <p className="font-display text-2xl text-white/30 text-center">Finding game...</p>
      </Shell>
    );
  }

  const closedReason =
    lookupError ||
    (game && !game.openJoin && 'This game is invite-only. Ask its admin for a token.') ||
    (game && game.currentPhase !== 'submission' && 'This game has already started. Ask its admin to add you.');

  return (
    <Shell>
      <div className="text-center">
        {game && <p className="text-white/40 text-sm uppercase tracking-widest mb-2">You're joining</p>}
        <h1 className="font-display text-4xl font-bold text-white text-glow">{game?.name ?? 'Predictions'}</h1>
      </div>

      {joined ? (
        <TokenReveal title={`Welcome, ${joined.user.name}`} token={joined.token} onContinue={enter} />
      ) : closedReason ? (
        <div className="card text-center space-y-2">
          <p className="text-orange">{closedReason}</p>
        </div>
      ) : (
        <form onSubmit={join} className="card space-y-5">
          <div>
            <label className="block text-sm text-white/60 mb-2">
              Your name <span className="text-orange">*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Alex"
              className="input"
              maxLength={40}
              autoFocus
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-2">
              Token <span className="text-white/30">(optional, generated if empty)</span>
            </label>
            <input
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="e.g. brave-owl-4821"
              className="input"
              autoComplete="off"
            />
          </div>
          {error && <p className="text-orange text-sm text-center">{error}</p>}
          <button type="submit" disabled={busy || !name.trim()} className="btn-primary w-full text-base py-3">
            {busy ? 'Joining...' : 'Join the game →'}
          </button>
        </form>
      )}

      {!joined && (
        <p className="text-center text-white/30 text-sm">
          Already have a token?{' '}
          <Link to="/login" className="text-amber hover:text-amber/80 transition-colors">
            Log in here
          </Link>
        </p>
      )}
    </Shell>
  );
}
