import { TrendingUp, Lock } from 'lucide-react';

interface LoginPromptProps {
  section: string;
  onLogin: () => void;
}

export default function LoginPrompt({ section, onLogin }: LoginPromptProps) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] space-y-5">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
        <Lock className="w-7 h-7 text-slate-400" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-slate-900 capitalize">{section}</h2>
        <p className="text-sm text-slate-500">Sign in to access your personal {section.toLowerCase()}.</p>
      </div>
      <button
        onClick={onLogin}
        className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full font-semibold hover:bg-zinc-800 hover:scale-105 active:scale-95 transition-all duration-200"
      >
        <TrendingUp className="w-4 h-4" />
        Sign In / Create Account
      </button>
    </div>
  );
}
