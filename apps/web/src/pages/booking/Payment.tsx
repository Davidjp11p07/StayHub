import { useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useBooking } from '../../api/bookings';
import { BOOKING_STATUS_LABELS } from '../../api/bookings-history';
import { ApiError } from '../../api/identity';
import { formatMoney } from '../../api/properties';
import { paths } from '../../app/navigation';
import { Header } from '../../components/Header';
import { useBookings } from '../../context/BookingContext';

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex flex-col"><Header /><main className="management-content flex-1 max-w-xl mx-auto px-6 py-10 w-full">{children}</main></div>;
}

/** Payments are simulated by the server after booking creation. Bookings is the source of truth. */
export function Payment() {
  const { bookingId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = useBooking(bookingId, true);
  const { clearDraft } = useBookings();
  const unauthenticated = query.isError && query.error instanceof ApiError && query.error.status === 401;
  useEffect(() => {
    if (unauthenticated) navigate(paths.login, { replace: true, state: { from: `${location.pathname}${location.search}` } });
  }, [unauthenticated, navigate, location]);
  useEffect(() => { if (query.data?.status === 'CONFIRMED') clearDraft(); }, [query.data?.status, clearDraft]);

  if (query.isPending || unauthenticated) return <Shell><p role="status" className="text-sm text-gray-500 py-12 text-center">Cargando tu reserva…</p></Shell>;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return <Shell><div role="alert" className="flex flex-col items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
      <p>{notFound ? 'No encontramos tu reserva.' : 'No pudimos cargar tu reserva. Intenta nuevamente.'}</p>
      {!notFound && <button type="button" onClick={() => { void query.refetch(); }} className="font-semibold underline">Reintentar</button>}
    </div></Shell>;
  }
  const booking = query.data;
  return <Shell>
    <h1 className="text-3xl font-bold text-gray-900 mb-1">Pago de tu reserva</h1>
    <p className="text-sm text-gray-500 mb-6">Pago simulado: no se realizará ningún cargo real.</p>
    <dl className="flex flex-col gap-2 border border-gray-200 rounded-2xl p-4 mb-6 text-sm">
      <div className="flex justify-between"><dt>Alojamiento</dt><dd>{booking.propertyName}</dd></div>
      <div className="flex justify-between"><dt>Habitación</dt><dd>{booking.roomName}</dd></div>
      <div className="flex justify-between"><dt>Fechas</dt><dd>{booking.checkIn} → {booking.checkOut}</dd></div>
      <div className="flex justify-between"><dt>Huéspedes</dt><dd>{booking.guests}</dd></div>
      {booking.breakfastPerGuestNight && booking.breakfast && booking.lodging && <>
        <div className="flex justify-between"><dt>Alojamiento</dt><dd>{formatMoney(booking.lodging.amount, booking.lodging.currency)}</dd></div>
        <div className="flex justify-between"><dt>Desayuno</dt><dd>{formatMoney(booking.breakfast.amount, booking.breakfast.currency)}</dd></div>
      </>}
      <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold"><dt>Total</dt><dd>{formatMoney(booking.total.amount, booking.total.currency)}</dd></div>
    </dl>
    {booking.status === 'CONFIRMED' ? <div role="status" className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-xl">
      <p className="font-semibold">Tu reserva ya está confirmada.</p><Link to={paths.bookings} className="block mt-2 underline">Ver mis reservas</Link>
    </div> : booking.status === 'PENDING_PAYMENT' ? <div role="status" className="bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3 rounded-xl">
      <p>Procesando el pago simulado. Esta página se actualizará cuando recibamos el resultado.</p>
      <button type="button" onClick={() => { void query.refetch(); }} className="mt-2 font-semibold underline">Consultar estado</button>
      <Link to={paths.bookings} className="block mt-2 underline">Ver mis reservas</Link>
    </div> : <div role="status" className="bg-gray-50 border border-gray-200 text-gray-800 text-sm px-4 py-3 rounded-xl">
      <p>Estado de la reserva: {BOOKING_STATUS_LABELS[booking.status]}.</p><Link to={paths.bookings} className="block mt-2 underline">Ver mis reservas</Link>
    </div>}
  </Shell>;
}
