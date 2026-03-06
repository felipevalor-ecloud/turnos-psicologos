import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PatientView } from './pages/PatientView';
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/AdminDashboard';
import type { Psychologist } from './lib/types';

function AdminRoute() {
  const [psychologist, setPsychologist] = useState<Psychologist | null>(() => {
    try {
      const stored = localStorage.getItem('psi_user');
      return stored ? (JSON.parse(stored) as Psychologist) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('psi_token'),
  );

  const handleLogin = (newToken: string, psych: Psychologist) => {
    setToken(newToken);
    setPsychologist(psych);
  };

  const handleLogout = () => {
    setToken(null);
    setPsychologist(null);
  };

  if (!token || !psychologist) {
    return <Login onLogin={handleLogin} />;
  }

  return <AdminDashboard psychologist={psychologist} onLogout={handleLogout} />;
}

export default function App() {
  // Sync token state if localStorage changes in another tab
  useEffect(() => {
    const handler = () => {
      if (!localStorage.getItem('psi_token')) {
        window.location.reload();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PatientView />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
