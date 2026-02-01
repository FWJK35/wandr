import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/shared/Button';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDemoFill = () => {
    setEmail('demo@wandr.app');
    setPassword('password123');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-dark-400 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary-500/20 blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.16),transparent_60%)]" />
        <div className="absolute inset-0 auth-grid opacity-40" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.2em] text-gray-300">
              <span className="h-2 w-2 rounded-full bg-primary-400 animate-pulse" />
              Urban exploration platform
            </div>

            <div className="space-y-4">
              <h1 className="font-display text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                Discover your city with quests, rewards, and real time adventure.
              </h1>
              <p className="text-lg text-gray-300">
                Wandr turns neighborhoods into live missions. Track progress, earn rewards, and
                explore with a community of explorers.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="auth-float rounded-2xl border border-white/10 bg-dark-200/70 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Active today</p>
                <p className="mt-2 text-2xl font-semibold text-white">2,140+</p>
                <p className="text-sm text-gray-400">Explorers in motion</p>
              </div>
              <div className="auth-float rounded-2xl border border-white/10 bg-dark-200/70 p-4 backdrop-blur sm:translate-y-6">
                <p className="text-xs uppercase tracking-[0.25em] text-gray-400">New quests</p>
                <p className="mt-2 text-2xl font-semibold text-white">48</p>
                <p className="text-sm text-gray-400">Updated this week</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Live map</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Rewards wallet</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Team missions</span>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-dark-200/80 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-6">
              <h2 className="font-display text-3xl font-semibold text-white">Welcome back</h2>
              <p className="mt-2 text-sm text-gray-400">
                Sign in to continue your next urban story.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-300">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input w-full focus:ring-2 focus:ring-primary-500/40"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-300">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full focus:ring-2 focus:ring-primary-500/40"
                  placeholder="********"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-sm text-gray-400">
                <button
                  type="button"
                  onClick={handleDemoFill}
                  className="text-primary-300 transition hover:text-primary-200"
                >
                  Use demo login
                </button>
                <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Secure access</span>
              </div>

              <Button type="submit" loading={loading} className="w-full" size="lg">
                Sign In
              </Button>
            </form>

            <div className="mt-6 rounded-2xl border border-white/10 bg-dark-300/60 p-4 text-sm text-gray-300">
              <p className="font-medium text-white">Demo account</p>
              <p className="mt-1">demo@wandr.app</p>
              <p>password123</p>
            </div>

            <p className="mt-6 text-center text-sm text-gray-400">
              New here?{' '}
              <Link to="/register" className="text-primary-300 hover:text-primary-200">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
