import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Mail, Lock, AlertCircle } from 'lucide-react';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { adminLogin } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await adminLogin(email, password);
    if (result.success) {
      navigate('/admin/dashboard');
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 animate-gradient flex items-center justify-center p-4">
      <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-center mb-8">
          <div className="p-4 bg-red-500/20 rounded-2xl">
            <Shield className="text-red-400" size={48} />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-white text-center mb-2">Admin Access</h1>
        <p className="text-white/60 text-center mb-8">Restricted Area - Admin Credentials Required</p>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-400/30 rounded-lg flex items-center gap-3">
            <AlertCircle className="text-red-400" size={20} />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50" size={20} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                placeholder="admin@mindsprint.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-white/70 text-sm font-medium mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50" size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl font-semibold hover:from-red-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Authenticating...' : 'Admin Login'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-white/60 hover:text-white text-sm transition-colors"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

