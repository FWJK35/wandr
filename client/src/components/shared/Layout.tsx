import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { path: '/', icon: '🗺️', label: 'Map' },
  { path: '/explore', icon: '🔍', label: 'Explore' },
  { path: '/quests', icon: '🎯', label: 'Quests' },
  { path: '/feed', icon: '📱', label: 'Feed' },
  { path: '/profile', icon: '👤', label: 'Profile' },
];

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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-dark-100 px-3 py-1 rounded-full">
              <span className="text-primary-400 font-semibold">{user?.points || 0}</span>
              <span className="text-xs text-gray-400">pts</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center">
              <span className="text-sm">{user?.displayName?.charAt(0) || '?'}</span>
            </div>
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
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
