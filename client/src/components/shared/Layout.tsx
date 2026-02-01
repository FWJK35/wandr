import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { path: '/', icon: 'map', label: 'Map' },
  { path: '/explore', icon: 'search', label: 'Explore' },
  { path: '/quests', icon: 'target', label: 'Quests' },
  { path: '/feed', icon: 'feed', label: 'Feed' },
  { path: '/profile', icon: 'user', label: 'Profile' },
  { path: '/tools/geometry', icon: 'edit', label: 'Edit' },
];

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? '#7cc0ff' : '#9ca3af';
  switch (name) {
    case 'map':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Z" />
          <path d="M9 3v16" />
          <path d="M15 5v16" />
        </svg>
      );
    case 'search':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6" />
          <path d="m16.5 16.5 3 3" />
        </svg>
      );
    case 'target':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="2.5" />
          <circle cx="12" cy="12" r="7" />
          <path d="M12 3v2" />
          <path d="M21 12h-2" />
          <path d="M12 19v2" />
          <path d="M5 12H3" />
        </svg>
      );
    case 'feed':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
          <path d="M9 16h3" />
        </svg>
      );
    case 'user':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 19.5c1.3-2.3 3.8-3.5 6.5-3.5s5.2 1.2 6.5 3.5" />
        </svg>
      );
    case 'edit':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17.25V21h3.75L18.81 8.94l-3.75-3.75L3 17.25Z" />
          <path d="m14.06 5.19 3.75 3.75" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();

  // Hide bottom nav on map page for full-screen experience
  const isMapPage = location.pathname === '/';

  return (
    <div className="h-screen flex flex-col bg-dark-300">
      {/* Header - shown on all pages except map */}
      {!isMapPage && (
        <header className="bg-dark-200 border-b border-white/5 px-4 py-3 flex items-center justify-between">
          <h1 className="font-display font-bold text-xl text-primary-400">Wandr</h1>
          <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center">
            <span className="text-sm">{user?.displayName?.charAt(0) || '?'}</span>
          </div>
        </header>
      )}

      {/* Main content */}
      <main className={`flex-1 overflow-auto ${isMapPage ? '' : 'pb-20'}`}>
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className={`fixed bottom-0 left-0 right-0 bg-dark-200/95 backdrop-blur-lg border-t border-white/5 safe-area-pb ${isMapPage ? 'bg-dark-200/80' : ''}`}>
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'text-primary-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`
              }
            >
              <NavIcon name={item.icon} active={location.pathname === item.path} />
              <span className="text-xs font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

