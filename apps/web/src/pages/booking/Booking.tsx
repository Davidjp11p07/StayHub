import { GuestCalendar } from './GuestCalendar';
import { useQuery } from '@tanstack/react-query';
import { http } from '../../api/http';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createBooking, bookingErrorMessage, newIdempotencyKey, useCreateBooking } from '../../api/bookings';
import { ApiError } from '../../api/identity';
import { formatMoney, useProperty } from '../../api/properties';
import { paths } from '../../app/navigation';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { countNights, useBookings, validateStayDates } from '../../context/BookingContext';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <main className="management-content flex-1 max-w-2xl mx-auto px-6 py-10 w-full">{children}</main>
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
  const recoverKey='stayhub:booking-attempt:'+useAuth().currentUser?.id+':'+id;
  const [uncertain,setUncertain]=useState(false);
  useEffect(()=>{
    try {
      const saved=JSON.parse(sessionStorage.getItem(recoverKey) ?? 'null');
      if (!saved || typeof saved.key!=='string' || typeof saved.payload!=='string') return;
      const input=JSON.parse(saved.payload);
      if(input.propertyId!==id)return;
      attempt.current=saved;setRoomId(input.roomId);setCheckIn(input.checkIn);setCheckOut(input.checkOut);setGuests(input.guests);setBreakfastSelected(input.breakfastSelected);setUncertain(true);
    }catch{/* optional browser state */}
  },[recoverKey,id]);
  const clearAttempt=()=>{try{sessionStorage.removeItem(recoverKey);}catch{/* optional storage */}setUncertain(false);};
  const reconcile=async()=>{
    if(!attempt.current || submitting.current)return;
    submitting.current=true;
    try{
      const prior=await createBooking(JSON.parse(attempt.current.payload),attempt.current.key);
      clearAttempt();navigate(paths.bookingPay(prior.id));
    }catch(error){
      if(error instanceof ApiError && error.status>=400 && error.status<500 && error.status!==429){clearAttempt();}
      setGeneral(bookingErrorMessage(error));
    }finally{submitting.current=false;}
  };
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
    if (uncertain || submitting.current || !room || !room.basePrice) return;
    setShowErrors(true);
    setGeneral(undefined);
    if (Object.values(validate()).some(Boolean)) {
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }
    if (!price.data || price.isFetching || price.isError) return;
    submitting.current = true;
    const input = { propertyId: property.id, roomId: room.id, checkIn, checkOut, guests, breakfastSelected: withBreakfast, expectedPropertyVersion: price.data.propertyVersion };
    const payload = JSON.stringify(input);
    if (!attempt.current || attempt.current.payload !== payload) attempt.current = { payload, key: newIdempotencyKey() };
    const idempotencyKey = attempt.current.key;
    try{sessionStorage.setItem(recoverKey,JSON.stringify(attempt.current));}catch{/* optional storage */}
    createMutation.mutate(
      { input, idempotencyKey },
      {
        onSuccess: (booking) => {
          clearAttempt();
          setDraft({
            propertyId: property.id, propertyName: property.name, roomId: room.id, roomName: room.name,
            checkIn, checkOut, guests, nights: booking.nights, nightlyPrice: booking.nightlyPrice, total: booking.total,
          });
          navigate(paths.bookingPay(booking.id));
        },
        onError: (error) => {
          submitting.current = false;
          if(error instanceof ApiError && (!error.status || error.status>=500)){setUncertain(true);setGeneral('No recibimos la confirmación. Comprueba la solicitud antes de crear otra reserva.');return;}
          clearAttempt();
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

          <GuestCalendar key={room.id} property={id} room={room.id} name={room.name} today={today} arrival={checkIn}
            onArrival={date=>{setCheckIn(date); if(checkOut<=date) setCheckOut(''); resetFeedback();}} />
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
          {price.isError && <p role="alert">
            {price.error instanceof ApiError && ['BOOKING_CONFLICT','UNSUPPORTED_PAYMENT_CURRENCY'].includes(price.error.problem?.code ?? '')
              ? bookingErrorMessage(price.error)
              : <>No se pudo cotizar la estancia. <button type="button" onClick={() => void price.refetch()}>Reintentar</button></>}
          </p>}
          {canQuote && room.basePrice && price.data && !price.isError && (
            <section><h2 className="text-xl font-semibold">Revisa tu estancia</h2>
            <dl aria-label="Resumen de la reserva" className="flex flex-col gap-2 border-t border-gray-100 pt-4">
              <div><dt>Alojamiento y habitación</dt><dd>{property.name} · {room.name}</dd></div>
              <div><dt>Estancia</dt><dd>{checkIn} → {checkOut} · {guests} {guests===1?'huésped':'huéspedes'}</dd></div>
              {!withBreakfast && <div><dt>Desayuno</dt><dd>{property.features?.some(f=>f.code==='BREAKFAST_INCLUDED')?'Incluido en la tarifa':'Sin desayuno'}</dd></div>}
              <div className="flex justify-between text-sm text-gray-700">
                <dt>{`${formatMoney(room.basePrice.amount, currency)} × ${nights} ${nights === 1 ? 'noche' : 'noches'}`}</dt>
              </div>
              {withBreakfast && <>
                <div className="flex justify-between"><dt>Alojamiento</dt><dd>{formatMoney(price.data.lodging, price.data.currency)}</dd></div>
                <div className="flex justify-between"><dt>Desayuno <small className="block">{guests} huésped(es) × {nights} noche(s) × {formatMoney(room.breakfastPerGuestNight!.amount, currency)}</small></dt><dd>{formatMoney(price.data.breakfast, price.data.currency)}</dd></div>
              </>}
              <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-3">
                <dt>Total</dt>
                <dd>{formatMoney(price.data.total, price.data.currency)}</dd>
              </div>
            </dl></section>
          )}

          <div className="booking-confirm">{price.data && canQuote && !price.isError && !price.isFetching && <strong className="sm:hidden" aria-label={formatMoney(price.data.total,price.data.currency)} data-total={formatMoney(price.data.total,price.data.currency)} />}{uncertain && <button type="button" className="manage-link" onClick={()=>void reconcile()}>Recuperar mi solicitud</button>}<Button type="submit" variant="primary" size="lg" disabled={uncertain || (canQuote && (!price.data || price.isFetching || price.isError))} loading={createMutation.isPending}>Confirmar reserva</Button></div>
          <p className="text-xs text-center text-gray-600">Puedes ajustar los datos arriba. Al confirmar se iniciará el pago simulado.</p>
        </form>
      )}
    </Shell>
  );
}
