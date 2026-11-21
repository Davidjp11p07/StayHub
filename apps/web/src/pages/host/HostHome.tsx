import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { paths } from '../../app/navigation';
import { Header } from '../../components/Header';
import { useAuth } from '../../context/AuthContext';
import { getOwnerReport, money } from '../../api/reports';
import { useOwnerBookingHistory } from '../../api/bookings-history';

export function HostHome() {
  const { currentUser } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  const from = today.slice(0, 7) + '-01';
  const ownerId = currentUser?.id ?? '';
  const report = useQuery({
    queryKey: ['host-summary', ownerId, from, tomorrow],
    enabled: Boolean(ownerId),
    queryFn: ({ signal }) => getOwnerReport(ownerId, { from, to: tomorrow, group: 'day' }, signal),
  });
  const arrivals = useOwnerBookingHistory({ status: 'CONFIRMED', from: today, to: tomorrow });
  const metrics = report.data?.metrics;
  return <><Header /><main className="workspace">
    <header className="workspace-heading"><div><p className="kicker">Panel de anfitrión</p>
      <h1>Hola, {currentUser?.name.split(' ')[0] ?? 'anfitrión'}</h1></div>
      <Link className="action-primary" to={paths.hostNew}>Publicar una propiedad</Link></header>
    <section className="summary-panel"><div className="section-heading"><div><p className="kicker">Mes en curso · UTC</p><h2>Resumen de actividad</h2></div><Link to={paths.hostReports}>Ver reportes →</Link></div>
      {metrics ? <dl className="metric-grid">
        <div><dt>Ingreso neto</dt><dd>{metrics.revenue.length ? metrics.revenue.map(row => <span className="block" key={row.currency}>{money(row.netMinor, row.currency)}</span>) : 'Sin movimientos'}</dd></div>
        <div><dt>Reservas creadas</dt><dd>{metrics.reservations.total}</dd></div>
        <div><dt>Ocupación</dt><dd>{metrics.occupancy.rate === null ? 'Sin datos' : metrics.occupancy.rate + ' %'}</dd></div>
      </dl> : <p role="status">{report.isError ? 'No pudimos cargar el resumen.' : 'Cargando actividad…'}</p>}</section>
    <section className="surface"><div className="section-heading"><h2>Estancias confirmadas para hoy</h2><Link to={paths.hostBookings}>Reservas recibidas →</Link></div>
      {arrivals.isPending ? <p>Cargando reservas…</p> : arrivals.isError ? <p>No pudimos cargar las estancias.</p> : arrivals.data?.items.length ? <ul>{arrivals.data.items.map(b => <li className="arrival-row" key={b.id}><strong>{b.propertyName}</strong><span>{b.roomName} · {b.checkIn} → {b.checkOut}</span></li>)}</ul> : <p>No tienes estancias confirmadas para estas fechas.</p>}</section>
    <Link className="manage-link" to={paths.hostProperties}>Ver mis propiedades →</Link>
  </main></>;
}
