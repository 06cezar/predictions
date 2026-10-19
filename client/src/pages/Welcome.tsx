import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, JoinedGame, errorMessage } from '../api';
import { TokenReveal } from '../components/TokenReveal';
import { CircleHelp } from 'lucide-react';
import { Logo } from '../components/Sticker';

interface Props {
  onLogin: () => Promise<void>;
}

type Tab = 'login' | 'join' | 'create';

const TABS: { id: Tab; label: string }[] = [
  { id: 'login', label: 'Log in' },
  { id: 'join', label: 'Join a game' },
  { id: 'create', label: 'New game' },
];

/** Landing page for logged-out visitors: log in, join or create a game, or try the demo. */
export function Welcome({ onLogin }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<JoinedGame | null>(null);

  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [gameName, setGameName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [customToken, setCustomToken] = useState('');

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err) || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const enter = async () => {
    await onLogin();
    navigate('/');
  };

  const startDemo = () =>
    run(async () => {
      await api.demo.start();
      await enter();
    });

  const login = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.auth.login(token.trim());
      await enter();
    });
  };

  const goToGame = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/game/${code.trim().toUpperCase()}`);
  };

  const createGame = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      setCreated(await api.games.create(gameName.trim(), playerName.trim(), customToken.trim() || undefined));
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full bg-orange/10 blur-[120px] pointer-events-none" />
      <Link
        to="/about"
        className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      >
        <CircleHelp className="w-4 h-4" /> What is this?
      </Link>
      <div className="w-full max-w-md space-y-8 relative">
        <div className="text-center">
          <div className="mb-4">
            <Logo />
          </div>
          <h1 className="font-display text-5xl font-bold text-white mb-2 text-glow">Predictions</h1>
          <p className="text-white/50 italic font-display">Predict your friends' year. Find out who saw it coming.</p>
        </div>

        {created ? (
          <TokenReveal
            title={`${created.game.name} is ready`}
            token={created.token}
            joinCode={created.game.joinCode}
            onContinue={enter}
          />
        ) : (
          <>
            <div className="card text-center space-y-3">
              <p className="text-white/80">Want a quick feel for how it works?</p>
              <button onClick={startDemo} disabled={busy} className="btn-primary w-full text-base py-3">
                {busy ? 'Setting up...' : 'Run a demo round as the admin'}
              </button>
              <p className="text-white/35 text-xs">
                Four bot players, a step-by-step guide and a button to skip ahead in time. No sign-up; private to you
                and deleted after 3 days.
              </p>
            </div>

            <div className="card space-y-5">
              <div className="flex gap-1 p-1 rounded-xl bg-white/5">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTab(t.id);
                      setError('');
                    }}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                      tab === t.id ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'login' && (
                <form onSubmit={login} className="space-y-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Your token</label>
                    <input
                      value={token}
                      onChange={e => setToken(e.target.value)}
                      placeholder="e.g. brave-owl-4821"
                      className="input text-center text-lg tracking-wide"
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                  <button type="submit" disabled={busy || !token.trim()} className="btn-primary w-full py-3">
                    {busy ? 'Signing in...' : 'Log in'}
                  </button>
                </form>
              )}

              {tab === 'join' && (
                <form onSubmit={goToGame} className="space-y-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Game code</label>
                    <input
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      placeholder="e.g. K7QX2M"
                      className="input text-center text-lg tracking-[0.3em] uppercase"
                      maxLength={6}
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                  <button type="submit" disabled={code.trim().length < 6} className="btn-primary w-full py-3">
                    Find game
                  </button>
                </form>
              )}

              {tab === 'create' && (
                <form onSubmit={createGame} className="space-y-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Game name</label>
                    <input
                      value={gameName}
                      onChange={e => setGameName(e.target.value)}
                      placeholder="e.g. Class of 2026"
                      className="input"
                      maxLength={40}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Your name</label>
                    <input
                      value={playerName}
                      onChange={e => setPlayerName(e.target.value)}
                      placeholder="e.g. Alex"
                      className="input"
                      maxLength={40}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-2">
                      Token <span className="text-white/30">(optional, generated if empty)</span>
                    </label>
                    <input
                      value={customToken}
                      onChange={e => setCustomToken(e.target.value)}
                      placeholder="e.g. brave-owl-4821"
                      className="input"
                      autoComplete="off"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !gameName.trim() || !playerName.trim()}
                    className="btn-primary w-full py-3"
                  >
                    {busy ? 'Creating...' : 'Create game'}
                  </button>
                  <p className="text-white/35 text-xs text-center">
                    You'll be the admin: invite friends, set deadlines, run the reveal.
                  </p>
                </form>
              )}

              {error && <p className="text-orange text-sm text-center">{error}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
