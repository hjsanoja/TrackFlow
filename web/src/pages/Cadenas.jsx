import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Scrapers disponibles en el código actual. Agregaremos más cuando los escribamos.
const SCRAPERS_DISPONIBLES = [
  { value: 'farmatodo', label: 'Farmatodo' },
  { value: 'locatel', label: 'Locatel (pendiente)' },
  { value: 'farmadon', label: 'FarmaDON (pendiente)' },
  { value: 'grupo_san_ignacio', label: 'Grupo San Ignacio (pendiente)' },
  { value: 'xana', label: 'Farmacias Xana (pendiente)' },
  { value: 'farmago', label: 'FarmaGo (pendiente)' },
];

const SCRAPERS_IMPLEMENTADOS = new Set(['farmatodo']);

export default function Cadenas() {
  const [cadenas, setCadenas] = useState([]);
  const [competencia, setCompetencia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [cSnap, pcSnap] = await Promise.all([
        getDocs(collection(db, 'cadenas')),
        getDocs(collection(db, 'productos_competencia')),
      ]);
      const docs = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setCadenas(docs);
      setCompetencia(pcSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al cargar: ' + err.message });
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  // Cuenta URLs activas por cadena
  const urlsPorCadena = useMemo(() => {
    const map = new Map();
    for (const c of competencia) {
      if (c.activo) {
        map.set(c.cadena, (map.get(c.cadena) || 0) + 1);
      }
    }
    return map;
  }, [competencia]);

  const handleSave = async (data, isNew) => {
    try {
      const docId = data.nombre.trim().replace(/\s+/g, '_');
      if (!docId) throw new Error('El nombre es obligatorio');
      if (isNew && cadenas.some(c => c.id === docId)) {
        throw new Error('Ya existe una cadena con ese nombre');
      }
      await setDoc(doc(db, 'cadenas', docId), {
        nombre: data.nombre.trim(),
        website: data.website.trim(),
        scraper_modulo: data.scraper_modulo,
        activo: data.activo,
      });
      setMessage({ type: 'success', text: isNew ? 'Cadena creada' : 'Cambios guardados' });
      setEditing(null);
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDelete = async (cadena) => {
    const count = urlsPorCadena.get(cadena.nombre) || 0;
    const extra = count > 0 ? `\n\nATENCIÓN: hay ${count} URL(s) activa(s) asignadas a esta cadena. Esas URLs quedarán huérfanas pero no se eliminan automáticamente.` : '';
    const confirmar = window.confirm(
      `¿Eliminar la cadena "${cadena.nombre}"?${extra}\n\nLa acción no se puede deshacer.`
    );
    if (!confirmar) return;
    try {
      await deleteDoc(doc(db, 'cadenas', cadena.id));
      setMessage({ type: 'success', text: 'Cadena eliminada' });
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleToggleActivo = async (cadena) => {
    try {
      await setDoc(doc(db, 'cadenas', cadena.id), {
        activo: !cadena.activo,
      }, { merge: true });
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Cadenas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cadenas de farmacias a monitorear</p>
        </div>
        <button onClick={() => setEditing('new')}
          className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          + Agregar cadena
        </button>
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

      <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 text-sm text-blue-900">
        <strong>Nota:</strong> agregar una cadena aquí solo registra la entidad. Para que el scraper la procese,
        además necesitamos un módulo Python específico para esa cadena (uno por cadena). Por ahora solo está
        implementado <code className="bg-blue-100 px-1 rounded">farmatodo</code>.
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : cadenas.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Aún no hay cadenas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium">Website</th>
                  <th className="text-left px-4 py-3 font-medium">Scraper</th>
                  <th className="text-center px-4 py-3 font-medium">URLs activas</th>
                  <th className="text-center px-4 py-3 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cadenas.map(c => {
                  const implementado = SCRAPERS_IMPLEMENTADOS.has(c.scraper_modulo);
                  const count = urlsPorCadena.get(c.nombre) || 0;
                  return (
                    <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.nombre}</td>
                      <td className="px-4 py-3">
                        {c.website ? (
                          <a href={c.website} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline">
                            {c.website.replace(/^https?:\/\//, '')} ↗
                          </a>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{c.scraper_modulo}</code>
                        {!implementado && (
                          <span className="text-xs text-amber-600 ml-2">pendiente</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          count === 0 ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleToggleActivo(c)}
                          className={`text-xs px-2 py-0.5 rounded ${
                            c.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                          {c.activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setEditing(c.id)} className="text-xs text-blue-600 hover:underline mr-3">Editar</button>
                        <button onClick={() => handleDelete(c)} className="text-xs text-red-600 hover:underline">Eliminar</button>
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
        <CadenaModal
          cadena={editing === 'new' ? null : cadenas.find(c => c.id === editing)}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CadenaModal({ cadena, onSave, onClose }) {
  const isNew = !cadena;
  const [form, setForm] = useState({
    nombre: cadena?.nombre || '',
    website: cadena?.website || '',
    scraper_modulo: cadena?.scraper_modulo || 'farmatodo',
    activo: cadena?.activo ?? true,
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
          <h2 className="text-lg font-semibold text-gray-900">{isNew ? 'Nueva cadena' : 'Editar cadena'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label="Nombre *" hint="Ej. Farmatodo, Locatel, FarmaDON">
            <input type="text" required value={form.nombre}
              onChange={e => handleChange('nombre', e.target.value)}
              disabled={!isNew}
              className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Field>
          <Field label="Website" hint="Sitio web principal de la cadena">
            <input type="url" value={form.website}
              onChange={e => handleChange('website', e.target.value)}
              placeholder="https://www.farmatodo.com.ve"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Field>
          <Field label="Módulo scraper *" hint="Identificador técnico del módulo Python que procesará esta cadena">
            <select required value={form.scraper_modulo}
              onChange={e => handleChange('scraper_modulo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              {SCRAPERS_DISPONIBLES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Estado">
            <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={e => handleChange('activo', e.target.checked)} />
              <span className="text-sm">{form.activo ? 'Activa' : 'Inactiva'}</span>
            </label>
          </Field>
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
