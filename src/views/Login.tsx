import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Tv, Key, User, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { api, setAuthData } from '../services/api';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.login({ username, password });
      setAuthData(res.token, res.username, res.role);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      
      {/* Decorative Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        {/* Brand logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25 mb-4">
            <Tv className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
          <p className="text-slate-400 text-sm mt-1">Sync, watch, and chat with friends</p>
        </div>

        {/* Form Container */}
        <div className="glass-panel p-8 rounded-3xl shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span className="text-sm text-red-300 leading-snug">{error}</span>
              </div>
            )}

            {/* Username */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-800 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white placeholder-slate-500 transition-all"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                  <Key className="w-5 h-5" />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-800 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white placeholder-slate-500 transition-all"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50 text-white py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/10 hover:shadow-blue-600/30 hover:-translate-y-[1px] disabled:pointer-events-none"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Logging in...
                </>
              ) : (
                <>
                  Log In
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Bottom prompt */}
        <p className="text-center text-sm text-slate-500 mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
};
