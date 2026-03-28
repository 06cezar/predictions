import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import type { User } from './api';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Predict } from './pages/Predict';
import { Rate } from './pages/Rate';
import { Reveal } from './pages/Reveal';
import { Leaderboard } from './pages/Leaderboard';
import { Admin } from './pages/Admin';
import { Bonus } from './pages/Bonus';
import { Navbar } from './components/Navbar';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.users.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
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
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to="/" /> : <Login onLogin={setUser} />
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
      {user && <Navbar user={user} onLogout={() => setUser(null)} />}
    </BrowserRouter>
  );
}

export default App;
