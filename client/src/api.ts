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

/** What every player of a game sees. */
export interface PublicSettings extends Pick<Settings, 'currentPhase' | 'submissionDeadline' | 'revealDeadline' | 'ratingThreshold' | 'anonymousPredictions' | 'bonusActive' | 'adminOverride' | 'isDemo'> {
  gameName: string;
  demoExpiresAt: string | null;
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
  score: number;
  weightedScore: number;
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
    login: (token: string) => request<{ user: User }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ token }),
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
    create: (gameName: string, playerName: string, token?: string) => request<JoinedGame>('/api/games', {
      method: 'POST', body: JSON.stringify({ gameName, playerName, token }),
    }),
    lookup: (code: string) => request<{ name: string; currentPhase: Settings['currentPhase']; openJoin: boolean }>(`/api/games/join/${encodeURIComponent(code)}`),
    join: (code: string, name: string, token?: string) => request<JoinedGame>(`/api/games/join/${encodeURIComponent(code)}`, {
      method: 'POST', body: JSON.stringify({ name, token }),
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
    create: (target_id: number, text: string) => request('/api/predictions', {
      method: 'POST', body: JSON.stringify({ target_id, text }),
    }),
    update: (id: number, text: string) => request(`/api/predictions/${id}`, {
      method: 'PUT', body: JSON.stringify({ text }),
    }),
  },
  ratings: {
    submit: (prediction_id: number, score: number) => request('/api/ratings', {
      method: 'POST', body: JSON.stringify({ prediction_id, score }),
    }),
  },
  outcomes: {
    mark: (prediction_id: number, happened: boolean | null) => request('/api/outcomes', {
      method: 'POST', body: JSON.stringify({ prediction_id, happened }),
    }),
  },
  leaderboard: {
    get: () => request<LeaderboardEntry[]>('/api/leaderboard'),
    preview: () => request<LeaderboardEntry[]>('/api/leaderboard/preview'),
    mostCourageous: () => request<{ text: string; authorName: string; targetName: string; avg: number } | null>('/api/leaderboard/most-courageous'),
    biggestMiss: () => request<{ text: string; authorName: string; targetName: string; avg: number } | null>('/api/leaderboard/biggest-miss'),
    mostControversial: () => request<{ text: string; authorName: string; targetName: string; avg: number; stdDev: number; individualRatings: number[] } | null>('/api/leaderboard/most-controversial'),
    mostRevised: () => request<{ text: string; authorName: string | null; targetName: string; editCount: number; history: string[] } | null>('/api/leaderboard/most-revised'),
    bestFriends: () => request<{ userA: string; userB: string }[]>('/api/leaderboard/best-friends'),
    starOfTheShow: () => request<{ name: string; count: number }[]>('/api/leaderboard/star-of-the-show'),
    theJoker: () => request<{ name: string; count: number }[]>('/api/leaderboard/the-joker'),
    lastMinute: () => request<{ text: string; authorName: string | null; targetName: string; updatedAt: string } | null>('/api/leaderboard/last-minute'),
    firstToSubmit: () => request<{ names: string[]; tied: boolean } | null>('/api/leaderboard/first-to-submit'),
  },
  notifications: {
    get: () => request<{ unread: number; items: { id: number; type: string; message: string; read: boolean; createdAt: string }[] }>('/api/notifications'),
    readAll: () => request('/api/notifications/read-all', { method: 'POST' }),
    dismiss: (id: number) => request(`/api/notifications/dismiss/${id}`, { method: 'POST' }),
  },
  bonus: {
    get: () => request<{
      categories: Array<{
        id: number;
        name: string;
        points: number;
        myVotes: Array<{ rank: number; nomineeId: number }>;
        tally?: Record<string, number>;
        winners?: number[];
      }>;
      users: Array<{ id: number; name: string }>;
      phase: string;
      bonusActive: boolean;
    }>('/api/bonus'),
    vote: (categoryId: number, votes: Array<{ rank: number; nomineeId: number }>) =>
      request('/api/bonus/vote', { method: 'POST', body: JSON.stringify({ categoryId, votes }) }),
    createCategory: (name: string, points: number) =>
      request('/api/bonus/categories', { method: 'POST', body: JSON.stringify({ name, points }) }),
    updateCategory: (id: number, data: { name?: string; points?: number }) =>
      request(`/api/bonus/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCategory: (id: number) =>
      request(`/api/bonus/categories/${id}`, { method: 'DELETE' }),
  },
  invite: {
    list: () => request<Array<{ id: number; code: string; createdBy: number; createdByName: string; usedBy: number | null; usedByName: string | null; usedAt: string | null; createdAt: string }>>('/api/invite'),
    create: () => request<{ id: number; code: string; createdAt: string }>('/api/invite', { method: 'POST' }),
    revoke: (id: number) => request(`/api/invite/${id}`, { method: 'DELETE' }),
    getLink: (code: string) => request<{ valid: boolean; code: string }>(`/api/invite/join/${code}`),
    join: (code: string, name: string, token?: string) => request<{ success: boolean; token: string; name: string }>(`/api/invite/join/${code}`, {
      method: 'POST', body: JSON.stringify({ name, token }),
    }),
  },
  admin: {
    users: () => request<any[]>('/api/admin/users'),
    createUser: (name: string, token?: string) => request('/api/admin/users', {
      method: 'POST', body: JSON.stringify({ name, token }),
    }),
    updateUser: (id: number, data: { name?: string; regenerateToken?: boolean }) => request(`/api/admin/users/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),
    deleteUser: (id: number) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
    predictions: () => request<any[]>('/api/admin/predictions'),
    deletePrediction: (id: number) => request(`/api/admin/predictions/${id}`, { method: 'DELETE' }),
    forgiveEdit: (id: number) => request<{ forgivenEdits: number; editCount: number }>(`/api/admin/predictions/${id}/forgive-edit`, { method: 'POST' }),
    unforgiveEdit: (id: number) => request<{ forgivenEdits: number; editCount: number }>(`/api/admin/predictions/${id}/unforgive-edit`, { method: 'POST' }),
    stats: () => request<any>('/api/admin/stats'),
    settings: () => request<Settings>('/api/admin/settings'),
    updateSettings: (data: Partial<Settings>) => request('/api/admin/settings', {
      method: 'PUT', body: JSON.stringify(data),
    }),
    advancePhase: () => request('/api/admin/phase/advance', { method: 'POST' }),
    reversePhase: () => request('/api/admin/phase/reverse', { method: 'POST' }),
    setPhase: (phase: string) => request('/api/admin/phase/set', { method: 'POST', body: JSON.stringify({ phase }) }),
    resetGame: () => request('/api/admin/reset', { method: 'POST' }),
    toggleBonusActive: () => request<{ bonusActive: boolean }>('/api/admin/bonus-active/toggle', { method: 'POST' }),
    regenerateJoinCode: () => request<{ joinCode: string }>('/api/admin/join-code/regenerate', { method: 'POST' }),
  },
};
