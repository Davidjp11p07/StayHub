import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { http } from '../../api/http';

interface Period { first: string; end: string; blocked: boolean }
const styles = {
  Disponible: 'bg-green-50 text-green-900',
  Ocupada: 'bg-red-50 text-red-900',
  Bloqueada: 'bg-amber-50 text-amber-900',
  Pasada: 'bg-gray-50 text-gray-500',
};
const symbols = { Disponible: '✓', Ocupada: '●', Bloqueada: '×', Pasada: '–' };

export function GuestCalendar({ property, room, name, today, arrival, onArrival }: {
  property: string; room: string; name: string; today: string; arrival: string; onArrival: (date: string)=>void;
}) {
  const [month, setMonth] = useState((arrival || today).slice(0,7));
  const first = new Date(month+'-01T00:00:00Z');
  function monthAt(offset: number) {
    return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+offset, 1)).toISOString().slice(0,7);
  }
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+1, 0)).getUTCDate();
  const query = useQuery({
    queryKey: ['guest-calendar', property, room, month],
    queryFn: async ({signal})=>(await http.get<Period[]>('/bookings/calendar/'+property+'/'+room+'/'+month,{signal})).data,
    refetchInterval: 30000,
  });
  const heading = first.toLocaleDateString('es-CO',{month:'long', year:'numeric',timeZone:'UTC'});
  return <section aria-label="Disponibilidad por noche" className="rounded-2xl border border-gray-200 p-4">
    <h2 className="font-semibold">Disponibilidad de {name}</h2>
    <div className="flex items-center justify-between my-3">
      <button type="button" aria-label="Mes anterior" disabled={month<=today.slice(0,7)} onClick={()=>setMonth(monthAt(-1))}>←</button>
      <strong>{heading}</strong>
      <button type="button" aria-label="Mes siguiente" onClick={()=>setMonth(monthAt(1))}>→</button>
    </div>
    <p className="text-sm mb-3">Elige una noche disponible para fijar tu entrada.</p>
    {query.isError ? <p role="alert">No se pudo consultar la disponibilidad. <button type="button" onClick={()=>void query.refetch()}>Reintentar</button></p> :
     !query.data ? <p role="status">Consultando las noches…</p> : <>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {['Lu','Ma','Mi','Ju','Vi','Sá','Do'].map(day=><strong key={day}>{day}</strong>)}
        {Array.from({length:(first.getUTCDay()+6)%7},(_,i)=><span key={'space'+i}/>)}
        {Array.from({length:days},(_,i)=>{
          const date=month+'-'+String(i+1).padStart(2,'0');
          const period=query.data.find(p=>p.first<=date && date<p.end);
          const state=date<today?'Pasada':period ? (period.blocked?'Bloqueada':'Ocupada') : 'Disponible';
          return <button key={date} type="button" aria-label={date+' · '+state} title={state} disabled={state!=='Disponible'}
            aria-pressed={arrival===date} onClick={()=>onArrival(date)}
            className={'rounded-lg py-2 '+styles[state]+(arrival===date?' ring-2 ring-gray-800':'')}>
            {i+1}<small className="block" aria-hidden="true">{symbols[state]}</small>
          </button>;
        })}
      </div>
      <div className="flex flex-wrap gap-2 mt-3 text-xs">{(['Disponible','Ocupada','Bloqueada'] as const).map(state=>
        <span key={state} className={'rounded px-2 py-1 '+styles[state]}>{symbols[state]} {state}</span>)}</div>
      <p className="mt-2 text-xs">El día de salida queda libre para otra estancia.</p>
    </>}
  </section>;
}
