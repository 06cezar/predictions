export interface GameInfo {
  id: number;
  name: string;
  isDemo: boolean;
}

export interface User {
  id: number;
  name: string;
  isAdmin?: boolean;
  game?: GameInfo;
  stats?: {
    predictionsWritten: number;
    totalTargets: number;
    predictionsReceived: number;
  };
}

export interface UserRow {
  id: number;
  name: string;
  hasPrediction: boolean;
  avgRating: number | null;
}

export interface Prediction {
  id: number;
  targetId?: number;
  targetName?: string;
  currentText: string;
  createdAt: string;
  updatedAt: string;
  editCount: number;
  avgRating: number | null;
  myRating?: number | null;
  ratingThreshold?: number;
  authorName?: string;
  outcome?: { happened: boolean | null; markedAt: string } | null;
}

/** A game's full settings, as admins see them. */
export interface Settings {
  id: number;
  name: string;
  joinCode: string;
  openJoin: boolean;
  isDemo: boolean;
  createdAt: string;
  currentPhase: 'submission' | 'reveal' | 'done';
  submissionDeadline: string | null;
  revealDeadline: string | null;
  ratingThreshold: number;
  autoAdvancePhase: boolean;
  adminOverride: boolean;
  anonymousPredictions: boolean;
  bonusActive: boolean;
}

/** Rating bands below the threshold: a prediction that came true scores 5, 4, 3 or 2 points in them, 1 above. */
export interface ScoringTiers {
  threshold: number;
  tier1: number;
  tier2: number;
  tier3: number;
}

/** What every player of a game sees. */
export interface PublicSettings extends Pick<
  Settings,
  | 'currentPhase'
  | 'submissionDeadline'
  | 'revealDeadline'
  | 'ratingThreshold'
  | 'anonymousPredictions'
  | 'bonusActive'
  | 'adminOverride'
  | 'isDemo'
> {
  gameName: string;
  demoExpiresAt: string | null;
  scoringTiers: ScoringTiers;
}

/** Response of creating, joining or starting a demo game: you are logged in. */
export interface JoinedGame {
  token: string;
  user: User;
  game: { id: number; name: string; joinCode?: string; isDemo?: boolean; expiresAt?: string };
}

/** Where the player is in a demo round (see DemoGuide). */
export interface DemoProgress {
  phase: Settings['currentPhase'];
  nextDeadline: string | null;
  written: number;
  writeTotal: number;
  rated: number;
  rateTotal: number;
  marked: number;
  markTotal: number;
  bonusActive: boolean;
  bonusVoted: number;
  bonusTotal: number;
  expiresAt: string;
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  rank: number;
  /** Predictions that came true. */
  score: number;
  /** The ranking: points for predictions that came true, plus bonus points. */
  weightedScore: number;
  bonusPoints: number;
}

/** A Hall of Fame card about one prediction; the author is null in anonymous games. */
export interface PredictionAward {
  text: string;
  authorName: string | null;
  targetName: string;
}

export interface HallOfFame {
  mostCourageous: (PredictionAward & { avg: number }) | null;
  biggestMiss: (PredictionAward & { avg: number }) | null;
  mostControversial: (PredictionAward & { avg: number; stdDev: number; individualRatings: number[] }) | null;
  mostRevised: (PredictionAward & { editCount: number; history: string[] }) | null;
  lastMinute: (PredictionAward & { updatedAt: string }) | null;
  firstToSubmit: { names: string[]; tied: boolean } | null;
  starOfTheShow: { name: string; count: number }[];
  theJoker: { name: string; count: number }[];
  bestFriends: { userA: string; userB: string }[];
}

