import { useEffect, useState, type FormEvent } from 'react';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { http } from '../api/http';
import type { Profile as ProfileData } from '../api/identity';

export function Profile() {
  const { currentUser, retryProfile } = useAuth();
  const [profile, setProfile] = useState<ProfileData>();
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<File>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const userId = currentUser?.id;
  useEffect(() => {
    if (!userId) return;
    const abort = new AbortController();
    setProfile(undefined);
    void http.get<ProfileData>(`/users/${userId}/profile`, { signal: abort.signal }).then(({ data }) => { setProfile(data); setName(data.name); }).catch(() => { if (!abort.signal.aborted) setError('No pudimos cargar el perfil.'); });
    return () => abort.abort();
  }, [userId]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile || !currentUser || busy) return;
    if (name.trim().length < 2 || name.trim().length > 100) { setError('El nombre debe tener entre 2 y 100 caracteres.'); return; }
    if (photo && (!['image/jpeg', 'image/png'].includes(photo.type) || photo.size > 5_000_000)) { setError('La foto debe ser JPEG o PNG y pesar hasta 5 MB.'); return; }
    const form = new FormData();
    form.append('profile', JSON.stringify({ expectedVersion: profile.version, name: name.trim() }));
    if (photo) form.append('photo', photo);
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await http.patch<ProfileData>(`/users/${currentUser.id}/profile`, form);
      setProfile(data); setName(data.name); setPhoto(undefined); setMessage('Perfil actualizado.');
      await retryProfile();
    } catch { setError('No pudimos guardar el perfil. Si cambió en otra sesión, vuelve a cargar la página.'); }
    finally { setBusy(false); }
  }
  if (!currentUser) return <><Header /><main className="p-8"><p>Inicia sesión para ver tu perfil.</p><a href="/login">Iniciar sesión</a></main></>;
  return <><Header /><main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Mi perfil</h1>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!profile ? <p>Cargando perfil…</p> : <form onSubmit={event => { void save(event); }} className="mt-4 space-y-4">
      <label className="block">Nombre<input className="block w-full border p-2" value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
      <p>Correo: {profile.email}</p>
      <label className="block">Foto JPEG o PNG<input className="block" type="file" accept="image/jpeg,image/png" onChange={event => setPhoto(event.target.files?.[0])} /></label>
      <button disabled={busy} className="rounded bg-gray-900 px-4 py-2 text-white">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
    </form>}</main></>;
}
