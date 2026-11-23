import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { http } from '../../api/http';

interface Period { first: string; end: string; blocked: boolean }
const styles = {
  Disponible: 'bg-green-50 text-green-900',
  Ocupada: 'bg-red-50 text-red-900',
  Bloqueada: 'bg-amber-50 text-amber-900',
  Pasada: 'bg-gray-50 text-gray-500',
};
const symbols = { Disponible: '✓', Ocupada: '●', Bloqueada: '×', Pasada: '–' };

function shiftMonth(month: string, offset: number) {
  const first = new Date(month + '-01T00:00:00Z');
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
}

export function GuestCalendar({ property, room, name, today, arrival, departure, onArrival, onDeparture, onReset }: {
  property: string;
  room: string;
  name: string;
  today: string;
  arrival: string;
  departure: string;
  onArrival: (date: string) => void;
  onDeparture: (date: string) => void;
  onReset: () => void;
}) {
  const [month, setMonth] = useState((arrival || today).slice(0,7));
  const first = new Date(month+'-01T00:00:00Z');
  const choosingDeparture = arrival >= today && !departure;
  const months = [month];
  if (choosingDeparture) {
    for (let preceding = arrival.slice(0, 7); preceding < month; preceding = shiftMonth(preceding, 1)) {
      months.push(preceding);
    }
  }
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+1, 0)).getUTCDate();
  const queries = useQueries({
    queries: months.map(calendarMonth => ({
      queryKey: ['guest-calendar', property, room, calendarMonth],
      queryFn: async ({ signal }: { signal: AbortSignal }) => (await http.get<Period[]>(`/bookings/calendar/${property}/${room}/${calendarMonth}`, { signal })).data,
      refetchInterval: 30000,
    })),
  });
  const failedQueries = queries.filter(query => query.isError);
  const periods = queries.flatMap(query => query.data ?? []);
  const heading = first.toLocaleDateString('es-CO',{month:'long', year:'numeric',timeZone:'UTC'});
  return <section aria-label="Disponibilidad por noche" className="rounded-2xl border border-gray-200 p-4">
    <h2 className="font-semibold">Disponibilidad de {name}</h2>
    <div className="flex items-center justify-between my-3">
      <button type="button" aria-label="Mes anterior" disabled={month<=today.slice(0,7)} onClick={()=>setMonth(shiftMonth(month, -1))}>←</button>
      <strong>{heading}</strong>
      <button type="button" aria-label="Mes siguiente" onClick={()=>setMonth(shiftMonth(month, 1))}>→</button>
    </div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p aria-live="polite">{choosingDeparture
        ? 'Ahora elige tu fecha de salida.'
        : departure ? 'Elige una nueva entrada o conserva las fechas seleccionadas.' : 'Elige una noche disponible para fijar tu entrada.'}</p>
      {choosingDeparture && (
        <button type="button" className="font-medium underline" onClick={onReset}>Cambiar entrada</button>
      )}
    </div>
    {failedQueries.length ? <p role="alert">No se pudo consultar la disponibilidad. <button type="button" onClick={() => failedQueries.forEach(query => void query.refetch())}>Reintentar</button></p> :
     queries.some(query => !query.data) ? <p role="status">Consultando las noches…</p> : <>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {['Lu','Ma','Mi','Ju','Vi','Sá','Do'].map(day=><strong key={day}>{day}</strong>)}
        {Array.from({length:(first.getUTCDay()+6)%7},(_,i)=><span key={'space'+i}/>)}
        {Array.from({length:days},(_,i)=>{
          const date=month+'-'+String(i+1).padStart(2,'0');
          const period=periods.find(p=>p.first<=date && date<p.end);
          const state=date<today?'Pasada':period ? (period.blocked?'Bloqueada':'Ocupada') : 'Disponible';
          const canDepart = date > arrival && !periods.some(p => p.first < date && arrival < p.end);
          const selectable = choosingDeparture ? canDepart : state === 'Disponible';
          const selected = date === arrival || date === departure;
          const inStay = arrival < date && date < departure;
          return <button key={date} type="button" aria-label={date+' · '+(choosingDeparture && canDepart ? 'Salida disponible' : state)}
            title={choosingDeparture && canDepart ? 'Salida disponible' : state} disabled={!selectable}
            aria-pressed={selected} onClick={() => choosingDeparture ? onDeparture(date) : onArrival(date)}
            className={`rounded-lg py-2 disabled:opacity-60 ${inStay ? 'bg-blue-100 text-blue-900' : styles[state]}${selected ? ' ring-2 ring-gray-800 disabled:opacity-100' : ''}`}>
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
