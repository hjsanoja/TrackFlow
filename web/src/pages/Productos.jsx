import { useEffect, useState, useMemo } from 'react';
import {
  collection, getDocs, doc, setDoc, deleteDoc
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';

const CATEGORIAS = [
  'Analgésicos',
  'Antialérgicos',
  'Antibióticos',
  'Antigripales',
  'Cardiovasculares',
  'Dermatológicos',
  'Gastrointestinales',
  'Vitaminas',
  'Otros',
];

export default function Productos() {
  const [productos, setProductos] = useState([]);
  const [competencia, setCompetencia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filtroActivo, setFiltroActivo] = useState('todos');
  const [filtroUrls, setFiltroUrls] = useState('todos'); // todos | con_urls | sin_urls
  const [message, setMessage] = useState(null);
  const navigate = useNavigate();

  const cargar = async () => {
    setLoading(true);
    try {
      const [pSnap, pcSnap] = await Promise.all([
        getDocs(collection(db, 'productos')),
        getDocs(collection(db, 'productos_competencia')),
      ]);
      const docs = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (a.id_interno || '').localeCompare(b.id_interno || ''));
      setProductos(docs);
      setCompetencia(pcSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al cargar: ' + err.message });
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  // Cuenta URLs activas por producto
  const urlsPorProducto = useMemo(() => {
    const map = new Map();
    for (const c of competencia) {
      if (c.activo) {
        map.set(c.id_producto_propio, (map.get(c.id_producto_propio) || 0) + 1);
      }
    }
    return map;
  }, [competencia]);

  const filtrados = useMemo(() => {
    const term = search.toLowerCase().trim();
    return productos.filter(p => {
      if (filtroActivo === 'activos' && !p.activo) return false;
      if (filtroActivo === 'inactivos' && p.activo) return false;
      const count = urlsPorProducto.get(p.id_interno) || 0;
      if (filtroUrls === 'con_urls' && count === 0) return false;
      if (filtroUrls === 'sin_urls' && count > 0) return false;
      if (!term) return true;
      return (
        (p.nombre || '').toLowerCase().includes(term) ||
        (p.laboratorio || '').toLowerCase().includes(term) ||
        (p.principio_activo || '').toLowerCase().includes(term)
      );
    });
  }, [productos, search, filtroActivo, filtroUrls, urlsPorProducto]);

  // Cuántos productos están "huérfanos" (sin URLs)
  const huerfanos = useMemo(() => {
    return productos.filter(p => p.activo && (urlsPorProducto.get(p.id_interno) || 0) === 0).length;
  }, [productos, urlsPorProducto]);

  const handleSave = async (data, isNew) => {
    try {
      const id = data.id_interno.trim();
      if (!id) throw new Error('El ID interno es obligatorio');
      if (isNew && productos.some(p => p.id_interno === id)) {
        throw new Error('Ya existe un producto con ese ID interno');
      }
      await setDoc(doc(db, 'productos', id), {
        ...data,
        pvp_propio_usd: data.pvp_propio_usd ? parseFloat(data.pvp_propio_usd) : null,
      });
      setMessage({ type: 'success', text: isNew ? 'Producto creado' : 'Producto actualizado' });
      setEditing(null);
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDelete = async (producto) => {
    const count = urlsPorProducto.get(producto.id_interno) || 0;
    const extra = count > 0 ? `\n\nATENCIÓN: este producto tiene ${count} URL(s) de competencia activa(s). Las URLs no se eliminan automáticamente.` : '';
    const confirmar = window.confirm(
      `¿Eliminar "${producto.nombre}"?${extra}\n\nLa acción no se puede deshacer.`
    );
    if (!confirmar) return;

    try {
      await deleteDoc(doc(db, 'productos', producto.id));
      setMessage({ type: 'success', text: 'Producto eliminado' });
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al eliminar: ' + err.message });
    }
  };

  const handleToggleActivo = async (producto) => {
    try {
      await setDoc(doc(db, 'productos', producto.id), {
        ...producto,
        activo: !producto.activo,
      }, { merge: true });
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const irACompetencia = (idInterno) => {
    // Navegamos a /competencia con un parametro que la otra pagina lee
    // (lo soportaremos con un query string)
    navigate(`/competencia?producto=${encodeURIComponent(idInterno)}`);
  };

  const sugerirId = () => {
    const numeros = productos
      .map(p => p.id_interno)
      .filter(id => /^P\d+$/.test(id))
      .map(id => parseInt(id.slice(1), 10));
    const max = numeros.length > 0 ? Math.max(...numeros) : 0;
    return 'P' + String(max + 1).padStart(3, '0');
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Productos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tu catálogo de productos a monitorear</p>
        </div>
        <button onClick={() => setEditing('new')}
          className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          + Agregar producto
        </button>
      </div>

      {huerfanos > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-900 flex items-center justify-between">
          <span>
            <strong>{huerfanos} producto{huerfanos > 1 ? 's activos no se están' : ' activo no se está'} monitoreando</strong>
            {' '}porque no {huerfanos > 1 ? 'tienen' : 'tiene'} URLs de competencia cargadas.
          </span>
          <button onClick={() => setFiltroUrls('sin_urls')}
            className="text-xs px-2 py-1 bg-amber-100 hover:bg-amber-200 rounded">
            Ver cuáles
          </button>
        </div>
      )}

      {message && (
        <div className={`px-4 py-3 rounded-md text-sm flex items-start justify-between ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200'
          : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-2 text-current opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <input type="text" placeholder="Buscar..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex bg-gray-100 rounded-md p-0.5 text-xs">
          <button onClick={() => setFiltroActivo('todos')}
            className={`px-3 py-1 rounded ${filtroActivo === 'todos' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>Todos</button>
          <button onClick={() => setFiltroActivo('activos')}
            className={`px-3 py-1 rounded ${filtroActivo === 'activos' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>Activos</button>
          <button onClick={() => setFiltroActivo('inactivos')}
            className={`px-3 py-1 rounded ${filtroActivo === 'inactivos' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>Inactivos</button>
        </div>
        <div className="flex bg-gray-100 rounded-md p-0.5 text-xs">
          <button onClick={() => setFiltroUrls('todos')}
            className={`px-3 py-1 rounded ${filtroUrls === 'todos' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>Todas las URLs</button>
          <button onClick={() => setFiltroUrls('con_urls')}
            className={`px-3 py-1 rounded ${filtroUrls === 'con_urls' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>Con URLs</button>
          <button onClick={() => setFiltroUrls('sin_urls')}
            className={`px-3 py-1 rounded ${filtroUrls === 'sin_urls' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}>Sin URLs</button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {search || filtroActivo !== 'todos' || filtroUrls !== 'todos'
              ? 'Sin resultados con los filtros actuales.'
              : 'Aún no hay productos.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">ID</th>
                  <th className="text-left px-4 py-3 font-medium">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium">Laboratorio</th>
                  <th className="text-left px-4 py-3 font-medium">Categoría</th>
                  <th className="text-right px-4 py-3 font-medium">PVP USD</th>
                  <th className="text-center px-4 py-3 font-medium">URLs</th>
                  <th className="text-center px-4 py-3 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const count = urlsPorProducto.get(p.id_interno) || 0;
                  return (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">{p.id_interno}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{p.nombre}</div>
                        <div className="text-xs text-gray-500">{p.presentacion}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.laboratorio}</td>
                      <td className="px-4 py-3 text-gray-600">{p.categoria || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {p.pvp_propio_usd != null ? '$' + p.pvp_propio_usd.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => irACompetencia(p.id_interno)}
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            count === 0
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                          title={count === 0 ? 'Sin URLs - click para agregar' : 'Click para ver/editar'}>
                          {count === 0 ? 'sin URLs' : `${count} URL${count > 1 ? 's' : ''}`}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleToggleActivo(p)}
                          className={`text-xs px-2 py-0.5 rounded ${
                            p.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setEditing(p.id)}
                          className="text-xs text-blue-600 hover:underline mr-3">Editar</button>
                        <button onClick={() => handleDelete(p)}
                          className="text-xs text-red-600 hover:underline">Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ProductoModal
          producto={editing === 'new' ? null : productos.find(p => p.id === editing)}
          sugerirId={sugerirId}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProductoModal({ producto, sugerirId, onSave, onClose }) {
  const isNew = !producto;
  const [form, setForm] = useState({
    id_interno: producto?.id_interno || sugerirId(),
    nombre: producto?.nombre || '',
    laboratorio: producto?.laboratorio || '',
    principio_activo: producto?.principio_activo || '',
    presentacion: producto?.presentacion || '',
    categoria: producto?.categoria || '',
    pvp_propio_usd: producto?.pvp_propio_usd ?? '',
    activo: producto?.activo ?? true,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form, isNew);
    setSaving(false);
  };

  const handleChange = (key, value) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{isNew ? 'Nuevo producto' : 'Editar producto'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label="ID interno *" hint="P001, P002, ... — identificador único">
            <input type="text" required value={form.id_interno}
              onChange={e => handleChange('id_interno', e.target.value)}
              disabled={!isNew}
              className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Field>
          <Field label="Nombre comercial *">
            <input type="text" required value={form.nombre}
              onChange={e => handleChange('nombre', e.target.value)}
              placeholder="Ej. Acetaminofén La Santé"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Laboratorio">
              <input type="text" value={form.laboratorio}
                onChange={e => handleChange('laboratorio', e.target.value)}
                placeholder="La Santé"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="Categoría">
              <select value={form.categoria} onChange={e => handleChange('categoria', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Selecciona —</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Principio activo">
            <input type="text" value={form.principio_activo}
              onChange={e => handleChange('principio_activo', e.target.value)}
              placeholder="Ej. Acetaminofén"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Field>
          <Field label="Presentación" hint="Concentración, cantidad, forma farmacéutica">
            <input type="text" value={form.presentacion}
              onChange={e => handleChange('presentacion', e.target.value)}
              placeholder="650 mg x 10 tabletas"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="PVP propio USD" hint="Tu precio de venta">
              <input type="number" step="0.01" min="0" value={form.pvp_propio_usd}
                onChange={e => handleChange('pvp_propio_usd', e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </Field>
            <Field label="Estado">
              <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md cursor-pointer">
                <input type="checkbox" checked={form.activo}
                  onChange={e => handleChange('activo', e.target.checked)} />
                <span className="text-sm">{form.activo ? 'Activo' : 'Inactivo'}</span>
              </label>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50">
              Cancelar
            </button>
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
