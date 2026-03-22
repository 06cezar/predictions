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
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="font-display text-5xl font-bold text-white mb-2">Predictions</h1>
          <p className="text-white/50">Enter your secret token to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="block text-sm text-white/60 mb-2">Your Token</label>
            <input
              type="text"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="e.g. lion-sunset-42"
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
