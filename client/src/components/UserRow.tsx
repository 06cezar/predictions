import { useNavigate } from 'react-router-dom';
import type { UserRow as UserRowType } from '../api';

const AVATAR_COLORS = ['bg-orange', 'bg-violet', 'bg-amber/80', 'bg-cyan-500', 'bg-pink-500', 'bg-emerald-500'];

interface Props {
  user: UserRowType;
  index?: number;
}

export function UserRow({ user, index }: Props) {
  const navigate = useNavigate();
  const color = AVATAR_COLORS[user.id % AVATAR_COLORS.length];
  const initials = user.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      onClick={() => navigate(`/predict/${user.id}`)}
      className="card w-full flex items-center gap-4 hover:bg-white/10 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 text-left animate-fade-up"
    >
      <div
        className={`${color} w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm text-white flex-shrink-0`}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{user.name}</p>
        {user.hasPrediction ? (
          <p className="text-sm text-white/50">Prediction written</p>
        ) : (
          <p className="text-sm text-white/30">No prediction yet</p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {user.avgRating !== null && <span className="text-amber font-display font-bold">{user.avgRating}%</span>}
        {user.hasPrediction ? (
          <span className="w-2 h-2 rounded-full bg-green-400"></span>
        ) : (
          <span className="w-2 h-2 rounded-full bg-white/20"></span>
        )}
      </div>
    </button>
  );
}
