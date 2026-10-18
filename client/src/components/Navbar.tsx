import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, User } from '../api';

interface Props {
  user: User;
  onLogout: () => void;
}

export function Navbar({ user, onLogout }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<string>('submission');
  const [bonusActive, setBonusActive] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api.settings
      .get()
      .then(s => {
        setPhase(s.currentPhase);
        setBonusActive(s.bonusActive);
      })
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const fetch = () =>
      api.notifications
        .get()
        .then(n => setUnread(n.unread))
        .catch(() => {});
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await api.auth.logout();
    onLogout();
    navigate('/login');
  };

  const links = [
    { to: '/', label: 'Home', icon: '🏠' },
    { to: '/rate', label: 'Rate', icon: '🎯' },
    ...(phase !== 'submission' ? [{ to: '/reveal', label: 'Reveal', icon: '👁️' }] : []),
    ...(bonusActive ? [{ to: '/bonus', label: 'Bonus', icon: '🎖️' }] : []),
    { to: '/leaderboard', label: 'Board', icon: '🏆' },
    ...(user.isAdmin ? [{ to: '/admin', label: 'Admin', icon: '⚙️' }] : []),
  ];

  return (
    <nav
      className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 sm:gap-1 px-1.5 py-1.5 rounded-[1.4rem] border border-white/10 bg-navy/85 backdrop-blur-xl max-w-[calc(100vw-16px)]"
      style={{
        bottom: 'max(10px, env(safe-area-inset-bottom))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 40px -8px rgba(0,0,0,0.6)',
      }}
    >
      {links.map(({ to, label, icon }) => {
        const active = location.pathname === to;
        const isHome = to === '/';
        return (
          <Link
            key={to}
            to={to}
            className={`relative flex flex-col items-center gap-0.5 px-2.5 sm:px-3.5 py-1.5 rounded-2xl transition-all text-[10px] sm:text-xs font-medium ${
              active
                ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                : 'text-white/40 hover:text-white/75 hover:bg-white/5'
            }`}
          >
            <span className={`text-base transition-transform ${active ? 'scale-110' : ''}`}>{icon}</span>
            {isHome && unread > 0 && (
              <span className="absolute -top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-ember-gradient text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-glow-orange">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
            <span>{label}</span>
            <span
              className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber transition-all ${
                active ? 'opacity-100' : 'opacity-0 scale-0'
              }`}
            />
          </Link>
        );
      })}
      <button
        onClick={handleLogout}
        className="flex flex-col items-center gap-0.5 px-2.5 sm:px-3.5 py-1.5 rounded-2xl text-[10px] sm:text-xs font-medium text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
      >
        <span className="text-base">🚪</span>
        <span>Logout</span>
      </button>
    </nav>
  );
}
