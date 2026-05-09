import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Buscar el documento del usuario en Firestore
        const docId = firebaseUser.email.toLowerCase().replace('@', '_at_').replaceAll('.', '_');
        try {
          const snap = await getDoc(doc(db, 'usuarios', docId));
          if (snap.exists() && snap.data().activo) {
            setUser(firebaseUser);
            setUserDoc(snap.data());
          } else {
            // El usuario está autenticado pero no está en la colección o está inactivo
            await signOut(auth);
            setUser(null);
            setUserDoc(null);
            alert('Tu usuario no tiene acceso. Contacta al administrador.');
          }
        } catch (err) {
          console.error('Error al cargar perfil:', err);
          await signOut(auth);
          setUser(null);
          setUserDoc(null);
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
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/" element={user ? <Dashboard user={user} userDoc={userDoc} /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
