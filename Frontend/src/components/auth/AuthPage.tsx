import { useState, FormEvent } from 'react';
import { TrendingUp, Mail, Lock, User, Eye, EyeOff, AlertCircle, X } from 'lucide-react';
import { registerUser, loginUser } from '../../data';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

interface AuthPageProps {
  onSuccess?: () => void;
}

export default function AuthPage({ onSuccess }: AuthPageProps) {
  const { login } = useAuth();
  const isModal = !!onSuccess;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data =
        mode === 'register'
          ? await registerUser(email, password, name)
          : await loginUser(email, password);
      login(data.access_token, data.user);
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
  };

  return (
    <div className={cn(!isModal && 'min-h-screen bg-slate-50 flex items-center justify-center p-4')}>
      <div className="w-full max-w-md">
        {/* Brand — hidden inside modal to save space */}
        {!isModal && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-black rounded-2xl mb-4 shadow-lg">
              <TrendingUp className="w-7 h-7 text-white" />
            </div>
            <div className="flex items-baseline justify-center gap-0.5">
              <span className="text-3xl font-black tracking-tighter text-slate-900">EGX</span>
              <span className="text-3xl font-black tracking-tighter text-emerald-600">Insight</span>
            </div>
            <p className="text-slate-500 text-sm mt-1">Egyptian Exchange terminal</p>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
          {/* Card header: modal title + close button */}
          {isModal && (
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-baseline gap-0.5">
                <span className="text-xl font-black tracking-tighter text-slate-900">EGX</span>
                <span className="text-xl font-black tracking-tighter text-emerald-600">Insight</span>
              </div>
              <button
                onClick={onSuccess}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex bg-slate-100 rounded-2xl p-1 mb-8">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cn(
                  'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200',
                  mode === m
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name field — register only */}
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ahmed Hassan"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 p-3 bg-rose-50 border border-rose-100 rounded-xl">
                <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                <p className="text-rose-700 text-sm">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-black text-white font-semibold rounded-xl hover:bg-zinc-800 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none mt-2"
            >
              {loading
                ? mode === 'login' ? 'Signing in…' : 'Creating account…'
                : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        {!isModal && (
          <p className="text-center text-xs text-slate-400 mt-6">
            Market data is for informational purposes only.
          </p>
        )}
      </div>
    </div>
  );
}
