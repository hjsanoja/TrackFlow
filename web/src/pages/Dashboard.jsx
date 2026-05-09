import { useEffect, useState, useMemo } from 'react';
import { signOut } from 'firebase/auth';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useBcvRate } from '../hooks/useBcvRate';
import ProductDetailModal from '../components/ProductDetailModal';

export default function Dashboard({ user, userDoc }) {
  const [productos, setProductos] = useState([]);
  const [productosCompetencia, setProductosCompetencia] = useState([]);
  const [ultimaCorrida, setUltimaCorrida] = useState(null);
  const [currency, setCurrency] = useState('usd');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const bcv = useBcvRate();

  const handleLogout = () => signOut(auth);

  // Cargar todos los datos al inicio
  useEffect(() => {
    (async () => {
      try {
        const [prodSnap, competSnap, runsSnap] = await Promise.all([
          getDocs(collection(db, 'productos')),
          getDocs(collection(db, 'productos_competencia')),
          getDocs(query(collection(db, 'scrape_runs'), orderBy('started_at', 'desc'), limit(1))),
        ]);
        setProductos(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setProductosCompetencia(competSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (!runsSnap.empty) {
          const data = runsSnap.docs[0].data();
          setUltimaCorrida({
            ...data,
            started_at: data.started_at?.toDate?.() || null,
          });
        }
      } catch (err) {
        console.error('Error cargando datos:', err);
      }
      setLoading(false);
    })();
  }, []);

  // Construir las filas de la tabla: una por producto propio
  const filas = useMemo(() => {
    const term = search.toLowerCase().trim();
    return productos
      .filter(p => p.activo)
      .filter(p => !term || (p.nombre || '').toLowerCase().includes(term))
      .map(p => {
        // Productos competencia agrupados por cadena
        const competencia = productosCompetencia.filter(
          pc => pc.id_producto_propio === p.id_interno
        );
        return { producto: p, competencia };
      });
  }, [productos, productosCompetencia, search]);

  // Cadenas unicas para columnas de la tabla
  const cadenasUnicas = useMemo(() => {
    const set = new Set(productosCompetencia.map(pc => pc.cadena));
    return Array.from(set).sort();
  }, [productosCompetencia]);

  // Conversion Bs <-> USD
  const fmt = (priceBs) => {
    if (priceBs == null) return null;
    if (currency === 'usd') {
      if (!bcv.rate) return null;
      return '$' + (priceBs / bcv.rate).toFixed(2);
    }
    return 'Bs ' + priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtUsd = (priceUsd) => {
    if (priceUsd == null) return null;
    if (currency === 'usd') return '$' + priceUsd.toFixed(2);
    if (!bcv.rate) return null;
    return 'Bs ' + (priceUsd * bcv.rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getPriceForCell = (competencia, cadena) => {
    // Buscar primero el "propio" (mi marca) en esa cadena
    const propio = competencia.find(c => c.cadena === cadena && c.tipo === 'propio');
    if (propio) {
      const precio = propio.ultimo_precio_desc_bs || propio.ultimo_precio_full_bs;
      return { precio, info: propio };
    }
    // Si no, devolver la primera alternativa
    const alt = competencia.find(c => c.cadena === cadena);
    if (alt) {
      const precio = alt.ultimo_precio_desc_bs || alt.ultimo_precio_full_bs;
      return { precio, info: alt };
    }
    return null;
  };

  const calcDelta = (precioBs, pvpUsd) => {
    if (!precioBs || !pvpUsd || !bcv.rate) return null;
    const competidorUsd = precioBs / bcv.rate;
    return ((competidorUsd - pvpUsd) / pvpUsd) * 100;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userDoc={userDoc} onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <TopBar
          bcv={bcv}
          ultimaCorrida={ultimaCorrida}
          currency={currency}
          setCurrency={setCurrency}
          search={search}
          setSearch={setSearch}
          isAdmin={userDoc?.rol === 'administrador'}
        />

        <Stats productos={productos} cadenasUnicas={cadenasUnicas} ultimaCorrida={ultimaCorrida} />

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Comparativa por producto</h2>
            <span className="text-xs text-gray-500">{filas.length} productos</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : filas.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {search ? 'No hay productos que coincidan con la búsqueda.' : 'Aún no hay productos cargados.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Producto</th>
                    <th className="text-right px-4 py-3 font-medium">Mi PVP</th>
                    {cadenasUnicas.map(c => (
                      <th key={c} className="text-right px-4 py-3 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(({ producto, competencia }) => (
                    <tr
                      key={producto.id}
                      onClick={() => setSelectedProduct({ producto, competencia })}
                      className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{producto.nombre}</div>
                        <div className="text-xs text-gray-500">{producto.presentacion}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {fmtUsd(producto.pvp_propio_usd) || '—'}
                      </td>
                      {cadenasUnicas.map(cadena => {
                        const cell = getPriceForCell(competencia, cadena);
                        if (!cell || !cell.precio) {
                          return <td key={cadena} className="px-4 py-3 text-right text-gray-300">—</td>;
                        }
                        const delta = calcDelta(cell.precio, producto.pvp_propio_usd);
                        const deltaColor = delta == null ? 'text-gray-400' :
                          Math.abs(delta) < 0.5 ? 'text-gray-400' :
                          delta < 0 ? 'text-green-600' : 'text-red-600';
                        return (
                          <td key={cadena} className="px-4 py-3 text-right">
                            <div>{fmt(cell.precio)}</div>
                            {delta != null && (
                              <div className={`text-xs ${deltaColor}`}>
                                {delta > 0 ? '+' : ''}{delta.toFixed(0)}%
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          Click en una fila para ver el histórico del producto
        </p>
      </main>

      {selectedProduct && (
        <ProductDetailModal
          producto={selectedProduct.producto}
          competencia={selectedProduct.competencia}
          currency={currency}
          bcvRate={bcv.rate}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}

function Header({ userDoc, onLogout }) {
  return (
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
          <button onClick={onLogout} className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50">
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}

function TopBar({ bcv, ultimaCorrida, currency, setCurrency, search, setSearch, isAdmin }) {
  const [editingBcv, setEditingBcv] = useState(false);
  const [bcvInput, setBcvInput] = useState('');

  const handleSaveBcv = async () => {
    await bcv.setManual(bcvInput);
    setBcvInput('');
    setEditingBcv(false);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Tasa BCV</span>
          {editingBcv ? (
            <>
              <input
                type="number"
                step="0.01"
                value={bcvInput}
                onChange={(e) => setBcvInput(e.target.value)}
                className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder="0.00"
              />
              <button onClick={handleSaveBcv} className="text-xs px-2 py-1 bg-blue-600 text-white rounded">Guardar</button>
              <button onClick={() => setEditingBcv(false)} className="text-xs px-2 py-1 text-gray-500">Cancelar</button>
            </>
          ) : (
            <>
              <span className="font-medium">
                {bcv.loading ? 'cargando...' : bcv.rate ? `Bs ${bcv.rate.toFixed(2)} / USD` : 'sin tasa'}
              </span>
              <span className="text-xs text-gray-400">({bcv.source || '—'})</span>
              {isAdmin && (
                <button onClick={() => { setEditingBcv(true); setBcvInput(bcv.rate || ''); }} className="text-xs text-blue-600 hover:underline">editar</button>
              )}
              <button onClick={bcv.refresh} className="text-xs text-blue-600 hover:underline">↻</button>
            </>
          )}
        </div>

        {ultimaCorrida && (
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Última corrida</span>
            <span className="font-medium">
              {ultimaCorrida.started_at ? formatTimeAgo(ultimaCorrida.started_at) : '—'}
            </span>
            <span className="text-xs text-gray-400">({ultimaCorrida.ok}/{ultimaCorrida.total} ok)</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3 pr-3 py-1.5 border border-gray-300 rounded-md text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex bg-gray-100 rounded-md p-0.5">
          <button
            onClick={() => setCurrency('usd')}
            className={`text-xs px-3 py-1 rounded ${currency === 'usd' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}
          >USD</button>
          <button
            onClick={() => setCurrency('bs')}
            className={`text-xs px-3 py-1 rounded ${currency === 'bs' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}
          >Bs</button>
        </div>
      </div>
    </div>
  );
}

function Stats({ productos, cadenasUnicas, ultimaCorrida }) {
  const stats = [
    { label: 'Productos', value: productos.filter(p => p.activo).length },
    { label: 'Cadenas activas', value: cadenasUnicas.length },
    { label: 'Última corrida', value: ultimaCorrida ? `${ultimaCorrida.ok}/${ultimaCorrida.total}` : '—' },
    { label: 'Errores', value: ultimaCorrida ? ultimaCorrida.errores : 0 },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">{s.label}</div>
          <div className="text-2xl font-medium text-gray-900 mt-1">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'hace unos segundos';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
