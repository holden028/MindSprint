import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

function decodeJwtUser(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      id: payload.user_id,
      email: payload.email,
      is_admin: !!payload.is_admin,
    };
  } catch {
    return null;
  }
}

function normalizeUser(user, { forceAdmin = false } = {}) {
  if (!user) return null;
  return {
    ...user,
    is_admin: forceAdmin || !!(user.is_admin || user.isAdmin),
  };
}

function persistSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  if (user?.is_admin) {
    localStorage.setItem('isAdmin', 'true');
  } else {
    localStorage.removeItem('isAdmin');
  }
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('isAdmin');
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!token) {
      setLoading(false);
      return;
    }

    if (storedUser) {
      try {
        setUser(normalizeUser(JSON.parse(storedUser), {
          forceAdmin: localStorage.getItem('isAdmin') === 'true',
        }));
      } catch {
        clearSession();
        setUser(null);
        setLoading(false);
        return;
      }
    }

    api.get('/auth/me')
      .then((response) => {
        const merged = normalizeUser({
          ...(storedUser ? JSON.parse(storedUser) : {}),
          ...response.data.user,
        }, { forceAdmin: localStorage.getItem('isAdmin') === 'true' });
        setUser(merged);
        localStorage.setItem('user', JSON.stringify(merged));
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user: nextUser } = response.data;
      const normalized = normalizeUser(nextUser);
      persistSession(token, normalized);
      setUser(normalized);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  };

  const adminLogin = async (email, password) => {
    try {
      const response = await api.post('/admin/login', { email, password });
      const { token, user: nextUser } = response.data;
      if (!token) {
        return { success: false, error: 'Login failed' };
      }
      const fromToken = decodeJwtUser(token) || {};
      const adminUser = normalizeUser({
        ...fromToken,
        ...nextUser,
        email: nextUser?.email || fromToken.email || email,
      }, { forceAdmin: true });
      persistSession(token, adminUser);
      setUser(adminUser);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  };

  const register = async (email, password) => {
    try {
      const response = await api.post('/auth/register', { email, password });
      const { token, user: nextUser } = response.data;
      const normalized = normalizeUser(nextUser);
      persistSession(token, normalized);
      setUser(normalized);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed'
      };
    }
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, adminLogin, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
