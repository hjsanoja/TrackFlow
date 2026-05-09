import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Hook que devuelve la tasa BCV actual desde Firestore.
// Si no hay tasa en Firestore o es vieja, intenta jalar desde pydolarve.org.
export function useBcvRate() {
  const [rate, setRate] = useState(null);
  const [source, setSource] = useState(null); // 'auto' o 'manual'
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadFromFirestore = async () => {
    const q = query(collection(db, 'bcv_rates'), orderBy('updated_at', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      setRate(data.value);
      setSource(data.source);
      setUpdatedAt(data.updated_at?.toDate?.() || null);
      return data;
    }
    return null;
  };

  const fetchFromPyDolar = async () => {
    try {
      const res = await fetch('https://pydolarve.org/api/v2/dollar?page=bcv');
      if (!res.ok) throw new Error('pydolarve respondió con error');
      const json = await res.json();
      const value = json?.monitors?.usd?.price || json?.price;
      if (typeof value === 'number' && value > 0) {
        return value;
      }
      throw new Error('formato inesperado');
    } catch (err) {
      console.warn('No pude obtener tasa de pydolarve:', err.message);
      return null;
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const existing = await loadFromFirestore();
      // Si hay tasa de hoy, no la sobreescribimos
      const today = new Date().toDateString();
      const existingDate = existing?.updated_at?.toDate?.()?.toDateString?.();
      if (existing && existingDate === today) {
        setLoading(false);
        return;
      }

      // Intentar fetch automático
      const auto = await fetchFromPyDolar();
      if (auto) {
        await addDoc(collection(db, 'bcv_rates'), {
          value: auto,
          source: 'auto',
          updated_at: serverTimestamp(),
        });
        await loadFromFirestore();
      }
    } catch (err) {
      console.error('Error refrescando BCV:', err);
    }
    setLoading(false);
  };

  const setManual = async (value) => {
    if (!value || isNaN(value) || value <= 0) return;
    await addDoc(collection(db, 'bcv_rates'), {
      value: parseFloat(value),
      source: 'manual',
      updated_at: serverTimestamp(),
    });
    await loadFromFirestore();
  };

  useEffect(() => {
    refresh();
  }, []);

  return { rate, source, updatedAt, loading, refresh, setManual };
}
