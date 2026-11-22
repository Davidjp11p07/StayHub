import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ownerStays, occupies } from '../../api/owner-stays';
import { useProperty } from '../../api/properties';
import { useAuth } from '../../context/AuthContext';
import { http } from '../../api/http';
import { ApiError } from '../../api/identity';

interface Block { id: string; roomId: string; from: string; to: string }
const shift = (day: string, nights: number) => new Date(Date.parse(day) + nights * 86400000).toISOString().slice(0,10);
const label = (day: string) => new Intl.DateTimeFormat('es-CO', {day:'numeric', month:'short', timeZone:'UTC'}).format(new Date(day));
function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,10);
}

export function RoomCalendar({ id }: { id: string }) {
  const [start, setStart] = useState(today);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const owner = useAuth().currentUser?.id;
  const days = Array.from({length:7}, (_, i) => shift(start,i));
  const property = useProperty(id);
  const url = '/bookings/maintenance/'+id;
  const stays = useQuery({queryKey:['calendar', owner, id, start], queryFn:({signal})=>ownerStays({propertyId:id,from:start,to:shift(start,7)},signal)});
  const blocks = useQuery({queryKey:['maintenance', owner,id], queryFn: async ({signal}) => (await http.get<Block[]>(url,{signal})).data});
  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      setMessage('Calendario actualizado.');
    } catch (error) {
      setMessage(error instanceof ApiError && error.status===409 ? 'Hay una reserva o un bloqueo en esas noches. Elige otras fechas.' : 'No se pudo actualizar el bloqueo. Comprueba el calendario.');
    } finally {
      await Promise.all([blocks.refetch(), stays.refetch()]);
      setBusy(false);
    }
  }
  return <section className="surface"><h2>Calendario por habitación</h2>
    <p>Semana del {label(start)} al {label(days[6])} de {days[6].slice(0,4)}</p>
    <div className="flex gap-3 flex-wrap my-3">
      <button type="button" onClick={()=>setStart(shift(start,-7))}>Anterior</button>
      <button type="button" onClick={()=>setStart(today())}>Hoy</button>
      <button type="button" onClick={()=>setStart(shift(start,7))}>Siguiente</button>
      <input aria-label="Ir a fecha" type="date" value={start} onChange={e=>{if(e.target.value) setStart(e.target.value);}} />
    </div>
    {stays.isError || property.isError || blocks.isError ? <p role="alert">No se pudo consultar la ocupación.</p> :
      !stays.data || !property.data || !blocks.data ? <p>Cargando calendario…</p> : <>
      <div className="overflow-x-auto"><table className="calendar"><caption>Noches por habitación</caption><thead><tr><th>Habitación</th>{days.map(day=><th key={day}>{label(day)}</th>)}</tr></thead>
      <tbody>{property.data.rooms.map(room=><tr key={room.id}><th>{room.name}</th>{days.map(day=>{
        const stay=stays.data.find(b=>b.roomId===room.id && occupies(b) && b.checkIn<=day && day<b.checkOut);
        const blocked=blocks.data.some(b=>b.roomId===room.id && b.from<=day && day<b.to);
        return <td key={day}>{stay ? <Link to={'/stay/'+stay.id}>Reservada</Link> : blocked ? 'Bloqueada' : property.data.status==='PUBLISHED' && room.basePrice ? 'Disponible' : 'Fuera de venta'}</td>;
      })}</tr>)}</tbody></table></div>
      <form className="flex gap-3 flex-wrap items-end mt-5" onSubmit={e=>{
        e.preventDefault();
        const data=new FormData(e.currentTarget);
        const from=String(data.get('from')), to=String(data.get('to'));
        if(to<=from){setMessage('La reapertura debe ser posterior a la primera noche.');return;}
        void change(()=>http.post(url+'/'+data.get('room'),{from,to}));
      }}>
        <label>Habitación<select name="room" required>{property.data.rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Primera noche<input type="date" name="from" min={today()} required /></label>
        <label>Día de reapertura<input type="date" name="to" min={today()} required /></label>
        <button className="action-primary" disabled={busy || property.data.status!=='PUBLISHED'}>Bloquear por arreglos</button>
      </form>
      {blocks.data.filter(b=>b.to>today()).map(b=><p key={b.id}>{property.data.rooms.find(r=>r.id===b.roomId)?.name} · {b.from} · Reapertura {b.to} <button disabled={busy} onClick={()=>void change(()=>http.delete(url+'/'+b.id))}>Quitar bloqueo</button></p>)}
    </>}
    <p role="status">{message}</p>
  </section>;
}
