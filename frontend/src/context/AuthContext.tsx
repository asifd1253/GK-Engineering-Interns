import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { DataStorage } from '../utils/storage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    try {
      const currentUser = await DataStorage.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('[AuthContext] Failed to initialize session:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = (userData: User) => {
    setUser(userData);
  };

  const logout = async () => {
    await DataStorage.setCurrentUser(null);
    setUser(null);
  };

  const refreshUser = async () => {
    const fresh = await DataStorage.getMe();
    if (fresh) {
      await DataStorage.setCurrentUser(fresh);
      setUser(fresh);
    } else {
      const currentUser = await DataStorage.getCurrentUser();
      setUser(currentUser);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
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
