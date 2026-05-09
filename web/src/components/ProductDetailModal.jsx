import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#ea580c', '#7c3aed', '#0891b2', '#db2777'];

export default function ProductDetailModal({ producto, competencia, currency, bcvRate, onClose }) {
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // Query simple: solo filtra por producto (no requiere indice compuesto)
        // Ordenamos en el cliente.
        const q = query(
          collection(db, 'historico_precios'),
          where('id_producto_propio', '==', producto.id_interno)
        );
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({
          ...d.data(),
          scraped_at: d.data().scraped_at?.toDate?.() || null,
        }));
        // Orden ascendente por fecha
        docs.sort((a, b) => (a.scraped_at?.getTime() || 0) - (b.scraped_at?.getTime() || 0));
        setHistorico(docs);
      } catch (err) {
        console.error('Error cargando histórico:', err);
        setError(err.message);
      }
      setLoading(false);
    })();
  }, [producto.id_interno]);

  // Pivot: convertir historico en serie por marca-cadena, agrupado por dia.
  const chartData = (() => {
    const byDate = new Map();
    const marcasVistas = new Set();

    for (const h of historico) {
      if (!h.scraped_at) continue;
      const dateKey = h.scraped_at.toISOString().slice(0, 10);
      const marca = `${h.marca} (${h.cadena})`;
      marcasVistas.add(marca);

      const precioBs = h.precio_desc_bs || h.precio_full_bs;
      if (!precioBs) continue;
      const precio = currency === 'usd' && bcvRate ? precioBs / bcvRate : precioBs;

      if (!byDate.has(dateKey)) byDate.set(dateKey, { date: dateKey });
      byDate.get(dateKey)[marca] = parseFloat(precio.toFixed(2));
    }

    return {
      data: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
      marcas: Array.from(marcasVistas),
    };
  })();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{producto.nombre}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {producto.laboratorio} · {producto.presentacion}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Precios actuales por cadena</h3>
            <div className="border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Cadena</th>
                    <th className="text-left px-3 py-2 font-medium">Marca</th>
                    <th className="text-left px-3 py-2 font-medium">Tipo</th>
                    <th className="text-right px-3 py-2 font-medium">Precio normal</th>
                    <th className="text-right px-3 py-2 font-medium">Con descuento</th>
                  </tr>
                </thead>
                <tbody>
                  {competencia.length === 0 && (
                    <tr><td colSpan="5" className="px-3 py-4 text-center text-gray-400">Sin datos de competencia</td></tr>
                  )}
                  {competencia.map(pc => (
                    <tr key={pc.id} className="border-t border-gray-100">
                      <td className="px-3 py-2">{pc.cadena}</td>
                      <td className="px-3 py-2">{pc.marca}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${pc.tipo === 'propio' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {pc.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{formatPrice(pc.ultimo_precio_full_bs, currency, bcvRate)}</td>
                      <td className="px-3 py-2 text-right">{formatPrice(pc.ultimo_precio_desc_bs, currency, bcvRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              Tendencia ({currency === 'usd' ? 'USD' : 'Bs'})
            </h3>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-gray-400">Cargando histórico...</div>
            ) : error ? (
              <div className="h-64 flex items-center justify-center text-red-500 text-sm">{error}</div>
            ) : chartData.data.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                Aún no hay suficiente historial. Cada corrida del scraper agrega datos.
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={chartData.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {chartData.marcas.map((m, i) => (
                      <Line
                        key={m}
                        type="monotone"
                        dataKey={m}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatPrice(priceBs, currency, bcvRate) {
  if (priceBs == null) return <span className="text-gray-300">—</span>;
  if (currency === 'usd') {
    if (!bcvRate) return <span className="text-gray-300">—</span>;
    return '$' + (priceBs / bcvRate).toFixed(2);
  }
  return 'Bs ' + priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
