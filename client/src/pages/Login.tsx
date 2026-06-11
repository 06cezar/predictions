import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

interface Props {
  onLogin: (user: any) => void;
}

export function Login({ onLogin }: Props) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError('');

    try {
      const { user } = await api.auth.login(token.trim());
      onLogin(user);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full bg-orange/10 blur-[120px] pointer-events-none" />
      <div className="w-full max-w-md space-y-8 relative">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-float select-none" style={{ filter: 'drop-shadow(0 8px 24px rgba(59,47,245,0.45))' }}>🔮</div>
          <h1 className="font-display text-5xl font-bold text-white mb-2 text-glow">Predictions</h1>
          <p className="text-white/50 italic font-display">Enter your secret token to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="block text-sm text-white/60 mb-2">Your Token</label>
            <input
              type="text"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="e.g. stanescu-lata"
              className="input text-center text-lg tracking-wide"
              autoFocus
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-orange text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="btn-primary w-full text-base py-3"
          >
            {loading ? 'Signing in...' : 'Enter the future →'}
          </button>
        </form>

        <p className="text-center text-white/30 text-sm">
          Don't have a token? Ask your group organizer.
        </p>
      </div>
    </div>
  );
}
