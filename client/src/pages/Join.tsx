import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

interface Props {
  onLogin: (user: any) => void;
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

  useEffect(() => {
    if (!code) return;
    api.invite.getLink(code)
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
      // Auto-login with the new token
      const { user } = await api.auth.login(result.token);
      onLogin(user);
      navigate('/');
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="font-display text-5xl font-bold text-white mb-2">Predictions</h1>
          <p className="text-white/50">You've been invited! Create your account below.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="block text-sm text-white/60 mb-2">Your name <span className="text-orange">*</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Cutunescu"
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
              placeholder="e.g. stanescu-lata"
              className="input"
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-orange text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="btn-primary w-full text-base py-3"
          >
            {loading ? 'Joining...' : 'Join the game →'}
          </button>
        </form>

        <p className="text-center text-white/30 text-sm">
          Already have a token? <a href="/login" className="text-amber hover:text-amber/80 transition-colors">Sign in here</a>
        </p>
      </div>
    </div>
  );
}
