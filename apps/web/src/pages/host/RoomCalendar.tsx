import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ownerStays, occupies } from '../../api/owner-stays';
import { useProperty } from '../../api/properties';
import { useAuth } from '../../context/AuthContext';

export function RoomCalendar({ id }: { id: string }) {
  const [start, setStart] = useState(new Date().toISOString().slice(0,10));
  const owner = useAuth().currentUser?.id;
  const days = Array.from({length: 8}, (_, i) => new Date(Date.parse(start) + i * 86400000).toISOString().slice(0,10));
  const property = useProperty(id);
  const stays = useQuery({queryKey:['calendar', owner, id, start], queryFn:({signal})=>ownerStays({propertyId:id,from:start,to:days[7]},signal)});
  return <section className="surface"><h2>Calendario por habitación</h2><label>Semana desde <input type="date" value={start} onChange={e=>{if(e.target.value) setStart(e.target.value);}} /></label>
    {stays.isError || property.isError ? <p role="alert">No se pudo consultar la ocupación.</p> : !stays.data || !property.data ? <p>Cargando calendario…</p> :
    <div className="overflow-x-auto"><table className="calendar"><caption>Reservas registradas · la disponibilidad se confirma al reservar</caption><thead><tr><th>Habitación</th>{days.slice(0,7).map(day=><th key={day}>{day.slice(5)}</th>)}</tr></thead>
    <tbody>{property.data.rooms.map(room=><tr key={room.id}><th>{room.name}</th>{days.slice(0,7).map(day=>{
      const stay=stays.data.find(b=>b.propertyId===id && b.roomId===room.id && occupies(b) && b.checkIn<=day && day<b.checkOut);
      return <td key={day}>{stay ? <Link to={'/stay/'+stay.id}>Reservada</Link> : 'Sin reserva'}</td>;
    })}</tr>)}</tbody></table></div>}</section>;
}
