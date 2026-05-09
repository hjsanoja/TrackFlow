import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

function emailToDocId(email) {
  return email.toLowerCase().replace('@', '_at_').replaceAll('.', '_');
}

export default function App() {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const docId = emailToDocId(firebaseUser.email);
          const snap = await getDoc(doc(db, 'usuarios', docId));
          if (snap.exists()) {
            const data = snap.data();
            const isActive = data.activo === true || data.activo === 'si' || data.activo === 'sí';
            if (isActive) {
              setUser(firebaseUser);
              setUserDoc(data);
            } else {
              await signOut(auth);
              alert('Tu usuario está inactivo. Contacta al administrador.');
            }
          } else {
            await signOut(auth);
            alert('Tu usuario no está registrado. Contacta al administrador.');
          }
        } catch (err) {
          console.error('Error al cargar perfil:', err);
          await signOut(auth);
          alert('Error al cargar perfil. Recarga la página.');
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
