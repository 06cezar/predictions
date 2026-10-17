import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

interface Props {
  loggedIn: boolean;
  onLogin: () => Promise<void>;
}

const STEPS = [
  {
    emoji: '✍️',
    title: 'Write',
    text: 'Write one prediction about every other player: something you think will happen to them before the game ends.',
    example: '"Will run a marathon." "Will move to Lisbon." "Will finally learn to cook."',
  },
  {
    emoji: '🎯',
    title: 'Rate',
    text: "Rate how likely other people's predictions are, from 0% (no chance) to 100% (certain). Predictions about you stay hidden, so no spoilers.",
    example: '"Bob will start a podcast": hmm, 30%.',
  },
  {
    emoji: '👁️',
    title: 'Reveal',
    text: 'When the deadline passes, you finally see what everyone predicted about you, and you mark each one: happened, or didn\'t.',
    example: '"Will jump into the sea in winter": ✅ happened.',
  },
  {
    emoji: '🏆',
    title: 'Results',
    text: 'Points go to whoever wrote each prediction that came true. Then the Hall of Fame hands out awards.',
    example: 'Most Courageous, Biggest Miss, Best Friends, The Joker...',
  },
];

const TIERS = [
  { range: 'below 12%', points: 5 },
  { range: 'below 25%', points: 4 },
  { range: 'below 37%', points: 3 },
  { range: 'below 50%', points: 2 },
  { range: '50% or more', points: 1 },
];

const FAQ = [
  {
    q: 'Do I need an account?',
    a: "No. Each player gets a token, like brave-owl-4821, and that's your login. Keep it somewhere safe.",
  },
  {
    q: 'Lost your token?',
    a: "Ask your game's admin. They can see it, or give you a new one.",
  },
  {
    q: 'Can people see who wrote what?',
    a: 'Only if the admin turns anonymous mode off. By default predictions are anonymous.',
  },
  {
    q: 'How long does a game last?',
    a: 'As long as the admin decides: a weekend trip, a semester, a whole year. They set the deadlines.',
  },
  {
    q: 'Can I change a prediction?',
    a: 'Yes, until the deadline. Each edit costs half a point if it comes true, and the group rates it again.',
  },
];

/** Public "what is this?" page: how a game works, before you play one. */
export function About({ loggedIn, onLogin }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const startDemo = async () => {
    setBusy(true);
    try {
      await api.demo.start();
      await onLogin();
      navigate('/');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen p-4 pb-24 max-w-2xl mx-auto">
      <div className="py-6 animate-fade-up">
        <Link to={loggedIn ? '/' : '/login'} className="btn-ghost text-sm px-3">
          ← {loggedIn ? 'Back to your game' : 'Back'}
        </Link>
      </div>

      <div className="text-center space-y-3 mb-10 animate-fade-up">
        <p className="text-5xl select-none">🔮</p>
        <h1 className="font-display text-4xl font-bold text-glow">How Predictions works</h1>
        <p className="text-white/60 max-w-lg mx-auto">
          A game about how well you know your friends. Everyone predicts what will happen to everyone
          else, the group bets on how likely each prediction is, and when time is up you find out who
          saw it coming.
        </p>
      </div>

      <section className="space-y-3 mb-10">
        <h2 className="font-display text-xl font-bold">A game in four steps</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="card space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{step.emoji}</span>
                <h3 className="font-medium">
                  <span className="text-white/30 mr-1">{i + 1}.</span>{step.title}
                </h3>
              </div>
              <p className="text-sm text-white/70">{step.text}</p>
              <p className="text-xs text-amber/80 italic">{step.example}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-4 mb-10">
        <h2 className="font-display text-xl font-bold">Why bold beats safe</h2>
        <p className="text-sm text-white/70">
          A prediction is worth more the less the group believed it. Say Bob writes{' '}
          <span className="text-white">"Ana will run a marathon"</span>. Most people think there's no way:
          the average rating is 20%. Then Ana runs it, and Bob gets <span className="text-amber font-medium">4 points</span>.
          Something everyone saw coming is worth just 1.
        </p>
        <div className="space-y-1.5">
          {TIERS.map(t => (
            <div key={t.points} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-white/50 text-xs">{t.range}</span>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-ember-gradient rounded-full" style={{ width: `${t.points * 20}%` }} />
              </div>
              <span className="w-14 text-right font-display font-bold text-amber">
                {t.points} pt{t.points !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/40">
          Average rating of a prediction that came true, with the default 50% threshold (the admin can change it).
          Wrong predictions score nothing.
        </p>
      </section>

      <section className="space-y-3 mb-10">
        <h2 className="font-display text-xl font-bold">Getting in</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="card space-y-1">
            <p className="font-medium">🎲 Start a game</p>
            <p className="text-white/60">Name it, and you're the admin: invite friends, set the deadlines, run the reveal.</p>
          </div>
          <div className="card space-y-1">
            <p className="font-medium">🔑 Join one</p>
            <p className="text-white/60">Use the 6-letter code or link your admin shares, or a one-use invite link.</p>
          </div>
          <div className="card space-y-1">
            <p className="font-medium">🧪 Just looking?</p>
            <p className="text-white/60">Run a demo round as the admin: four bots, a guide, and a button to skip ahead in time.</p>
          </div>
        </div>
        <p className="text-xs text-white/40">
          Extras the admin can switch on: a bonus round where everyone votes for things like "most likely
          to move abroad", and anonymous or named predictions.
        </p>
      </section>

      <section className="space-y-2 mb-10">
        <h2 className="font-display text-xl font-bold">Questions</h2>
        {FAQ.map(item => (
          <details key={item.q} className="card group">
            <summary className="cursor-pointer list-none flex items-center justify-between font-medium text-sm">
              {item.q}
              <span className="text-white/40 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="text-sm text-white/60 mt-2">{item.a}</p>
          </details>
        ))}
      </section>

      <div className="flex flex-col sm:flex-row gap-3">
        {loggedIn ? (
          <Link to="/" className="btn-primary flex-1 text-center py-3">Back to your game →</Link>
        ) : (
          <>
            <button onClick={startDemo} disabled={busy} className="btn-primary flex-1 py-3">
              {busy ? 'Setting up...' : 'Run a demo round →'}
            </button>
            <Link to="/login" className="btn-secondary flex-1 text-center py-3">Create or join a game</Link>
          </>
        )}
      </div>
    </div>
  );
}
