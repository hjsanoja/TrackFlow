import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [debugMessage, setDebugMessage] = useState('');

  useEffect(() => {
    console.log('[App] montando, escuchando auth...');
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[App] onAuthStateChanged disparado. Usuario:', firebaseUser?.email);

      if (firebaseUser) {
        const docId = firebaseUser.email.toLowerCase().replace('@', '_at_').replaceAll('.', '_');
        console.log('[App] Buscando doc Firestore con ID:', docId);

        try {
          const snap = await getDoc(doc(db, 'usuarios', docId));
          console.log('[App] snap.exists():', snap.exists());
          if (snap.exists()) {
            console.log('[App] snap.data():', snap.data());
            const data = snap.data();

            if (data.activo === true || data.activo === 'si' || data.activo === 'sí') {
              console.log('[App] Usuario activo. Login OK.');
              setUser(firebaseUser);
              setUserDoc(data);
            } else {
              console.warn('[App] Usuario existe pero activo es:', data.activo);
              setDebugMessage(`Usuario encontrado pero campo activo = ${JSON.stringify(data.activo)}`);
              await signOut(auth);
            }
          } else {
            console.warn('[App] No se encontró el documento del usuario en Firestore.');
            setDebugMessage(`No se encontró el documento en usuarios/${docId}`);
            await signOut(auth);
          }
        } catch (err) {
          console.error('[App] Error al cargar perfil:', err);
          setDebugMessage(`Error al leer Firestore: ${err.code} - ${err.message}`);
          await signOut(auth);
        }
      } else {
        setUser(null);
        setUserDoc(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  return (
    <>
      {debugMessage && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
          DEBUG: {debugMessage}
        </div>
      )}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/" element={user ? <Dashboard user={user} userDoc={userDoc} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}
