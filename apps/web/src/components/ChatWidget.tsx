import { useEffect, useRef, useState, type FormEvent } from 'react';
import { API_BASE_URL, http } from '../api/http';
import { session } from '../api/session';
import { currencyReply } from './chatCurrency';
import './ChatWidget.css';

type Message = { role: 'user' | 'assistant'; text: string; private?: boolean; explanation?: string };
const BOOKING_ID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const PRIVATE_BOOKING = /\b(?:mi|mis|mía|mio|propia|personal)\b.*\b(?:reserva|reservas|pago|pagos)\b|\b(?:reserva|reservas|pago|pagos)\b.*\b(?:mi|mis|mía|mio|personal)\b/i;
type Booking = { propertyName: string; checkIn: string; checkOut: string; status: string; paymentStatus: string; total: { amount: string; currency: string } };
type BookingSummary = { id: string; propertyName: string; checkIn: string; checkOut: string; status: string };
const BOOKING_STATUS: Record<string, string> = {
  PENDING_PAYMENT: 'La reserva está pendiente de pago.', CONFIRMED: 'La reserva está confirmada.',
  CHECKED_IN: 'El check-in está registrado.', COMPLETED: 'La estancia está completada.',
  PAYMENT_FAILED: 'La reserva registra un pago fallido; no se informa la causa.',
  EXPIRED: 'La reserva figura como vencida.', CANCELLED_BY_GUEST: 'La reserva figura cancelada por el huésped.',
  CANCELLED_BY_OWNER: 'La reserva figura cancelada por el anfitrión.',
};
const PAYMENT_STATUS: Record<string, string> = {
  ORDER_PENDING: 'La orden de pago está pendiente.', PENDING: 'El pago está pendiente.',
  CAPTURED: 'El pago figura como cobrado.', FAILED: 'El pago figura como fallido; no se informa la causa.',
  REVIEW_REQUIRED: 'El pago requiere revisión.', REFUND_PENDING: 'El reembolso está pendiente.',
  REFUNDED: 'El pago figura como reembolsado.', PARTIALLY_REFUNDED: 'El pago figura como parcialmente reembolsado.',
  REFUND_FAILED: 'El reembolso figura como fallido; no se informa la causa.', REFUND_REVIEW_REQUIRED: 'El reembolso requiere revisión.',
};
const WELCOME: Message = { role: 'assistant', text: '¡Hola! Puedo ayudarte con alojamientos y preguntas sobre StayHub.' };

// These answers describe the current frontend flows and do not depend on a model or private data.
const HELP = [
  { question: '¿Cómo busco un alojamiento?', answer: 'Usa la búsqueda de la página principal o entra en Buscar alojamientos. Puedes elegir ubicación, fechas, huéspedes, precio y servicios. Abre un resultado para ver sus detalles.' },
  { question: '¿Cómo creo una cuenta?', answer: 'Selecciona Registrarse, completa el formulario y crea tu cuenta. Después podrás iniciar sesión con tu correo y contraseña.' },
  { question: '¿Cómo hago una reserva?', answer: 'Abre un alojamiento y elige reservar. Inicia sesión como huésped si se te solicita; selecciona habitación, fechas y huéspedes. Al continuar se crea una reserva pendiente de pago y se abre el paso de pago. La disponibilidad se confirma al reservar.' },
] as const;

