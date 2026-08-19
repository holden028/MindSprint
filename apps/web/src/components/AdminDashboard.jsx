import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Shield, Users, Key, Trash2, Search, RefreshCw, DollarSign, TrendingUp, Activity, Clock, Target } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadUsers();
    loadAnalytics();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      if (error.response?.status === 403) {
        alert('Access denied. Admin privileges required.');
        navigate('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await api.get('/admin/analytics');
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  const handleResetPassword = async (userId) => {
    if (!newPassword || newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    if (!confirm('Are you sure you want to reset this user\'s password?')) return;

    try {
      await api.post(`/admin/users/${userId}/reset-password`, { newPassword });
      alert('Password reset successfully!');
      setNewPassword('');
      setSelectedUser(null);
    } catch (error) {
      console.error('Failed to reset password:', error);
      alert('Failed to reset password');
    }
  };

  const handleDeleteUser = async (userId, email) => {
    if (!confirm(`Are you sure you want to delete user ${email}? This action cannot be undone.`)) return;

    try {
      await api.delete(`/admin/users/${userId}`);
      alert('User deleted successfully');
      loadUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user');
    }
  };

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <LoadingSpinner embedded />;
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Shield className="text-red-400" size={28} />
            <h2 className="text-3xl font-bold text-white">Admin Dashboard</h2>
          </div>
        </div>
        {/* Revenue & Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="backdrop-blur-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-400/30 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/30 rounded-lg">
                <DollarSign className="text-green-300" size={24} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">${analytics?.revenue?.total || 0}</div>
                <div className="text-green-200 text-sm">Total Revenue (MRR)</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-green-200/70">
              ${analytics?.revenue?.monthly || 0}/mo • ${analytics?.revenue?.arpu || 0} ARPU
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Users className="text-blue-300" size={24} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{users.length}</div>
                <div className="text-white/60 text-sm">Total Users</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-white/50">
              {users.filter(u => new Date(u.created_at) > new Date(Date.now() - 7*24*60*60*1000)).length} this week
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <Activity className="text-purple-300" size={24} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{analytics?.engagement?.active_users || 0}</div>
                <div className="text-white/60 text-sm">Active Users (7d)</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-white/50">
              {analytics?.engagement?.engagement_rate || 0}% engagement rate
            </div>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-500/20 rounded-lg">
                <Target className="text-orange-300" size={24} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{analytics?.usage?.total_sessions || 0}</div>
                <div className="text-white/60 text-sm">Total Sessions</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-white/50">
              {analytics?.usage?.avg_session_duration || 0} min avg
            </div>
          </div>
        </div>

        {/* Advanced Analytics */}
        {analytics && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Growth Metrics */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <TrendingUp size={24} />
                Growth Metrics
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-white/70">User Growth (30d)</span>
                  <span className="text-white font-semibold">{analytics.growth?.user_growth_30d || 0}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(analytics.growth?.user_growth_30d || 0, 100)}%` }}></div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-white/70">Revenue Growth (30d)</span>
                  <span className="text-white font-semibold">{analytics.growth?.revenue_growth_30d || 0}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full" style={{ width: `${Math.min(analytics.growth?.revenue_growth_30d || 0, 100)}%` }}></div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-white/70">Retention Rate</span>
                  <span className="text-white font-semibold">{analytics.retention?.rate || 0}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div className="bg-gradient-to-r from-yellow-500 to-orange-500 h-2 rounded-full" style={{ width: `${analytics.retention?.rate || 0}%` }}></div>
                </div>
              </div>
            </div>

            {/* Usage Stats */}
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Clock size={24} />
                Usage Statistics
              </h3>
              <div className="space-y-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white/70 text-sm">Daily Active Users</span>
                    <span className="text-white font-semibold">{analytics.usage?.dau || 0}</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white/70 text-sm">Total Tasks Completed</span>
                    <span className="text-white font-semibold">{analytics.usage?.tasks_completed || 0}</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white/70 text-sm">Avg Sessions per User</span>
                    <span className="text-white font-semibold">{analytics.usage?.avg_sessions_per_user || 0}</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white/70 text-sm">Total Focus Time</span>
                    <span className="text-white font-semibold">{analytics.usage?.total_focus_hours || 0}h</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Actions */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Users size={24} />
              User Management
            </h2>
            <button
              onClick={loadUsers}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 rounded-lg transition-all"
            >
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by email..."
              className="w-full pl-10 pr-4 py-3 backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-white/70 font-medium pb-3 px-4">Email</th>
                  <th className="text-left text-white/70 font-medium pb-3 px-4">Created</th>
                  <th className="text-left text-white/70 font-medium pb-3 px-4">Projects</th>
                  <th className="text-left text-white/70 font-medium pb-3 px-4">Sessions</th>
                  <th className="text-right text-white/70 font-medium pb-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-4 px-4">
                      <div className="text-white">{user.email}</div>
                      <div className="text-white/50 text-xs">{user.id}</div>
                    </td>
                    <td className="py-4 px-4 text-white/70 text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-4 text-white/70">{user.project_count || 0}</td>
                    <td className="py-4 px-4 text-white/70">{user.session_count || 0}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedUser(selectedUser?.id === user.id ? null : user)}
                          className="p-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 rounded-lg transition-all"
                          title="Reset Password"
                        >
                          <Key size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg transition-all"
                          title="Delete User"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-white/40">
                No users found
              </div>
            )}
          </div>
        </div>

        {/* Password Reset Modal */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 max-w-md w-full">
              <h3 className="text-2xl font-bold text-white mb-4">Reset Password</h3>
              <p className="text-white/70 mb-6">
                Reset password for: <span className="text-white font-medium">{selectedUser.email}</span>
              </p>
              
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                className="w-full px-4 py-3 backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 mb-6"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => handleResetPassword(selectedUser.id)}
                  className="flex-1 px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 rounded-xl font-semibold transition-all"
                >
                  Reset Password
                </button>
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setNewPassword('');
                  }}
                  className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

