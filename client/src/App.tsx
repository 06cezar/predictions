import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import type { User } from './api';
import { Welcome } from './pages/Welcome';
import { JoinGame } from './pages/JoinGame';
import { About } from './pages/About';
import { Dashboard } from './pages/Dashboard';
import { Predict } from './pages/Predict';
import { Rate } from './pages/Rate';
import { Reveal } from './pages/Reveal';
import { Leaderboard } from './pages/Leaderboard';
import { Admin } from './pages/Admin';
import { Bonus } from './pages/Bonus';
import { Join } from './pages/Join';
import { Navbar } from './components/Navbar';
import { DemoGuide } from './components/DemoGuide';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // The server keeps the session; after any login, ask it who we are (and in which game).
  const loadMe = () => api.users.me().then(setUser).catch(() => setUser(null));

  useEffect(() => {
    loadMe().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-display text-2xl text-white/30">Predictions</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {user?.game?.isDemo && <DemoGuide key={user.game.id} gameId={user.game.id} onLogin={loadMe} />}
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to="/" /> : <Welcome onLogin={loadMe} />
        } />
        <Route path="/join/:code" element={
          user ? <Navigate to="/" /> : <Join onLogin={loadMe} />
        } />
        <Route path="/about" element={<About loggedIn={!!user} onLogin={loadMe} />} />
        <Route path="/game/:code" element={
          user ? <Navigate to="/" /> : <JoinGame onLogin={loadMe} />
        } />
        {user ? (
          <>
            <Route path="/" element={<Dashboard user={user} onLogout={() => setUser(null)} />} />
            <Route path="/predict/:userId" element={<Predict />} />
            <Route path="/rate" element={<Rate />} />
            <Route path="/reveal" element={<Reveal />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/bonus" element={<Bonus user={user} />} />
            {user.isAdmin && <Route path="/admin" element={<Admin />} />}
            <Route path="*" element={<Navigate to="/" />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" />} />
        )}
      </Routes>
      {user && <Navbar key={user.id} user={user} onLogout={() => setUser(null)} />}
    </BrowserRouter>
  );
}

export default App;