function errorMessage(status?: number): string {
  if (status === 429) return 'Has enviado varias preguntas. Espera un momento y vuelve a intentarlo.';
  if (status === 503) return 'El asistente no está disponible ahora. Inténtalo de nuevo en unos minutos.';
  return 'No pudimos enviar tu pregunta. Comprueba la conexión y vuelve a intentarlo.';
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const failedMessage = useRef<string | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    let identity = session.snapshot().currentUser?.sessionId;
    return session.subscribe(() => {
      const next = session.snapshot().currentUser?.sessionId;
      if (next !== identity) { identity = next; activeRequest.current?.abort(); activeRequest.current = null; failedMessage.current = null; setBusy(false); setError(''); setInput(''); setMessages([WELCOME]); }
    });
  }, []);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView?.({ block: 'end' }); }, [messages, busy, error, open]);

  function clear() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    failedMessage.current = null;
    setBusy(false); setError(''); setInput(''); setMessages([WELCOME]);
    inputRef.current?.focus();
  }

  function showHelp(item: typeof HELP[number]) {
    if (busy) return;
    setError('');
    setMessages(current => [...current, { role: 'user', text: item.question }, { role: 'assistant', text: item.answer, explanation: 'Fuente: instrucciones de uso incluidas en esta aplicación.' }]);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const bookingId = text.match(BOOKING_ID)?.[0];
    if (bookingId || PRIVATE_BOOKING.test(text)) {
      setError(''); setInput(''); failedMessage.current = null;
      setMessages(current => [...current, { role: 'user', text, private: true }]);
      if (!session.accessToken()) { setMessages(current => [...current, { role: 'assistant', text: 'Inicia sesión para consultar tu reserva y su estado de pago.', private: true }]); return; }
      const controller = new AbortController(); activeRequest.current = controller; setBusy(true);
      try {
        if (!bookingId) {
          const { data } = await http.get<{ items: BookingSummary[]; hasNext: boolean }>('/bookings', { params: { pageSize: 5 }, signal: controller.signal });
          if (activeRequest.current !== controller) return;
          const lines = data.items.map(item => `• ${item.propertyName}: ${item.checkIn} a ${item.checkOut}; ${item.status}. ID: ${item.id}`);
          const reply = lines.length ? `Estas son tus reservas más recientes:\n${lines.join('\n')}\nIndica el ID para consultar su pago y más detalles.${data.hasNext ? ' Hay más reservas en Mis reservas.' : ''}` : 'No tienes reservas en este momento.';
          setMessages(current => [...current, { role: 'assistant', text: reply, private: true, explanation: 'Fuente consultada: Bookings. Se muestran como máximo las cinco reservas más recientes de tu cuenta.' }]);
          return;
        }
        const { data } = await http.get<Booking>(`/bookings/${bookingId}`, { signal: controller.signal });
        if (activeRequest.current !== controller) return;
        const bookingMeaning = BOOKING_STATUS[data.status] ?? 'No hay una descripción disponible para este estado.';
        const paymentMeaning = PAYMENT_STATUS[data.paymentStatus] ?? 'No hay una descripción disponible para este estado.';
        const reply = `Reserva en ${data.propertyName}\nEntrada: ${data.checkIn}\nSalida: ${data.checkOut}\nEstado de la reserva: ${data.status}. ${bookingMeaning}\nEstado del pago registrado en la reserva: ${data.paymentStatus}. ${paymentMeaning}\nTotal: ${data.total.amount} ${data.total.currency}\nFuente: datos de la reserva consultada en Bookings. El estado del pago es el registrado allí; no incluye la causa de un fallo.`;
        setMessages(current => [...current, { role: 'assistant', text: reply, private: true, explanation: 'Fuente consultada: Bookings, para el identificador de reserva indicado.' }]);
      } catch {
        if (activeRequest.current === controller && !controller.signal.aborted) setMessages(current => [...current, { role: 'assistant', text: 'No pude consultar esa reserva. Comprueba el identificador y que pertenezca a tu cuenta, o inténtalo más tarde.', private: true }]);
      } finally { if (activeRequest.current === controller) { activeRequest.current = null; setBusy(false); } }
      return;
    }
    const conversion = currencyReply(text, messages.filter(message => !message.private));
    if (conversion) {
      setError(''); setInput('');
      failedMessage.current = null;
      setMessages(current => [...current, { role: 'user', text }, { role: 'assistant', text: conversion, explanation: 'Conversión calculada en la aplicación a partir de un precio anterior y tasas fijas de referencia indicadas en la respuesta.' }]);
      return;
    }
    const retry = failedMessage.current === text;
    const history = retry ? messages.slice(0, -1) : messages;
    failedMessage.current = null;
    if (!retry) setMessages(current => [...current, { role: 'user', text }]);
    const controller = new AbortController();
    activeRequest.current = controller;
    setError(''); setInput(''); setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ message: text, history: history.filter(message => !message.private).slice(-8).map(message => `${message.role === 'user' ? 'Usuario' : 'Asistente'}: ${message.text}`.slice(0, 1000)) }),
      });
      if (!response.ok) { if (activeRequest.current === controller) { setError(errorMessage(response.status)); setInput(text); failedMessage.current = text; } return; }
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('reply' in data) || typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Invalid response');
      if (activeRequest.current !== controller) return;
      const explanation = 'explanation' in data && typeof data.explanation === 'string' ? data.explanation : undefined;
      setMessages(current => [...current, { role: 'assistant', text: data.reply as string, ...(explanation ? { explanation } : {}) }]);
    } catch {
      if (activeRequest.current === controller && !controller.signal.aborted) { setError(errorMessage()); setInput(text); failedMessage.current = text; }
    } finally {
      if (activeRequest.current === controller) { activeRequest.current = null; setBusy(false); }
    }
  }

  return <div className="stayhub-chat-widget fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-5 sm:right-5">
    {open && <section id="stayhub-chat" aria-label="Asistente de StayHub" className="flex h-[min(32rem,calc(100dvh-7rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
      <div className="flex items-start justify-between gap-2 bg-gray-900 px-4 py-3 text-white">
        <div><h2 className="font-semibold">Asistente StayHub</h2><p className="text-xs text-gray-300">Alojamientos, reservas y uso de la página</p></div>
        <div className="flex items-center gap-1"><button type="button" onClick={clear} className="rounded-lg px-2 py-2 text-xs hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Limpiar</button><button type="button" aria-label="Cerrar chat" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-xl hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">×</button></div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        <div aria-live="polite" aria-relevant="additions text" className="space-y-3">{messages.map((message, index) => <div key={index} className={`whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${message.role === 'user' ? 'ml-8 bg-gray-900 text-white' : 'mr-8 bg-gray-100 text-gray-800'}`}><p><span className="sr-only">{message.role === 'user' ? 'Tú: ' : 'Asistente: '}</span>{message.text}</p>{message.role === 'assistant' && <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">¿Cómo llegué a esta respuesta?</summary><p className="mt-1 text-xs">{message.explanation ?? 'No hay fuentes adicionales registradas para esta respuesta.'}</p></details>}</div>)}{busy && <p role="status" className="text-sm text-gray-500">Buscando una respuesta… Esto puede tardar unos segundos.</p>}</div>
        {messages.length === 1 && <div aria-label="Preguntas frecuentes" className="mt-4 flex flex-wrap gap-2">{HELP.map(item => <button key={item.question} type="button" disabled={busy} onClick={() => showHelp(item)} className="rounded-full border border-gray-300 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">{item.question}</button>)}</div>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error} Tu pregunta sigue en el cuadro para que puedas reenviarla.</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={event => { void send(event); }} className="flex gap-2 border-t p-3"><label htmlFor="stayhub-chat-input" className="sr-only">Tu pregunta</label><input ref={inputRef} id="stayhub-chat-input" value={input} onChange={event => setInput(event.target.value)} disabled={busy} maxLength={1000} placeholder="Escribe tu pregunta" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" /><button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50">Enviar</button></form>
    </section>}
    <button type="button" aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'} aria-expanded={open} aria-controls="stayhub-chat" onClick={() => setOpen(!open)} className="flex h-14 items-center justify-center gap-2 rounded-full bg-gray-900 px-5 text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"><svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h8" strokeLinecap="round"/></svg><span className="text-sm font-semibold">{open ? 'Cerrar chat' : 'Chat de ayuda'}</span></button>
  </div>;
}
