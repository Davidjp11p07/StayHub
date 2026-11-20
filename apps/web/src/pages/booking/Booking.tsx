import { useQuery } from '@tanstack/react-query';
import { http } from '../../api/http';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { bookingErrorMessage, newIdempotencyKey, useCreateBooking } from '../../api/bookings';
import { ApiError } from '../../api/identity';
import { formatMoney, useProperty } from '../../api/properties';
import { paths } from '../../app/navigation';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { countNights, useBookings, validateStayDates } from '../../context/BookingContext';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-10 w-full">{children}</main>
    </div>
  );
}

export function Booking() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = useProperty(id);
  const createMutation = useCreateBooking();
  const { setDraft } = useBookings();

  const [roomId, setRoomId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(1);
  const [showErrors, setShowErrors] = useState(false);
  const [general, setGeneral] = useState<string>();
  const submitting = useRef(false);
  const attempt = useRef<{ payload: string; key: string }>();
  const alertRef = useRef<HTMLDivElement>(null);

  const [breakfastSelected, setBreakfastSelected] = useState(false);
  const bookableRooms = query.data?.rooms.filter(r => r.basePrice) ?? [];
  const room = bookableRooms.find(r => r.id === roomId) ?? bookableRooms[0];
  const today = new Date().toISOString().slice(0, 10);
  const nights = countNights(checkIn, checkOut);
  const currency = room?.basePrice?.currency ?? 'USD';
  const withBreakfast = Boolean(breakfastSelected && room?.breakfastPerGuestNight);
  const stay = { propertyId: id, roomId: room?.id, checkIn, checkOut, guests, breakfastSelected: withBreakfast };
  const canQuote = Boolean(room && checkIn >= today && nights > 0 && guests <= room.capacity);
  const price = useQuery({
    queryKey: ['booking-price', stay], enabled: canQuote, retry: false,
    queryFn: async ({ signal }) => (await http.post<{ lodging: string; breakfast: string; total: string; currency: string; propertyVersion: number }>(
      '/bookings/quote', stay, { signal })).data,
  });

  useEffect(() => {
    if (price.error instanceof ApiError && price.error.status === 401) {
      navigate(paths.login, { state: { from: location.pathname + location.search } });
    }
  }, [price.error, navigate, location.pathname, location.search]);

  if (query.isPending) {
    return <Shell><p role="status" className="text-sm text-gray-500 py-12 text-center">Cargando el alojamiento…</p></Shell>;
  }
  if (query.isError || !query.data) {
    return (
      <Shell>
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          No encontramos el alojamiento para reservar.
        </div>
      </Shell>
    );
  }

  const property = query.data;
  const resetFeedback = () => setGeneral(undefined);
  const validate = () => ({
    ...validateStayDates(checkIn, checkOut, today),
    guests: room && guests > room.capacity ? `Esta habitación admite hasta ${room.capacity} huésped${room.capacity === 1 ? '' : 'es'}` : undefined,
  });
  const errors = showErrors ? Object.entries(validate()).filter(([, message]) => message) : [];
  const errorProps = (key: string) => {
    const invalid = errors.some(([field]) => field === key);
    return { 'aria-invalid': invalid, 'aria-describedby': invalid ? 'booking-error-' + key : undefined };
  };

  const confirm = () => {
    if (submitting.current || !room || !room.basePrice) return;
    setShowErrors(true);
    setGeneral(undefined);
    if (Object.values(validate()).some(Boolean)) {
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }
    if (!price.data || price.isFetching) return;
    submitting.current = true;
    const input = { propertyId: property.id, roomId: room.id, checkIn, checkOut, guests, breakfastSelected: withBreakfast, expectedPropertyVersion: price.data.propertyVersion };
    const payload = JSON.stringify(input);
    if (!attempt.current || attempt.current.payload !== payload) attempt.current = { payload, key: newIdempotencyKey() };
    const idempotencyKey = attempt.current.key;
    createMutation.mutate(
      { input, idempotencyKey },
      {
        onSuccess: (booking) => {
          setDraft({
            propertyId: property.id, propertyName: property.name, roomId: room.id, roomName: room.name,
            checkIn, checkOut, guests, nights: booking.nights, nightlyPrice: booking.nightlyPrice, total: booking.total,
          });
          navigate(paths.bookingPay(booking.id));
        },
        onError: (error) => {
          submitting.current = false;
          if (error instanceof ApiError && error.status === 401) {
            navigate(paths.login, { state: { from: `${location.pathname}${location.search}` } });
            return;
          }
          if (error instanceof ApiError && error.problem?.code === 'ACCOMMODATION_CONFLICT') {
            setGeneral('La oferta ha cambiado. Revisa la nueva cotización antes de confirmar.');
            void query.refetch();
            void price.refetch();
          } else setGeneral(bookingErrorMessage(error));
          requestAnimationFrame(() => alertRef.current?.focus());
        },
      },
    );
  };

  return (
    <Shell>
      <p className="text-sm text-primary font-semibold mb-1">Reservar</p>
      <h1 className="text-3xl font-bold text-gray-900 mb-1">{property.name}</h1>
      <p className="text-sm text-gray-500 mb-8">Elige las fechas y los huéspedes; confirmaremos la disponibilidad al reservar.</p>

      {!room ? (
        <p className="text-sm text-gray-600">Este alojamiento todavía no tiene habitaciones con precio disponibles para reservar.</p>
      ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); confirm(); }} className="flex flex-col gap-5">
          {(errors.length > 0 || general) && (
            <div ref={alertRef} tabIndex={-1} role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl focus:outline-none flex flex-col gap-1">
              {errors.map(([key, message]) => <p key={key} id={'booking-error-' + key}>{message}</p>)}
              {general && <p>{general}</p>}
            </div>
          )}

          {bookableRooms.length > 1 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="booking-room" className="text-xs font-semibold text-gray-700">HABITACIÓN</label>
              <select
                id="booking-room"
                value={room.id}
                onChange={(e) => { setRoomId(e.target.value); setBreakfastSelected(false); setGuests(1); resetFeedback(); }}
                className="h-10 px-3 border border-gray-500 rounded-xl text-sm"
              >
                {bookableRooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} · {formatMoney(r.basePrice!.amount, r.basePrice!.currency)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="booking-check-in" className="text-xs font-semibold text-gray-700">ENTRADA</label>
              <input
                id="booking-check-in" {...errorProps('checkIn')} type="date" value={checkIn} min={today}
                onChange={(e) => { setCheckIn(e.target.value); if (checkOut && checkOut <= e.target.value) setCheckOut(''); resetFeedback(); }}
                className="h-10 px-2 border border-gray-500 rounded-xl text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="booking-check-out" className="text-xs font-semibold text-gray-700">SALIDA</label>
              <input
                id="booking-check-out" {...errorProps('checkOut')} type="date" value={checkOut} min={checkIn || today}
                onChange={(e) => { setCheckOut(e.target.value); resetFeedback(); }}
                className="h-10 px-2 border border-gray-500 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="booking-guests" className="text-xs font-semibold text-gray-700">HUÉSPEDES</label>
            <select
              id="booking-guests" {...errorProps('guests')} value={guests}
              onChange={(e) => { setGuests(Number(e.target.value)); resetFeedback(); }}
              className="h-10 px-3 border border-gray-500 rounded-xl text-sm"
            >
              {Array.from({ length: room.capacity }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} huésped{n === 1 ? '' : 'es'}</option>
              ))}
            </select>
          </div>

          {room.breakfastPerGuestNight && <label><input type="checkbox" checked={withBreakfast} onChange={e => setBreakfastSelected(e.target.checked)} /> Incluir desayuno ({formatMoney(room.breakfastPerGuestNight.amount, currency)} por huésped y noche)</label>}
          {canQuote && price.isFetching && <p role="status">Consultando el precio...</p>}
          {price.isError && <p role="alert">No se pudo cotizar la estancia. <button type="button" onClick={() => void price.refetch()}>Reintentar</button></p>}
          {canQuote && room.basePrice && price.data && (
            <dl aria-label="Resumen de la reserva" className="flex flex-col gap-2 border-t border-gray-100 pt-4">
              <div className="flex justify-between text-sm text-gray-700">
                <dt>{`${formatMoney(room.basePrice.amount, currency)} × ${nights} ${nights === 1 ? 'noche' : 'noches'}`}</dt>
              </div>
              {withBreakfast && <>
                <div className="flex justify-between"><dt>Alojamiento</dt><dd>{formatMoney(price.data.lodging, price.data.currency)}</dd></div>
                <div className="flex justify-between"><dt>Desayuno</dt><dd>{formatMoney(price.data.breakfast, price.data.currency)}</dd></div>
              </>}
              <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-3">
                <dt>Total</dt>
                <dd>{formatMoney(price.data.total, price.data.currency)}</dd>
              </div>
            </dl>
          )}

          <Button type="submit" variant="primary" size="lg" disabled={canQuote && (!price.data || price.isFetching)} loading={createMutation.isPending}>Confirmar reserva</Button>
          <p className="text-xs text-center text-gray-600">Crearemos tu reserva y te llevaremos al pago. No se te cobrará nada todavía.</p>
        </form>
      )}
    </Shell>
  );
}
