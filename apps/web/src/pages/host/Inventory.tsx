import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { http } from '../../api/http';
import { Header } from '../../components/Header';

type Item = { id: string; type: 'PRODUCT' | 'SERVICE'; name: string; quantityAvailable: number; active: boolean };
type InventoryData = { version: number; items: Item[] };

export function Inventory() {
  const { roomId = '' } = useParams();
  const [data, setData] = useState<InventoryData>();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [type, setType] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try { const result = await http.get<InventoryData>(`/inventory/rooms/${encodeURIComponent(roomId)}`); setData(result.data); setError(''); }
    catch { setError('No pudimos consultar el inventario. Comprueba tus permisos o inténtalo de nuevo.'); }
  }
  useEffect(() => { void load(); }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function add(event: FormEvent) {
    event.preventDefault();
    const number = Number(quantity);
    if (!name.trim() || !Number.isInteger(number) || number < 0 || number > 1_000_000) { setError('Indica un nombre y una cantidad entera entre 0 y 1000000.'); return; }
    setBusy(true); setError('');
    try { await http.post(`/inventory/rooms/${encodeURIComponent(roomId)}/items`, { name: name.trim(), type, quantityAvailable: number, active: true }); setName(''); await load(); }
    catch { setError('No pudimos agregar el artículo. Revisa los datos e inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  async function toggle(item: Item) {
    if (!data || busy) return;
    setBusy(true); setError('');
    try {
      await http.put(`/inventory/rooms/${encodeURIComponent(roomId)}`, { expectedVersion: data.version, items: data.items.map(row => ({ id: row.id, type: row.type, name: row.name, quantityAvailable: row.quantityAvailable, active: row.id === item.id ? !row.active : row.active })) });
      await load();
    } catch { setError('No pudimos actualizar el inventario. Puede haber cambiado; recarga e inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  return <><Header /><main className="mx-auto max-w-2xl p-8"><h1 className="text-2xl font-bold">Inventario de la habitación</h1>
    {error && <p role="alert">{error} <button type="button" onClick={() => { void load(); }}>Recargar</button></p>}
    {!data ? <p>Cargando inventario…</p> : <><ul>{data.items.map(item => <li key={item.id} className="my-3">{item.name} · {item.quantityAvailable} · {item.active ? 'Activo' : 'Inactivo'} <button disabled={busy} onClick={() => { void toggle(item); }}>{item.active ? 'Desactivar' : 'Activar'}</button></li>)}</ul>
      {!data.items.length && <p>No hay artículos registrados.</p>}
      <form onSubmit={event => { void add(event); }} className="mt-5 space-y-3"><label className="block">Nombre<input className="block border p-2" value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label>
        <label className="block">Tipo<select value={type} onChange={event => setType(event.target.value as 'PRODUCT' | 'SERVICE')}><option value="PRODUCT">Producto</option><option value="SERVICE">Servicio</option></select></label>
        <label className="block">Cantidad<input className="block border p-2" type="number" min="0" max="1000000" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
        <button disabled={busy} className="rounded bg-gray-900 px-4 py-2 text-white">Agregar</button></form></>}
  </main></>;
}
