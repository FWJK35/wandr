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
    <div className="min-h-screen flex flex-col items-center justify-center bg-dark-300 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold text-primary-400 mb-2">Wandr</h1>
          <p className="text-gray-400">Explore your city like never before</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Sign In
          </Button>
        </form>

        {/* Demo account hint */}
        <div className="mt-6 p-4 bg-dark-100 rounded-lg border border-white/5">
          <p className="text-sm text-gray-400 text-center">
            Demo account:<br />
            <span className="text-white">demo@wandr.app</span> / <span className="text-white">password123</span>
          </p>
        </div>

        {/* Sign up link */}
        <p className="mt-6 text-center text-sm text-gray-400">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary-400 hover:text-primary-300">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
