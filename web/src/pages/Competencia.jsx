import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase';

const TIPOS = [
  { value: 'propio', label: 'Mi marca' },
  { value: 'alternativa', label: 'Alternativa (competencia)' },
];

export default function Competencia() {
  const [items, setItems] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cadenas, setCadenas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filtroCadena, setFiltroCadena] = useState('todas');
  const [filtroProducto, setFiltroProducto] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [message, setMessage] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Si llegamos con ?producto=P001, aplicamos ese filtro al cargar
  useEffect(() => {
    const productoParam = searchParams.get('producto');
    if (productoParam) {
      setFiltroProducto(productoParam);
    }
  }, [searchParams]);

  const cargar = async () => {
    setLoading(true);
    try {
      const [pcSnap, pSnap, cSnap] = await Promise.all([
        getDocs(collection(db, 'productos_competencia')),
        getDocs(collection(db, 'productos')),
        getDocs(collection(db, 'cadenas')),
      ]);
      setItems(pcSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProductos(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCadenas(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al cargar: ' + err.message });
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const term = search.toLowerCase().trim();
    return items.filter(it => {
      if (filtroCadena !== 'todas' && it.cadena !== filtroCadena) return false;
      if (filtroProducto !== 'todos' && it.id_producto_propio !== filtroProducto) return false;
      if (filtroTipo !== 'todos' && it.tipo !== filtroTipo) return false;
      if (!term) return true;
      return (
        (it.marca || '').toLowerCase().includes(term) ||
        (it.url || '').toLowerCase().includes(term)
      );
    });
  }, [items, search, filtroCadena, filtroProducto, filtroTipo]);

  const ordenados = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      return (a.id_producto_propio || '').localeCompare(b.id_producto_propio || '') ||
        (a.cadena || '').localeCompare(b.cadena || '') ||
        (a.marca || '').localeCompare(b.marca || '');
    });
  }, [filtrados]);

  // Si estamos viendo solo un producto y no tiene URLs, mostramos hint
  const productoFiltradoSinUrls = useMemo(() => {
    if (filtroProducto === 'todos') return null;
    if (ordenados.length > 0) return null;
    return productos.find(p => p.id_interno === filtroProducto) || null;
  }, [filtroProducto, ordenados, productos]);

  const handleSave = async (data, isNew) => {
    try {
      const docId = `${data.id_producto_propio}_${data.cadena}_${data.marca}`.replace(/\s+/g, '_');
      if (isNew && items.some(it => it.id === docId)) {
        throw new Error('Ya existe esta combinación de producto + cadena + marca');
      }
      const cadenaObj = cadenas.find(c => c.nombre === data.cadena);
      if (cadenaObj && cadenaObj.website && data.url) {
        try {
          const urlHost = new URL(data.url).hostname.replace(/^www\./, '');
          const cadenaHost = new URL(cadenaObj.website).hostname.replace(/^www\./, '');
          if (!urlHost.endsWith(cadenaHost) && !cadenaHost.endsWith(urlHost)) {
            const confirmar = window.confirm(
              `La URL parece ser de "${urlHost}" pero la cadena "${data.cadena}" usa "${cadenaHost}".\n\n¿Continuar?`
            );
            if (!confirmar) return;
          }
        } catch {
          throw new Error('La URL no es válida');
        }
      }
      await setDoc(doc(db, 'productos_competencia', docId), {
        id_producto_propio: data.id_producto_propio,
        cadena: data.cadena,
        tipo: data.tipo,
        marca: data.marca.trim(),
        url: data.url.trim(),
        activo: data.activo,
      }, { merge: !isNew });
      setMessage({ type: 'success', text: isNew ? 'URL creada' : 'Cambios guardados' });
      setEditing(null);
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDelete = async (item) => {
    const productoNombre = productos.find(p => p.id_interno === item.id_producto_propio)?.nombre || item.id_producto_propio;
    const confirmar = window.confirm(
      `¿Eliminar "${item.marca}" en ${item.cadena}?\n\nProducto: ${productoNombre}\nURL: ${item.url}\n\nLos registros históricos se conservan.`
    );
    if (!confirmar) return;
    try {
      await deleteDoc(doc(db, 'productos_competencia', item.id));
      setMessage({ type: 'success', text: 'Eliminado' });
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleToggleActivo = async (item) => {
    try {
      await setDoc(doc(db, 'productos_competencia', item.id), {
        activo: !item.activo,
      }, { merge: true });
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleScrapeNow = async () => {
    try {
      const secretSnap = await getDoc(doc(db, 'secrets', 'github_dispatch'));
      if (!secretSnap.exists()) throw new Error('Falta configurar el token GitHub.');
      const { token, repo_owner, repo_name, workflow_event_type } = secretSnap.data();
      const res = await fetch(
        `https://api.github.com/repos/${repo_owner}/${repo_name}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ event_type: workflow_event_type || 'run-scraper' }),
        }
      );
      if (res.status === 204) {
        setMessage({ type: 'success', text: 'Corrida disparada. Tarda 1-2 minutos.' });
      } else {
        const txt = await res.text();
        throw new Error(`GitHub respondió ${res.status}: ${txt}`);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const limpiarFiltros = () => {
    setSearch('');
    setFiltroCadena('todas');
    setFiltroProducto('todos');
    setFiltroTipo('todos');
    setSearchParams({});
  };

  const productoNombre = (id) => productos.find(p => p.id_interno === id)?.nombre || id;
  const formatPrice = (priceBs) => {
    if (priceBs == null) return '—';
    return 'Bs ' + priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Productos de competencia</h1>
          <p className="text-sm text-gray-500 mt-0.5">URLs que el scraper monitorea en cada cadena</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleScrapeNow}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50">
            Scrapear ahora
          </button>
          <button onClick={() => setEditing('new')}
            className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            + Agregar URL
          </button>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-md text-sm flex items-start justify-between ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200'
          : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-2 text-current opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {productoFiltradoSinUrls && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-900">
          <strong>"{productoFiltradoSinUrls.nombre}"</strong> aún no tiene URLs cargadas.
          {' '}Click <button onClick={() => setEditing('new')} className="underline font-medium">"+ Agregar URL"</button> para empezar a monitorearlo.
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3 flex-wrap">
        <input type="text" placeholder="Buscar por marca o URL..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={filtroProducto} onChange={(e) => setFiltroProducto(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="todos">Todos los productos</option>
          {productos.map(p => <option key={p.id} value={p.id_interno}>{p.nombre}</option>)}
        </select>
        <select value={filtroCadena} onChange={(e) => setFiltroCadena(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="todas">Todas las cadenas</option>
          {cadenas.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
        </select>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="todos">Todos los tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {(search || filtroCadena !== 'todas' || filtroProducto !== 'todos' || filtroTipo !== 'todos') && (
          <button onClick={limpiarFiltros} className="text-xs text-blue-600 hover:underline">Limpiar filtros</button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : ordenados.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {items.length === 0 ? 'Aún no hay URLs cargadas.' : 'Sin resultados con los filtros actuales.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Mi producto</th>
                  <th className="text-left px-4 py-3 font-medium">Cadena</th>
                  <th className="text-left px-4 py-3 font-medium">Marca</th>
                  <th className="text-left px-4 py-3 font-medium">Tipo</th>
                  <th className="text-right px-4 py-3 font-medium">Último precio</th>
                  <th className="text-center px-4 py-3 font-medium">Estado scrape</th>
                  <th className="text-center px-4 py-3 font-medium">Activo</th>
                  <th className="text-right px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map(it => (
                  <tr key={it.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-gray-900 truncate max-w-xs" title={productoNombre(it.id_producto_propio)}>
                        {productoNombre(it.id_producto_propio)}
                      </div>
                    </td>
                    <td className="px-4 py-3">{it.cadena}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{it.marca}</div>
                      <a href={it.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline truncate block max-w-xs" title={it.url}>
                        ver URL ↗
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        it.tipo === 'propio' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>{it.tipo}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {it.ultimo_precio_desc_bs ? (
                        <>
                          <div className="font-medium">{formatPrice(it.ultimo_precio_desc_bs)}</div>
                          {it.ultimo_precio_full_bs && it.ultimo_precio_full_bs !== it.ultimo_precio_desc_bs && (
                            <div className="text-xs text-gray-500 line-through">{formatPrice(it.ultimo_precio_full_bs)}</div>
                          )}
                        </>
                      ) : it.ultimo_precio_full_bs ? (
                        <span>{formatPrice(it.ultimo_precio_full_bs)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {it.estado === 'ok' && <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">OK</span>}
                      {it.estado === 'error' && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700" title={it.ultimo_error}>Error</span>}
                      {!it.estado && <span className="text-xs text-gray-400">sin datos</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleToggleActivo(it)}
                        className={`text-xs px-2 py-0.5 rounded ${
                          it.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                        {it.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(it.id)} className="text-xs text-blue-600 hover:underline mr-3">Editar</button>
                      <button onClick={() => handleDelete(it)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && ordenados.length > 0 && (
        <p className="text-xs text-gray-500 text-center">
          Mostrando {ordenados.length} de {items.length} URLs
        </p>
      )}

      {editing && (
        <CompetenciaModal
          item={editing === 'new' ? null : items.find(i => i.id === editing)}
          productoIdPreseleccionado={editing === 'new' && filtroProducto !== 'todos' ? filtroProducto : null}
          productos={productos}
          cadenas={cadenas}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CompetenciaModal({ item, productoIdPreseleccionado, productos, cadenas, onSave, onClose }) {
  const isNew = !item;
  const [form, setForm] = useState({
    id_producto_propio: item?.id_producto_propio || productoIdPreseleccionado || '',
    cadena: item?.cadena || '',
    tipo: item?.tipo || 'alternativa',
    marca: item?.marca || '',
    url: item?.url || '',
    activo: item?.activo ?? true,
  });
  const [saving, setSaving] = useState(false);

  const productosActivos = productos.filter(p => p.activo);
  const cadenasActivas = cadenas.filter(c => c.activo);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.id_producto_propio || !form.cadena || !form.marca || !form.url) return;
    setSaving(true);
    await onSave(form, isNew);
    setSaving(false);
  };

  const handleChange = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const probarUrl = () => { if (form.url) window.open(form.url, '_blank', 'noopener,noreferrer'); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{isNew ? 'Nueva URL de competencia' : 'Editar URL'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label="Mi producto *" hint="¿A cuál de tus productos corresponde esta URL?">
            <select required value={form.id_producto_propio}
              onChange={e => handleChange('id_producto_propio', e.target.value)}
              disabled={!isNew}
              className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Selecciona producto —</option>
              {productosActivos.map(p => (
                <option key={p.id} value={p.id_interno}>{p.id_interno} · {p.nombre}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cadena *">
              <select required value={form.cadena}
                onChange={e => handleChange('cadena', e.target.value)}
                disabled={!isNew}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Selecciona —</option>
                {cadenasActivas.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </Field>
            <Field label="Tipo *">
              <select required value={form.tipo} onChange={e => handleChange('tipo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Marca *" hint="Marca comercial real que vende esa cadena">
            <input type="text" required value={form.marca}
              onChange={e => handleChange('marca', e.target.value)}
              disabled={!isNew}
              placeholder="La Santé"
              className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Field>
          <Field label="URL del producto *" hint="Link directo a la página del producto">
            <div className="flex gap-2">
              <input type="url" required value={form.url}
                onChange={e => handleChange('url', e.target.value)}
                placeholder="https://www.farmatodo.com.ve/producto/..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={probarUrl} disabled={!form.url}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">Abrir ↗</button>
            </div>
          </Field>
          <Field label="Estado">
            <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={e => handleChange('activo', e.target.checked)} />
              <span className="text-sm">{form.activo ? 'Activo (se scrapeará)' : 'Inactivo (no se scrapeará)'}</span>
            </label>
          </Field>
          {!isNew && (
            <div className="bg-gray-50 rounded-md p-3 text-xs text-gray-600">
              <strong>Nota:</strong> el producto, cadena y marca no se pueden cambiar. Si necesitas un cambio, elimina y crea una nueva.
            </div>
          )}
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Guardando...' : isNew ? 'Crear' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
