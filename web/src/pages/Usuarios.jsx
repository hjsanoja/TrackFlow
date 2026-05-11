import { useEffect, useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const ROLES = [
  { value: 'administrador', label: 'Administrador', desc: 'Acceso completo, puede editar todo' },
  { value: 'lector', label: 'Lector', desc: 'Solo ver y exportar datos' },
];

function emailToDocId(email) {
  return email.toLowerCase().replace('@', '_at_').replaceAll('.', '_');
}

export default function Usuarios({ userDoc }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'usuarios'));
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setUsuarios(docs);
    } catch (err) {
      setMessage({ type: 'error', text: 'Error al cargar: ' + err.message });
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const handleSave = async (data, isNew) => {
    try {
      const email = data.email.trim().toLowerCase();
      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        throw new Error('Email inválido');
      }
      const docId = emailToDocId(email);
      if (isNew && usuarios.some(u => u.id === docId)) {
        throw new Error('Ya existe un usuario con ese email');
      }
      await setDoc(doc(db, 'usuarios', docId), {
        email,
        nombre: data.nombre.trim(),
        rol: data.rol,
        recibe_alertas_inmediatas: data.recibe_alertas_inmediatas,
        recibe_resumen_diario: data.recibe_resumen_diario,
        activo: data.activo,
      });
      setMessage({
        type: 'success',
        text: isNew
          ? `Usuario creado. IMPORTANTE: este usuario aún NO puede iniciar sesión. Crea su cuenta en Firebase Console → Authentication → Add user con el mismo email.`
          : 'Cambios guardados'
      });
      setEditing(null);
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleDelete = async (usuario) => {
    if (usuario.email === userDoc?.email) {
      setMessage({ type: 'error', text: 'No puedes eliminar tu propio usuario.' });
      return;
    }
    const confirmar = window.confirm(
      `¿Eliminar a "${usuario.nombre}" (${usuario.email})?\n\nIMPORTANTE: el documento se borra de Firestore, pero su cuenta de Firebase Auth queda activa. Para impedir el login completamente, también debes eliminarla en Firebase Console → Authentication.`
    );
    if (!confirmar) return;
    try {
      await deleteDoc(doc(db, 'usuarios', usuario.id));
      setMessage({ type: 'success', text: 'Usuario eliminado de Firestore.' });
      await cargar();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleToggleActivo = async (usuario) => {
    if (usuario.email === userDoc?.email && usuario.activo) {
      setMessage({ type: 'error', text: 'No puedes desactivar tu propio usuario.' });
      return;
    }
    try {
      await setDoc(doc(db, 'usuarios', usuario.id), {
        activo: !usuario.activo,
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
          <h1 className="text-xl font-semibold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">Quiénes tienen acceso al panel</p>
        </div>
        <button onClick={() => setEditing('new')}
          className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          + Invitar usuario
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
        <strong>Cómo invitar a alguien:</strong>
        <ol className="list-decimal ml-5 mt-1 space-y-0.5">
          <li>Click "+ Invitar usuario" y completa sus datos aquí.</li>
          <li>Ve a Firebase Console → Authentication → Add user con el mismo email y una contraseña temporal.</li>
          <li>Comparte el email + contraseña con la persona.</li>
        </ol>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : usuarios.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Aún no hay usuarios.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Rol</th>
                  <th className="text-center px-4 py-3 font-medium">Alertas</th>
                  <th className="text-center px-4 py-3 font-medium">Resumen diario</th>
                  <th className="text-center px-4 py-3 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => {
                  const isCurrent = u.email === userDoc?.email;
                  return (
                    <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{u.nombre}</span>
                        {isCurrent && <span className="ml-2 text-xs text-blue-600">(tú)</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          u.rol === 'administrador' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {u.rol}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {u.recibe_alertas_inmediatas ? '✓' : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {u.recibe_resumen_diario ? '✓' : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => handleToggleActivo(u)} disabled={isCurrent && u.activo}
                          className={`text-xs px-2 py-0.5 rounded ${
                            u.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          } ${isCurrent && u.activo ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setEditing(u.id)} className="text-xs text-blue-600 hover:underline mr-3">Editar</button>
                        <button onClick={() => handleDelete(u)} disabled={isCurrent}
                          className={`text-xs text-red-600 hover:underline ${isCurrent ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          Eliminar
                        </button>
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
        <UsuarioModal
          usuario={editing === 'new' ? null : usuarios.find(u => u.id === editing)}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function UsuarioModal({ usuario, onSave, onClose }) {
  const isNew = !usuario;
  const [form, setForm] = useState({
    email: usuario?.email || '',
    nombre: usuario?.nombre || '',
    rol: usuario?.rol || 'lector',
    recibe_alertas_inmediatas: usuario?.recibe_alertas_inmediatas ?? false,
    recibe_resumen_diario: usuario?.recibe_resumen_diario ?? true,
    activo: usuario?.activo ?? true,
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
          <h2 className="text-lg font-semibold text-gray-900">{isNew ? 'Invitar usuario' : 'Editar usuario'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label="Email *">
            <input type="email" required value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              disabled={!isNew}
              placeholder="usuario@empresa.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Field>
          <Field label="Nombre completo *">
            <input type="text" required value={form.nombre}
              onChange={e => handleChange('nombre', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Field>
          <Field label="Rol *">
            <div className="space-y-2">
              {ROLES.map(r => (
                <label key={r.value} className="flex items-start gap-3 p-3 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50">
                  <input type="radio" name="rol" value={r.value}
                    checked={form.rol === r.value}
                    onChange={e => handleChange('rol', e.target.value)}
                    className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-xs text-gray-500">{r.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </Field>
          <Field label="Notificaciones">
            <div className="space-y-2 px-3 py-2 border border-gray-300 rounded-md">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.recibe_alertas_inmediatas}
                  onChange={e => handleChange('recibe_alertas_inmediatas', e.target.checked)} />
                <span className="text-sm">Alertas inmediatas cuando se cruza un umbral</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.recibe_resumen_diario}
                  onChange={e => handleChange('recibe_resumen_diario', e.target.checked)} />
                <span className="text-sm">Resumen diario por email</span>
              </label>
            </div>
          </Field>
          <Field label="Estado">
            <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={e => handleChange('activo', e.target.checked)} />
              <span className="text-sm">{form.activo ? 'Activo (puede iniciar sesión)' : 'Inactivo (sin acceso)'}</span>
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
