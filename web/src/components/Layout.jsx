import { NavLink, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function Layout({ user, userDoc, children }) {
  const isAdmin = userDoc?.rol === 'administrador';
  const handleLogout = () => signOut(auth);

  const navItems = [
    { to: '/', label: 'Dashboard', adminOnly: false },
    { to: '/productos', label: 'Productos', adminOnly: true },
    { to: '/competencia', label: 'Competencia', adminOnly: true },
    { to: '/cadenas', label: 'Cadenas', adminOnly: true },
    { to: '/usuarios', label: 'Usuarios', adminOnly: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <h1 className="text-lg font-semibold text-gray-900">TrackFlow</h1>
          <p className="text-xs text-gray-500 mt-0.5">Monitor de precios</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems
            .filter(item => !item.adminOnly || isAdmin)
            .map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>

        <div className="border-t border-gray-200 p-3">
          <div className="px-3 py-2 mb-2">
            <div className="text-sm font-medium text-gray-900 truncate">{userDoc?.nombre}</div>
            <div className="text-xs text-gray-500 capitalize">{userDoc?.rol}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md"
          >
            Salir
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-x-auto">
        {children}
      </main>
    </div>
  );
}
