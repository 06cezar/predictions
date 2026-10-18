import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { TokenReveal } from '../components/TokenReveal';

interface Props {
  onLogin: () => Promise<void>;
}

export function Join({ onLogin }: Props) {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [linkValid, setLinkValid] = useState<boolean | null>(null);
  const [linkError, setLinkError] = useState('');

  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState<{ name: string; token: string } | null>(null);

  useEffect(() => {
    if (!code) return;
    api.invite
      .getLink(code)
      .then(() => setLinkValid(true))
      .catch((err: any) => {
        setLinkValid(false);
        setLinkError(err.message || 'Invalid invite link');
      });
  }, [code]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code) return;
    setLoading(true);
    setError('');

    try {
      const result = await api.invite.join(code, name.trim(), token.trim() || undefined);
      await api.auth.login(result.token);
      // Show the token before entering: it's the only way back in later
      setJoined({ name: result.name, token: result.token });
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (linkValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-display text-2xl text-white/30">Checking invite...</p>
      </div>
    );
  }

  if (linkValid === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="font-display text-4xl font-bold text-white">Predictions</h1>
          <div className="card space-y-3">
            <p className="text-orange text-lg">⚠ Invite link invalid</p>
            <p className="text-white/50 text-sm">{linkError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full bg-orange/10 blur-[120px] pointer-events-none" />
      <div className="w-full max-w-md space-y-8 relative">
        <div className="text-center">
          <div
            className="text-6xl mb-4 animate-float select-none"
            style={{ filter: 'drop-shadow(0 8px 24px rgba(59,47,245,0.45))' }}
          >
            🔮
          </div>
          <h1 className="font-display text-5xl font-bold text-white mb-2 text-glow">Predictions</h1>
          <p className="text-white/50 italic font-display">You've been invited! Create your account below.</p>
        </div>

        {joined && (
          <TokenReveal
            title={`Welcome, ${joined.name}`}
            token={joined.token}
            onContinue={async () => {
              await onLogin();
              navigate('/');
            }}
          />
        )}

        {!joined && (
          <form onSubmit={handleSubmit} className="card space-y-5">
            <div>
              <label className="block text-sm text-white/60 mb-2">
                Your name <span className="text-orange">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Alex"
                className="input"
                autoFocus
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-2">
                Token <span className="text-white/30">(optional - leave empty for auto-generated)</span>
              </label>
              <input
                type="text"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="e.g. brave-owl-4821"
                className="input"
                autoComplete="off"
              />
            </div>

            {error && <p className="text-orange text-sm text-center">{error}</p>}

            <button type="submit" disabled={loading || !name.trim()} className="btn-primary w-full text-base py-3">
              {loading ? 'Joining...' : 'Join the game →'}
            </button>
          </form>
        )}

        {!joined && (
          <p className="text-center text-white/30 text-sm">
            Already have a token?{' '}
            <a href="/login" className="text-amber hover:text-amber/80 transition-colors">
              Sign in here
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