export interface AppNotification {
  id: number;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface BonusVote {
  rank: number;
  nomineeId: number;
}

export interface BonusCategory {
  id: number;
  name: string;
  points: number;
  myVotes: BonusVote[];
  /** Vote points per player id; only once the game is done, or for admins. */
  tally?: Record<string, number>;
  winners?: number[];
}

export interface InviteLink {
  id: number;
  code: string;
  createdBy: number;
  createdByName: string | null;
  usedBy: number | null;
  usedByName: string | null;
  usedAt: string | null;
  createdAt: string;
}

/** A player as admins see them, login token included. */
export interface Player {
  id: number;
  name: string;
  token: string;
  isAdmin: boolean;
  createdAt: string;
}

/** A prediction as admins see it, with its edit history. */
export interface AdminPrediction {
  id: number;
  author: { id: number; name?: string };
  target: { id: number; name?: string };
  currentText: string;
  createdAt: string;
  updatedAt: string;
  editCount: number;
  forgivenEdits: number;
  history: { id: number; oldText: string; editedAt: string }[];
  avgRating: number | null;
  ratingCount: number;
  isAboutMe: boolean;
}

/** How far one player is through writing, rating or marking outcomes. */
export interface PlayerProgress {
  id: number;
  name: string;
  written: number;
  expected: number;
  complete: boolean;
}

export interface AdminStats {
  submissionCount: number;
  ratingCount: number;
  avgRating: number | null;
  lowRatedCount: number;
  completedUsers: number;
  totalUsers: number;
  userProgress: PlayerProgress[];
  completedRaters: number;
  ratingProgress: PlayerProgress[];
  markedPredictions: number;
  outcomesProgress: PlayerProgress[];
  currentPhase: Settings['currentPhase'];
}

/** The message of something thrown, for showing to the user. */
export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** Fired after every successful change, so views like the demo guide can refresh. */
export const API_MUTATED = 'api:mutated';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  if (options?.method && options.method !== 'GET') window.dispatchEvent(new Event(API_MUTATED));
  return res.json();
}

