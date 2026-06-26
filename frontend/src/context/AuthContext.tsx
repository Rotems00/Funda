import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

axios.defaults.withCredentials = true;

export interface AuthUser {
  userId: string;
  email: string;
  name?: string;
  picture?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signInWithGoogle: (credential: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const API_BASE = '/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_BASE}/auth/me`)
      .then(res => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signInWithGoogle = async (credential: string) => {
    const res = await axios.post(`${API_BASE}/auth/google`, { credential });
    setUser(res.data);
  };

  const signOut = async () => {
    await axios.post(`${API_BASE}/auth/logout`);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
