import { useEffect, useRef, useState, type FormEvent } from 'react';
import { API_BASE_URL } from '../api/http';
import { currencyReply } from './chatCurrency';
import './ChatWidget.css';

type Message = { role: 'user' | 'assistant'; text: string };
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
    setMessages(current => [...current, { role: 'user', text: item.question }, { role: 'assistant', text: item.answer }]);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const conversion = currencyReply(text, messages);
    if (conversion) {
      setError(''); setInput('');
      failedMessage.current = null;
      setMessages(current => [...current, { role: 'user', text }, { role: 'assistant', text: conversion }]);
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
        body: JSON.stringify({ message: text, history: history.slice(-8).map(message => `${message.role === 'user' ? 'Usuario' : 'Asistente'}: ${message.text}`.slice(0, 1000)) }),
      });
      if (!response.ok) { if (activeRequest.current === controller) { setError(errorMessage(response.status)); setInput(text); failedMessage.current = text; } return; }
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('reply' in data) || typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Invalid response');
      if (activeRequest.current !== controller) return;
      setMessages(current => [...current, { role: 'assistant', text: data.reply as string }]);
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
        <div aria-live="polite" aria-relevant="additions text" className="space-y-3">{messages.map((message, index) => <p key={index} className={`whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${message.role === 'user' ? 'ml-8 bg-gray-900 text-white' : 'mr-8 bg-gray-100 text-gray-800'}`}><span className="sr-only">{message.role === 'user' ? 'Tú: ' : 'Asistente: '}</span>{message.text}</p>)}{busy && <p role="status" className="text-sm text-gray-500">Buscando una respuesta… Esto puede tardar unos segundos.</p>}</div>
        {messages.length === 1 && <div aria-label="Preguntas frecuentes" className="mt-4 flex flex-wrap gap-2">{HELP.map(item => <button key={item.question} type="button" disabled={busy} onClick={() => showHelp(item)} className="rounded-full border border-gray-300 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">{item.question}</button>)}</div>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error} Tu pregunta sigue en el cuadro para que puedas reenviarla.</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={event => { void send(event); }} className="flex gap-2 border-t p-3"><label htmlFor="stayhub-chat-input" className="sr-only">Tu pregunta</label><input ref={inputRef} id="stayhub-chat-input" value={input} onChange={event => setInput(event.target.value)} disabled={busy} maxLength={1000} placeholder="Escribe tu pregunta" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" /><button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50">Enviar</button></form>
    </section>}
    <button type="button" aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'} aria-expanded={open} aria-controls="stayhub-chat" onClick={() => setOpen(!open)} className="flex h-14 items-center justify-center gap-2 rounded-full bg-gray-900 px-5 text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"><svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h8" strokeLinecap="round"/></svg><span className="text-sm font-semibold">{open ? 'Cerrar chat' : 'Chat de ayuda'}</span></button>
  </div>;
}
