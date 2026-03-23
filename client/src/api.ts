export interface User {
  id: number;
  name: string;
  isAdmin?: boolean;
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

export interface Settings {
  id: number;
  currentPhase: 'submission' | 'reveal' | 'done';
  submissionDeadline: string | null;
  revealDeadline: string | null;
  ratingThreshold: number;
  autoAdvancePhase: boolean;
  adminOverride: boolean;
  anonymousPredictions: boolean;
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  rank: number;
  score: number;
  weightedScore: number;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
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
    get: () => request<Pick<Settings, 'currentPhase' | 'submissionDeadline' | 'revealDeadline' | 'ratingThreshold' | 'anonymousPredictions'>>('/api/settings'),
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
  },
  admin: {
    users: () => request<any[]>('/api/admin/users'),
    createUser: (name: string) => request('/api/admin/users', {
      method: 'POST', body: JSON.stringify({ name }),
    }),
    deleteUser: (id: number) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
    predictions: () => request<any[]>('/api/admin/predictions'),
    stats: () => request<any>('/api/admin/stats'),
    settings: () => request<Settings>('/api/admin/settings'),
    updateSettings: (data: Partial<Settings>) => request('/api/admin/settings', {
      method: 'PUT', body: JSON.stringify(data),
    }),
    advancePhase: () => request('/api/admin/phase/advance', { method: 'POST' }),
    reversePhase: () => request('/api/admin/phase/reverse', { method: 'POST' }),
    setPhase: (phase: string) => request('/api/admin/phase/set', { method: 'POST', body: JSON.stringify({ phase }) }),
    resetGame: () => request('/api/admin/reset', { method: 'POST' }),
  },
};
