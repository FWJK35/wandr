import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../services/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('wandr_token');
    if (token) {
      authApi.getMe()
        .then((userData) => {
          setUser(userData);
        })
        .catch(() => {
          localStorage.removeItem('wandr_token');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { user: userData, token } = await authApi.login({ email, password });
    localStorage.setItem('wandr_token', token);
    setUser(userData);
  };

  const register = async (email: string, username: string, password: string) => {
    const { user: userData, token } = await authApi.register({ email, username, password });
    localStorage.setItem('wandr_token', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('wandr_token');
    setUser(null);
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...updates });
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
