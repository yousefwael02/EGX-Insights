import { createContext, useContext, useState, ReactNode } from 'react';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('egx_token'));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('egx_user');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  });

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('egx_token', newToken);
    localStorage.setItem('egx_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('egx_token');
    localStorage.removeItem('egx_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
