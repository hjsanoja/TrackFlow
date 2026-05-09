import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function Dashboard({ user, userDoc }) {
  const handleLogout = () => signOut(auth);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">TrackFlow</h1>
            <span className="text-sm text-gray-500">Monitor de precios</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-right">
              <div className="text-gray-900 font-medium">{userDoc?.nombre}</div>
              <div className="text-gray-500 text-xs capitalize">{userDoc?.rol}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            ¡Bienvenido, {userDoc?.nombre}!
          </h2>
          <p className="text-gray-500 mb-6">
            Login funcionando correctamente. Próximo paso: el dashboard real.
          </p>
          <div className="text-sm text-gray-400">
            Email: {user?.email} · Rol: {userDoc?.rol}
          </div>
        </div>
      </main>
    </div>
  );
}
