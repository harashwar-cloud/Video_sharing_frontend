import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Tv, Shield, Zap, MapPin, MessageSquare, BarChart } from 'lucide-react';
import { getToken } from '../services/api';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleStart = () => {
    if (getToken()) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const features = [
    {
      icon: <Tv className="w-6 h-6 text-blue-500" />,
      title: 'Host-Controlled Sync',
      description: 'The administrator plays, pauses, seeks, and shifts videos. Connected viewers sync instantly with <200ms latency.',
    },
    {
      icon: <Zap className="w-6 h-6 text-purple-500" />,
      title: 'Real-Time WebSockets',
      description: 'Powered by Spring Boot WebSocket STOMP for lightweight, instant, bidirectionally synchronized frame coordination.',
    },
    {
      icon: <MessageSquare className="w-6 h-6 text-emerald-500" />,
      title: 'Interactive Chat & Emojis',
      description: 'Engage with fellow viewers through live chats, emoji reactions, typing indicators, and immediate image attachments.',
    },
    {
      icon: <MapPin className="w-6 h-6 text-pink-500" />,
      title: 'Geospatial Viewer Map',
      description: 'Opt-in to share your location and watch all viewers map out dynamically in real-time across an interactive Leaflet map.',
    },
    {
      icon: <BarChart className="w-6 h-6 text-amber-500" />,
      title: 'Session Analytics',
      description: 'Monitor active viewer rates, peak audience sizes, watch time metrics, and connection latency in real-time.',
    },
    {
      icon: <Shield className="w-6 h-6 text-cyan-500" />,
      title: 'Role-Based Authentication',
      description: 'Secured by standard JWT credentials with strict verification rules parsing admin and viewer roles.',
    },
  ];

  return (
    <div className="min-height-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Tv className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            SyncStream
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/login')}
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={() => navigate('/register')}
            className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-all shadow-md shadow-blue-600/10 hover:shadow-blue-600/35 hover:-translate-y-[1px]"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-16 flex flex-col items-center justify-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-3xl flex flex-col items-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
            Empowering Co-Watching Experiences
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight">
            Synchronized Streaming{' '}
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              In Real Time
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl leading-relaxed">
            Host watch parties where players stay perfectly matched. When the host hits play, pause, or seeks, everyone's screen updates instantly.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-16">
            <button
              onClick={handleStart}
              className="text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-8 py-4 rounded-xl transition-all shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 hover:-translate-y-[2px]"
            >
              Start Watching Now
            </button>
            <button
              onClick={() => {
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-base font-semibold bg-slate-900/80 border border-slate-800 hover:bg-slate-850 text-slate-350 hover:text-white px-8 py-4 rounded-xl transition-all"
            >
              Explore Features
            </button>
          </div>
        </motion.div>

        {/* Feature Grid */}
        <section id="features" className="w-full py-12 border-t border-slate-900/80 mt-12">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Why Choose SyncStream?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="glass-panel p-8 rounded-2xl flex flex-col items-start text-left hover:border-slate-700/65 transition-all hover:-translate-y-1"
              >
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl mb-5 flex items-center justify-center">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-slate-650 border-t border-slate-900/80 bg-slate-950/20">
        <p>© 2026 SyncStream. Built with Spring Boot, WebSockets & React.</p>
      </footer>
    </div>
  );
};
