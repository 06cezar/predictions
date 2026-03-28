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
    api.settings.get().then(s => { setPhase(s.currentPhase); setBonusActive(s.bonusActive); }).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const fetch = () => api.notifications.get().then(n => setUnread(n.unread)).catch(() => {});
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
    <nav className="fixed bottom-0 left-0 right-0 bg-navy/95 backdrop-blur border-t border-white/10 flex items-center justify-around px-2 py-2">
      {links.map(({ to, label, icon }) => {
        const active = location.pathname === to;
        const isHome = to === '/';
        return (
          <Link key={to} to={to}
            className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all text-xs font-medium ${
              active ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            <span className="text-base">{icon}</span>
            {isHome && unread > 0 && (
              <span className="absolute -top-0.5 right-1 min-w-[16px] h-4 px-1 rounded-full bg-orange text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
            <span>{label}</span>
          </Link>
        );
      })}
      <button onClick={handleLogout}
        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white/30 hover:text-white/60 transition-all"
      >
        <span className="text-base">🚪</span>
        <span>Logout</span>
      </button>
    </nav>
  );
}
