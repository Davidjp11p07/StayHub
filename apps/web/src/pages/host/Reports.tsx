import { useEffect, useState, type FormEvent } from 'react';
import { Header } from '../../components/Header';
import { useAuth } from '../../context/AuthContext';
import { getOwnerReport, money, type OwnerReport, type ReportFilters } from '../../api/reports';
import { ApiError } from '../../api/identity';

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const initialFilters = (): ReportFilters => ({ from: day(-30), to: day(0), group: 'day' });
const statuses: Record<string, string> = {
  PENDING_PAYMENT: 'Pendiente de pago', CONFIRMED: 'Confirmadas', CHECKED_IN: 'En estancia', COMPLETED: 'Completadas',
  PAYMENT_FAILED: 'Pago fallido', EXPIRED: 'Vencidas', CANCELLED_BY_GUEST: 'Canceladas por huésped', CANCELLED_BY_OWNER: 'Canceladas por propietario',
};

function Card({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">{label}</p><p className="text-3xl font-semibold tracking-tight mt-3 text-gray-900">{value}</p><p className="text-xs text-gray-500 mt-3">{detail}</p></article>;
}

function Trend({ title, values, periods, valueLabels }: { title: string; values: Array<number | null>; periods: string[]; valueLabels?: string[] }) {
  const present = values.filter((value): value is number => value !== null);
  const min = Math.min(0, ...present);
  const max = Math.max(1, ...present);
  const x = (index: number) => 24 + index * 592 / Math.max(1, values.length - 1);
  const y = (value: number) => 115 - (value - min) / (max - min) * 90;
  const path = values.map((value, index) => value === null ? '' : `${index === 0 || values[index - 1] === null ? 'M' : 'L'}${x(index)} ${y(value)}`).join(' ');
  return <figure className="mt-6"><figcaption className="font-semibold text-gray-800">{title}</figcaption>
    <svg role="img" aria-label={`${title}. Valores exactos en la tabla de tendencias.`} viewBox="0 0 640 140" className="w-full h-40 mt-3">
      <path d={`M24 ${y(0)} H616`} stroke="#d1d5db" /><path d={path} fill="none" stroke="#E31C5F" strokeWidth="3" strokeLinejoin="round" />
      {values.map((v, i) => v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#E31C5F"><title>{periods[i]}: {valueLabels?.[i] ?? v}</title></circle>)}
    </svg><div className="flex justify-between text-xs text-gray-500"><span>{periods[0]}</span><span>{periods.at(-1)}</span></div>
  </figure>;
}

export function Reports() {
  const { currentUser } = useAuth();
  const admin = currentUser?.role === 'ADMIN';
  const [owner, setOwner] = useState(admin ? '' : currentUser?.id ?? '');
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [request, setRequest] = useState<{ owner: string; filters: ReportFilters } | null>(() => !admin && currentUser ? { owner: currentUser.id, filters: initialFilters() } : null);
  const [data, setData] = useState<OwnerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!request) return;
    const abort = new AbortController();
    setLoading(true); setError(''); setData(null);
    void getOwnerReport(request.owner, request.filters, abort.signal).then(result => {
      if (abort.signal.aborted) return;
      setData(result); setProperties(result.properties); setCurrency(result.metrics.revenue[0]?.currency ?? 'COP');
    }).catch((failure: unknown) => {
      if (abort.signal.aborted) return;
      setError(failure instanceof ApiError && failure.status === 403 ? 'No tienes permiso para consultar este propietario.'
        : failure instanceof ApiError && failure.status === 400 ? 'Revisa las fechas y los filtros. El período máximo es de 366 días.'
          : 'No pudimos verificar los datos de los servicios. Reintenta; no se muestran cifras incompletas.');
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [request]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const start = Date.parse(`${filters.from}T00:00:00Z`);
    const end = Date.parse(`${filters.to}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * 86400000) {
      setData(null);
      setError('La fecha final debe ser posterior a la inicial y el período no puede superar 366 días.');
      return;
    }
    setRequest({ owner, filters: { ...filters } });
  }
  const metrics = data?.metrics;
  const revenue = metrics?.revenue.find(row => row.currency === currency);
  const prior = data?.previous.reservations.total ?? 0;
  const total = metrics?.reservations.total ?? 0;

  return <div className="min-h-screen bg-gray-50"><Header /><main className="max-w-screen-xl mx-auto px-5 sm:px-8 py-9">
    <p className="text-sm font-semibold text-primary">{admin ? 'Administración' : 'Panel de anfitrión'} / Reportes</p>
    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2 text-gray-900">Tu actividad, en perspectiva</h1>
    <p className="text-gray-500 mt-3 max-w-2xl">Reservas, ingresos y ocupación con el mismo período y una fuente verificable para cada cifra.</p>
    <form onSubmit={submit} className="flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white p-5 mt-7">
      {admin && <label className="text-sm">Propietario (UUID)<input aria-label="Propietario" required value={owner} onChange={e => { setOwner(e.target.value); setProperties([]); }} className="block border rounded-lg p-2 mt-1" /></label>}
      <label className="text-sm">Desde<input aria-label="Desde" type="date" required value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} className="block border rounded-lg p-2 mt-1" /></label>
      <label className="text-sm">Hasta (exclusivo)<input aria-label="Hasta (exclusivo)" type="date" required value={filters.to} min={filters.from} onChange={e => setFilters({ ...filters, to: e.target.value })} className="block border rounded-lg p-2 mt-1" /></label>
      <label className="text-sm">Alojamiento<select aria-label="Alojamiento" value={filters.propertyId ?? ''} onChange={e => { const next = { ...filters }; if (e.target.value) next.propertyId = e.target.value; else delete next.propertyId; setFilters(next); }} className="block border rounded-lg p-2 mt-1"><option value="">Todos los alojamientos</option>{properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-sm">Agrupar<select aria-label="Agrupar" value={filters.group} onChange={e => setFilters({ ...filters, group: e.target.value as 'day' | 'month' })} className="block border rounded-lg p-2 mt-1"><option value="day">Por día</option><option value="month">Por mes</option></select></label>
      <button disabled={loading} className="rounded-lg bg-primary text-white px-5 py-2.5 font-semibold disabled:opacity-50">{loading ? 'Consultando…' : 'Aplicar filtros'}</button>
    </form>
    {loading && <p role="status" className="py-8">Verificando reservas, pagos y oferta publicada…</p>}
    {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5"><p>{error}</p><button className="underline mt-2" onClick={() => setRequest(request ? { ...request } : null)}>Reintentar</button></div>}
    {!request && <p className="mt-6 text-gray-500">Indica el propietario y aplica los filtros para consultar sus reportes.</p>}
    {data && metrics && <>
      <div className="flex flex-wrap justify-between gap-3 text-xs text-gray-500 mt-6 mb-4"><p>{data.from} → {data.to} · UTC · Fecha final no incluida</p><p>{data.source === 'DEMO' ? 'DEMOSTRACIÓN · Datos sintéticos' : 'Datos de servicios reales'} · Actualizado {new Date(data.generatedAt).toLocaleString('es-CO', { timeZone: 'UTC' })} UTC</p></div>
      <section aria-label="Indicadores" className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Reservas creadas" value={String(total)} detail={prior ? `${Math.round((total - prior) / prior * 100)} % frente al período anterior` : 'Período anterior sin reservas; variación no calculable'} />
        <Card label="Cancelaciones en el período" value={String(metrics.cancellations)} detail="Según fecha de cancelación" />
        <Card label="Ocupación reservada" value={metrics.occupancy.rate === null ? 'No disponible' : `${metrics.occupancy.rate} %`} detail={`${metrics.occupancy.occupiedRoomNights} noches reservadas / ${metrics.occupancy.availableRoomNights ?? '—'} disponibles`} />
        <Card label="Cancelación de nuevas reservas" value={metrics.reservations.cancellationRate === null ? 'Sin base' : `${metrics.reservations.cancellationRate} %`} detail="Reservas creadas en este período que ahora están canceladas" />
      </section>
      {!metrics.occupancy.complete && <p role="status" className="rounded-xl bg-amber-50 border border-amber-200 p-4 mt-4 text-sm">Ocupación no disponible: falta historial de oferta publicada o hay diferencias con las reservas. No se asumió disponibilidad anterior al primer registro.</p>}
      <p className="text-xs text-gray-500 mt-3">Ocupación = noches con reservas confirmadas, en estancia o completadas / noches de habitaciones publicadas. No incluye bloqueos de inventario.{metrics.occupancy.projected ? ' Incluye fechas futuras: proyección sobre la oferta conocida.' : ''}</p>
      {total === 0 && metrics.cancellations === 0 && metrics.revenue.length === 0 && <p className="mt-5 text-gray-500">Sin movimientos ni nuevas reservas en este período.</p>}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 mt-6">
        <div className="flex justify-between items-center gap-3"><div><h2 className="text-xl font-semibold">Ingresos</h2><p className="text-sm text-gray-500 mt-1">Por fecha de confirmación. Monedas independientes, sin conversión.</p></div><label className="text-sm">Moneda<select aria-label="Moneda" className="block border rounded-lg p-2" value={currency} onChange={e => setCurrency(e.target.value)}>{[...new Set(['COP', 'USD', ...metrics.revenue.map(row => row.currency)])].map(c => <option key={c}>{c}</option>)}</select></label></div>
        <div className="grid sm:grid-cols-3 gap-4 mt-5"><Card label="Cobrado" value={money(revenue?.chargedMinor ?? '0', currency)} detail="Pagos aprobados" /><Card label="Reembolsado" value={money(revenue?.refundedMinor ?? '0', currency)} detail="Reembolsos completados" /><Card label="Ingreso neto" value={money(revenue?.netMinor ?? '0', currency)} detail="Cobrado menos reembolsado; puede ser negativo" /></div>
        <Trend title={`Evolución del ingreso neto · ${currency}`} values={metrics.series.map(s => Number(s.revenue.find(row => row.currency === currency)?.netMinor ?? '0') / 100)} periods={metrics.series.map(s => s.period)} valueLabels={metrics.series.map(s => money(s.revenue.find(row => row.currency === currency)?.netMinor ?? '0', currency))} />
        <div className="overflow-x-auto mt-5"><table className="w-full text-sm text-left"><caption className="sr-only">Ingresos por moneda</caption><thead><tr>{['Moneda', 'Cobrado', 'Reembolsado', 'Neto'].map(h => <th key={h} className="py-2 border-b">{h}</th>)}</tr></thead><tbody>{metrics.revenue.map(row => <tr key={row.currency}><th className="py-3">{row.currency}</th><td>{money(row.chargedMinor, row.currency)}</td><td>{money(row.refundedMinor, row.currency)}</td><td>{money(row.netMinor, row.currency)}</td></tr>)}</tbody></table></div>
      </section>
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <section className="bg-white rounded-2xl border border-gray-200 p-6"><h2 className="text-xl font-semibold">Tendencias</h2><Trend title="Reservas creadas" values={metrics.series.map(s => s.reservations)} periods={metrics.series.map(s => s.period)} /><Trend title="Ocupación reservada · %" values={metrics.series.map(s => s.occupancy.rate)} periods={metrics.series.map(s => s.period)} /></section>
        <section className="bg-white rounded-2xl border border-gray-200 p-6"><h2 className="text-xl font-semibold">Estado de las reservas</h2><p className="text-sm text-gray-500 mt-2">Estado actual de las reservas creadas durante el período.</p><ul className="mt-5 space-y-4">{Object.entries(metrics.reservations.byStatus).map(([status, count]) => <li key={status}><div className="flex justify-between text-sm"><span>{statuses[status] ?? status}</span><strong>{count}</strong></div><div className="h-2 bg-gray-100 rounded-full mt-2"><div className="h-2 bg-primary rounded-full" style={{ width: `${total ? count / total * 100 : 0}%` }} /></div></li>)}</ul></section>
      </div>
      <section className="bg-white rounded-2xl border border-gray-200 p-6 mt-6 overflow-x-auto"><h2 className="text-xl font-semibold mb-4">Detalle por período</h2>
        <table className="w-full text-sm text-left whitespace-nowrap"><caption className="sr-only">Tabla de tendencias e ingresos en {currency}</caption><thead><tr>{['Período', 'Reservas', 'Cancelaciones', 'Ocupación', `Cobrado ${currency}`, `Reembolsado ${currency}`, `Neto ${currency}`].map(h => <th className="pr-5 pb-3 border-b" key={h}>{h}</th>)}</tr></thead>
          <tbody>{metrics.series.map(s => { const m = s.revenue.find(row => row.currency === currency); return <tr key={s.period}><th className="pr-5 py-3 border-b border-gray-100">{s.period}</th><td>{s.reservations}</td><td>{s.cancellations}</td><td>{s.occupancy.rate === null ? 'No disponible' : `${s.occupancy.rate} %`}</td><td>{money(m?.chargedMinor ?? '0', currency)}</td><td>{money(m?.refundedMinor ?? '0', currency)}</td><td>{money(m?.netMinor ?? '0', currency)}</td></tr>; })}</tbody>
        </table>
      </section>
    </>}
  </main></div>;
}