export const api = {
  auth: {
    login: (token: string) =>
      request<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
  },
  users: {
    me: () => request<User>('/api/users/me'),
    list: () => request<UserRow[]>('/api/users'),
  },
  settings: {
    get: () => request<PublicSettings>('/api/settings'),
  },
  games: {
    create: (gameName: string, playerName: string, token?: string) =>
      request<JoinedGame>('/api/games', {
        method: 'POST',
        body: JSON.stringify({ gameName, playerName, token }),
      }),
    lookup: (code: string) =>
      request<{ name: string; currentPhase: Settings['currentPhase']; openJoin: boolean }>(
        `/api/games/join/${encodeURIComponent(code)}`,
      ),
    join: (code: string, name: string, token?: string) =>
      request<JoinedGame>(`/api/games/join/${encodeURIComponent(code)}`, {
        method: 'POST',
        body: JSON.stringify({ name, token }),
      }),
  },
  demo: {
    start: (name?: string) => request<JoinedGame>('/api/demo', { method: 'POST', body: JSON.stringify({ name }) }),
    progress: () => request<DemoProgress>('/api/demo/progress'),
    skip: () => request<{ newPhase: Settings['currentPhase']; game: Settings }>('/api/demo/skip', { method: 'POST' }),
  },
  predictions: {
    mine: () => request<Prediction[]>('/api/predictions/mine'),
    toRate: () => request<Prediction[]>('/api/predictions/to-rate'),
    aboutMe: () => request<Prediction[]>('/api/predictions/about-me'),
    create: (target_id: number, text: string) =>
      request('/api/predictions', {
        method: 'POST',
        body: JSON.stringify({ target_id, text }),
      }),
    update: (id: number, text: string) =>
      request(`/api/predictions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ text }),
      }),
  },
  ratings: {
    submit: (prediction_id: number, score: number) =>
      request('/api/ratings', {
        method: 'POST',
        body: JSON.stringify({ prediction_id, score }),
      }),
  },
  outcomes: {
    mark: (prediction_id: number, happened: boolean | null) =>
      request('/api/outcomes', {
        method: 'POST',
        body: JSON.stringify({ prediction_id, happened }),
      }),
  },
  leaderboard: {
    get: () => request<LeaderboardEntry[]>('/api/leaderboard'),
    preview: () => request<LeaderboardEntry[]>('/api/leaderboard/preview'),
    hallOfFame: () => request<HallOfFame>('/api/leaderboard/hall-of-fame'),
  },
  notifications: {
    get: () => request<{ unread: number; items: AppNotification[] }>('/api/notifications'),
    readAll: () => request('/api/notifications/read-all', { method: 'POST' }),
    dismiss: (id: number) => request(`/api/notifications/dismiss/${id}`, { method: 'POST' }),
  },
  bonus: {
    get: () =>
      request<{
        categories: BonusCategory[];
        users: { id: number; name: string }[];
        phase: Settings['currentPhase'];
        bonusActive: boolean;
      }>('/api/bonus'),
    vote: (categoryId: number, votes: BonusVote[]) =>
      request('/api/bonus/vote', { method: 'POST', body: JSON.stringify({ categoryId, votes }) }),
    createCategory: (name: string, points: number) =>
      request<Pick<BonusCategory, 'id' | 'name' | 'points'>>('/api/bonus/categories', {
        method: 'POST',
        body: JSON.stringify({ name, points }),
      }),
    updateCategory: (id: number, data: { name?: string; points?: number }) =>
      request(`/api/bonus/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCategory: (id: number) => request(`/api/bonus/categories/${id}`, { method: 'DELETE' }),
  },
  invite: {
    list: () => request<InviteLink[]>('/api/invite'),
    create: () => request<InviteLink>('/api/invite', { method: 'POST' }),
    revoke: (id: number) => request(`/api/invite/${id}`, { method: 'DELETE' }),
    getLink: (code: string) => request<{ valid: boolean; code: string }>(`/api/invite/join/${code}`),
    join: (code: string, name: string, token?: string) =>
      request<{ success: boolean; token: string; name: string }>(`/api/invite/join/${code}`, {
        method: 'POST',
        body: JSON.stringify({ name, token }),
      }),
  },
  admin: {
    users: () => request<Player[]>('/api/admin/users'),
    createUser: (name: string, token?: string) =>
      request<Player>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name, token }),
      }),
    updateUser: (id: number, data: { name?: string; regenerateToken?: boolean }) =>
      request<Player>(`/api/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteUser: (id: number) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
    predictions: () => request<AdminPrediction[]>('/api/admin/predictions'),
    deletePrediction: (id: number) => request(`/api/admin/predictions/${id}`, { method: 'DELETE' }),
    forgiveEdit: (id: number) =>
      request<{ forgivenEdits: number; editCount: number }>(`/api/admin/predictions/${id}/forgive-edit`, {
        method: 'POST',
      }),
    unforgiveEdit: (id: number) =>
      request<{ forgivenEdits: number; editCount: number }>(`/api/admin/predictions/${id}/unforgive-edit`, {
        method: 'POST',
      }),
    stats: () => request<AdminStats>('/api/admin/stats'),
    settings: () => request<Settings>('/api/admin/settings'),
    updateSettings: (data: Partial<Settings>) =>
      request('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    setPhase: (phase: string) =>
      request<Pick<Settings, 'submissionDeadline' | 'revealDeadline'> & { newPhase: Settings['currentPhase'] }>(
        '/api/admin/phase/set',
        { method: 'POST', body: JSON.stringify({ phase }) },
      ),
    resetGame: () => request('/api/admin/reset', { method: 'POST' }),
    toggleBonusActive: () => request<{ bonusActive: boolean }>('/api/admin/bonus-active/toggle', { method: 'POST' }),
    regenerateJoinCode: () => request<{ joinCode: string }>('/api/admin/join-code/regenerate', { method: 'POST' }),
  },
};
