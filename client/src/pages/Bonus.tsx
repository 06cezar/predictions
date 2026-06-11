import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, User } from '../api';

type BonusUser = { id: number; name: string };
type Category = {
  id: number;
  name: string;
  points: number;
  myVotes: Array<{ rank: number; nomineeId: number }>;
  tally?: Record<string, number>;
  winners?: number[];
};

interface Props {
  user: User;
}

export function Bonus({ user }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<BonusUser[]>([]);
  const [phase, setPhase] = useState<string>('');
  const [bonusActive, setBonusActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, Array<{ rank: number; nomineeId: number }>>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [notAvailable, setNotAvailable] = useState(false);

  useEffect(() => {
    api.bonus.get().then(data => {
      setCategories(data.categories);
      setUsers(data.users);
      setPhase(data.phase);
      setBonusActive(data.bonusActive);
      const initDrafts: Record<number, Array<{ rank: number; nomineeId: number }>> = {};
      for (const cat of data.categories) {
        if (cat.myVotes.length > 0) {
          initDrafts[cat.id] = [...cat.myVotes];
        }
      }
      setDrafts(initDrafts);
    }).catch(err => {
      if (err.message?.includes('available')) setNotAvailable(true);
    }).finally(() => setLoading(false));
  }, []);

  const isDone = phase === 'done';
  const isVoting = bonusActive && !isDone;

  const getVotesForCat = (catId: number) => drafts[catId] || [];

  const setRankNominee = (catId: number, rank: number, nomineeId: number | null) => {
    setDrafts(prev => {
      const current = [...(prev[catId] || [])].filter(v => v.rank !== rank);
      if (nomineeId !== null) {
        // Remove this nominee from other ranks first
        const cleaned = current.filter(v => v.nomineeId !== nomineeId);
        cleaned.push({ rank, nomineeId });
        return { ...prev, [catId]: cleaned };
      }
      return { ...prev, [catId]: current };
    });
  };

  const handleSubmit = async (catId: number) => {
    const votes = getVotesForCat(catId);
    if (votes.length !== 3) return;
    setSaving(prev => ({ ...prev, [catId]: true }));
    try {
      await api.bonus.vote(catId, votes);
      // Update categories with new myVotes
      setCategories(prev => prev.map(c => c.id === catId ? { ...c, myVotes: votes } : c));
      setSaved(prev => ({ ...prev, [catId]: true }));
      setTimeout(() => setSaved(prev => ({ ...prev, [catId]: false })), 2000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(prev => ({ ...prev, [catId]: false }));
    }
  };

  const rankMedals = ['🥇', '🥈', '🥉'];
  const rankLabels = ['1st place', '2nd place', '3rd place'];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-white/50">Loading...</p>
    </div>
  );

  if (notAvailable) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-5xl">🎖️</p>
      <h2 className="font-display text-2xl font-bold">Bonus Round not available</h2>
      <p className="text-white/40 text-sm max-w-xs">The Bonus phase is not currently active. Check back when the organizer activates it.</p>
      <Link to="/" className="btn-primary mt-2">← Back to Home</Link>
    </div>
  );

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 py-6 mb-2 animate-fade-up">
        <Link to="/" className="btn-ghost text-sm px-3">← Back</Link>
        <div>
          <h1 className="font-display text-2xl font-bold">🎖️ Bonus Round</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {isVoting ? 'Vote for your top 3 in each category' : 'Bonus round results'}
          </p>
        </div>
      </div>

      {categories.length === 0 && (
        <div className="card text-center py-10 text-white/40">
          <p className="text-4xl mb-3">🎯</p>
          <p>No bonus categories yet.</p>
        </div>
      )}

      <div className="space-y-6">
        {categories.map((cat, ci) => {
          const catVotes = getVotesForCat(cat.id);
          const allRanksSet = catVotes.length === 3;
          const hasChanged = JSON.stringify(catVotes.sort((a,b) => a.rank - b.rank)) !==
            JSON.stringify([...cat.myVotes].sort((a,b) => a.rank - b.rank));
          const alreadyVoted = cat.myVotes.length === 3;

          // For the done phase: show tally sorted
          const tallyEntries = cat.tally
            ? Object.entries(cat.tally)
                .map(([id, pts]) => ({ id: parseInt(id), pts, name: users.find(u => u.id === parseInt(id))?.name ?? '?' }))
                .sort((a, b) => b.pts - a.pts)
            : [];

          // Points each winner gets if tied
          const winnerCount = cat.winners?.length ?? 1;
          const pointsEach = winnerCount > 0 ? Math.round((cat.points / winnerCount) * 10) / 10 : cat.points;

          return (
            <div key={cat.id} className="card space-y-4 animate-fade-up" style={{ animationDelay: `${ci * 0.05}s` }}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display font-bold text-lg">{cat.name}</h2>
                  {isDone && (
                    <p className="text-xs text-white/40 mt-0.5">
                      {cat.points < 0
                        ? <>Winner loses <span className="text-orange font-semibold">{Math.abs(cat.points)}</span> bonus point{Math.abs(cat.points) !== 1 ? 's' : ''}{winnerCount > 1 ? ` (split: ${Math.abs(pointsEach)} each)` : ''}</>
                        : <>Winner gets <span className="text-amber font-semibold">{cat.points}</span> bonus point{cat.points !== 1 ? 's' : ''}{winnerCount > 1 ? ` (split: ${pointsEach} each)` : ''}</>
                      }
                    </p>
                  )}
                </div>
                {alreadyVoted && isVoting && !hasChanged && (
                  <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-lg">✓ Voted</span>
                )}
              </div>

              {/* Voting UI */}
              {isVoting && (
                <div className="space-y-2">
                  {[1, 2, 3].map(rank => {
                    const currentVote = catVotes.find(v => v.rank === rank);
                    // Nominees already used in other ranks
                    const usedIds = catVotes.filter(v => v.rank !== rank).map(v => v.nomineeId);
                    const availableUsers = users.filter(u => u.id !== user.id && !usedIds.includes(u.id));

                    return (
                      <div key={rank} className="flex items-center gap-3">
                        <span className="text-xl w-8 text-center">{rankMedals[rank - 1]}</span>
                        <select
                          value={currentVote?.nomineeId ?? ''}
                          onChange={e => setRankNominee(cat.id, rank, e.target.value ? parseInt(e.target.value) : null)}
                          className="input flex-1 text-sm"
                        >
                          <option value="">{rankLabels[rank - 1]}...</option>
                          {availableUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                          {/* Also show currently selected even if "used" */}
                          {currentVote && !availableUsers.find(u => u.id === currentVote.nomineeId) && (
                            <option value={currentVote.nomineeId}>
                              {users.find(u => u.id === currentVote.nomineeId)?.name ?? '?'}
                            </option>
                          )}
                        </select>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => handleSubmit(cat.id)}
                    disabled={!allRanksSet || saving[cat.id]}
                    className="btn-primary w-full mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving[cat.id] ? 'Saving...' : saved[cat.id] ? '✓ Saved!' : alreadyVoted && !hasChanged ? '✓ Votes submitted' : 'Submit votes'}
                  </button>
                </div>
              )}

              {/* Results (done phase or admin) */}
              {(isDone || cat.tally) && tallyEntries.length > 0 && (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <p className="text-xs text-white/40 uppercase tracking-wider">Results</p>
                  {tallyEntries.map((entry, i) => {
                    const isWinner = cat.winners?.includes(entry.id);
                    return (
                      <div key={entry.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${isWinner ? (cat.points < 0 ? 'bg-orange/10 border border-orange/20' : 'bg-amber/10 border border-amber/20') : 'bg-white/3'}`}>
                        <span className="text-sm w-5 text-center text-white/30">{i + 1}</span>
                        <span className={`flex-1 text-sm font-medium ${isWinner ? (cat.points < 0 ? 'text-orange' : 'text-amber') : 'text-white/70'}`}>
                          {entry.name} {isWinner && (cat.points < 0 ? '💀' : '🏆')}
                        </span>
                        <span className="text-xs text-white/40">{entry.pts} vote pts</span>
                      </div>
                    );
                  })}
                  {cat.winners && cat.winners.length > 0 && (
                    <p className="text-xs text-white/40 text-center pt-1">
                      {cat.winners.map(wid => users.find(u => u.id === wid)?.name).join(' & ')} {cat.points < 0 ? `loses ${Math.abs(pointsEach)} bonus point${Math.abs(pointsEach) !== 1 ? 's' : ''}` : `wins ${pointsEach} bonus point${pointsEach !== 1 ? 's' : ''}`}
                    </p>
                  )}
                </div>
              )}

              {/* Show my current votes if not voting phase */}
              {!isVoting && !isDone && cat.myVotes.length > 0 && (
                <div className="space-y-1 border-t border-white/10 pt-3">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Your votes</p>
                  {cat.myVotes.map(v => (
                    <div key={v.rank} className="flex items-center gap-2 text-sm text-white/60">
                      <span>{rankMedals[v.rank - 1]}</span>
                      <span>{users.find(u => u.id === v.nomineeId)?.name ?? '?'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
