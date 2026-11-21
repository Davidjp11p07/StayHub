import { useEffect, useState, type FormEvent } from 'react';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { http } from '../api/http';
import { ApiError, type Profile as ProfileData } from '../api/identity';

export function Profile() {
  const { currentUser, retryProfile } = useAuth();
  const [profile, setProfile] = useState<ProfileData>();
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [photoError, setPhotoError] = useState(false);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<File>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const userId = currentUser?.id;
  const profileVersion = profile?.version;
  useEffect(() => {
    if (!userId) return;
    const abort = new AbortController();
    setProfile(undefined);
    void http.get<ProfileData>(`/users/${userId}/profile`, { signal: abort.signal }).then(({ data }) => { setProfile(data); setName(data.name); }).catch(() => { if (!abort.signal.aborted) setError('No pudimos cargar el perfil.'); });
    return () => abort.abort();
  }, [userId]);
  useEffect(() => {
    if (!userId || profileVersion === undefined) return;
    const abort = new AbortController();
    let objectUrl: string | undefined;
    setPhotoUrl(undefined);
    setPhotoError(false);
    void http.get<Blob>(`/users/${userId}/profile/photo`, { responseType: 'blob', signal: abort.signal })
      .then(({ data }) => {
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(data);
        setPhotoUrl(objectUrl);
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted && !(failure instanceof ApiError && failure.status === 404)) setPhotoError(true);
      });
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [userId, profileVersion]);
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
      if (photo) window.dispatchEvent(new Event('stayhub:profile-photo-updated'));
      await retryProfile();
    } catch { setError('No pudimos guardar el perfil. Si cambió en otra sesión, vuelve a cargar la página.'); }
    finally { setBusy(false); }
  }
  if (!currentUser) return <><Header /><main className="p-8"><p>Inicia sesión para ver tu perfil.</p><a href="/login">Iniciar sesión</a></main></>;
  return <><Header /><main className="workspace profile-workspace"><p className="kicker">Cuenta</p><h1>Mi perfil</h1>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!profile ? <p>Cargando perfil…</p> : <form onSubmit={event => { void save(event); }} className="profile-layout"><aside className="identity-panel">
      {!photoUrl && <span className="avatar-initial" aria-hidden>{profile.name.trim().slice(0, 1).toUpperCase()}</span>}{photoUrl && <img src={photoUrl} alt="Foto de perfil" className="h-24 w-24 rounded-full object-cover" />}
      {photoError && <p role="status" className="text-sm text-gray-600">No pudimos cargar tu foto de perfil.</p>}
      <h2>{profile.name}</h2><p>{profile.email}</p><a className="mt-5 inline-block underline" href="/favorites">Mis favoritos →</a></aside><section className="surface profile-fields"><h2>Datos personales</h2><label className="block">Nombre<input className="block w-full border p-2" value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
      <label className="block">Foto JPEG o PNG<input className="block" type="file" accept="image/jpeg,image/png" onChange={event => setPhoto(event.target.files?.[0])} /></label>
      <button disabled={busy} className="rounded bg-gray-900 px-4 py-2 text-white">{busy ? 'Guardando…' : 'Guardar cambios'}</button></section>
    </form>}</main></>;
}
