import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Filter, Wallet, Star, Settings, HelpCircle, LogOut, Terminal, Bot } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Sidebar() {
  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/scanners', label: 'Market Scanners', icon: Filter },
    { to: '/chat', label: 'AI Chat', icon: Bot },
    { to: '/portfolio', label: 'Portfolio', icon: Wallet },
    { to: '/watchlist', label: 'Watchlist', icon: Star },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="hidden lg:flex flex-col p-4 gap-2 h-screen w-64 fixed left-0 top-0 pt-20 bg-slate-50 border-r border-slate-100">
      <div className="px-4 py-2 mb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <Terminal className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest leading-none">EGX Terminal</h3>
            <p className="text-[10px] text-slate-400">v1.0.0</p>
          </div>
        </div>
      </div>

      <nav className="space-y-1 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm',
                isActive
                  ? 'bg-white text-slate-900 shadow-sm font-semibold border border-slate-200/50'
                  : 'text-slate-500 hover:bg-slate-200/50',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn('w-5 h-5', isActive ? 'fill-slate-900' : '')} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="pt-4 border-t border-slate-200 space-y-1">
        <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-200/50 rounded-xl transition-all text-sm font-medium">
          <HelpCircle className="w-5 h-5" />
          <span>Support</span>
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-200/50 rounded-xl transition-all text-sm font-medium">
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
