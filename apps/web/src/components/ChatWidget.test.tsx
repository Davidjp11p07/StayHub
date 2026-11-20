import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatWidget } from './ChatWidget';
import { session } from '../api/session';
import { http } from '../api/http';

describe('ChatWidget', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('shows the verifiable source under the answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ reply: 'Hay 4 alojamientos en Bogotá.', explanation: 'Fuente consultada: Search. Resultados recuperados: 4.' }) }));
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    fireEvent.change(screen.getByLabelText('Tu pregunta'), { target: { value: '¿Cuántos inmuebles hay en Bogotá?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Hay 4 alojamientos en Bogotá.')).toBeInTheDocument();
    expect(screen.getByText('Fuente consultada: Search. Resultados recuperados: 4.')).toBeInTheDocument();
    expect(screen.getAllByText('¿Cómo llegué a esta respuesta?')).toHaveLength(2);
  });

  it('offers verified help without a network request and clears the conversation', () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    fireEvent.click(screen.getByRole('button', { name: '¿Cómo hago una reserva?' }));
    expect(screen.getByText(/reserva pendiente de pago/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(screen.queryByText(/reserva pendiente de pago/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '¿Cómo hago una reserva?' })).toBeInTheDocument();
  });

  it('preserves a failed question so it can be retried', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ reply: 'Puedes buscar por ciudad.' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    const input = screen.getByLabelText('Tu pregunta');
    fireEvent.change(input, { target: { value: '¿Cómo busco?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no está disponible');
    expect(input).toHaveValue('¿Cómo busco?');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Puedes buscar por ciudad.')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not restore an in-flight answer after the conversation is cleared', async () => {
    let resolveResponse!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(resolve => { resolveResponse = resolve; })));
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    fireEvent.change(screen.getByLabelText('Tu pregunta'), { target: { value: 'Pregunta anterior' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    resolveResponse({ ok: true, json: () => Promise.resolve({ reply: 'Respuesta anterior' }) });
    await waitFor(() => expect(screen.queryByText('Respuesta anterior')).not.toBeInTheDocument());
  });

  it('converts a previous COP price to USD using the stated reference rate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ reply: 'El alojamiento cuesta 250000 COP por noche.' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    const input = screen.getByLabelText('Tu pregunta');
    fireEvent.change(input, { target: { value: '¿Cuál es el precio?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/250000 COP/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '¿En USD?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(screen.getByText(/75,76 USD/)).toHaveTextContent('tasas fijas de referencia');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the user message before the waiting indicator', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    fireEvent.change(screen.getByLabelText('Tu pregunta'), { target: { value: 'Busco una casa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    const message = screen.getByText('Busco una casa');
    const waiting = screen.getByRole('status');
    expect(message.compareDocumentPosition(waiting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText('Tu pregunta')).toHaveValue('');
  });

  it('still sends a new search requested in USD', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ reply: 'Resultados de búsqueda.' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    fireEvent.change(screen.getByLabelText('Tu pregunta'), { target: { value: 'Busca alojamientos con precio en USD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Resultados de búsqueda.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('requires a session before looking up a private booking', async () => {
    vi.spyOn(session, 'accessToken').mockReturnValue(undefined);
    const get = vi.spyOn(http, 'get');
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    fireEvent.change(screen.getByLabelText('Tu pregunta'), { target: { value: 'Estado de mi reserva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/Inicia sesión para consultar/)).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('reads an authenticated booking and excludes it from later public model history', async () => {
    vi.spyOn(session, 'accessToken').mockReturnValue('token');
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: { propertyName: 'Casa privada', checkIn: '2027-01-01', checkOut: '2027-01-03', status: 'CONFIRMED', paymentStatus: 'CAPTURED', total: { amount: '200', currency: 'COP' } } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ reply: 'Puedes buscar por ciudad.' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    const input = screen.getByLabelText('Tu pregunta');
    fireEvent.change(input, { target: { value: 'Mi reserva 794e39f7-7903-4b32-a833-55edb2bfbd19' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/Casa privada/)).toHaveTextContent('2027-01-01');
    expect(screen.getByText(/Casa privada/)).toHaveTextContent('El pago figura como cobrado');
    expect(screen.getByText(/Casa privada/)).toHaveTextContent('no incluye la causa de un fallo');
    expect(get).toHaveBeenCalledWith('/bookings/794e39f7-7903-4b32-a833-55edb2bfbd19', expect.anything());
    fireEvent.change(input, { target: { value: '¿Cómo busco?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Puedes buscar por ciudad.');
    expect(fetchMock.mock.calls[0][1].body).not.toContain('Casa privada');
    expect(fetchMock.mock.calls[0][1].body).not.toContain('794e39f7');
  });

  it('lists only the authenticated user’s bookings without sending them to the model', async () => {
    vi.spyOn(session, 'accessToken').mockReturnValue('token');
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: { items: [{ id: 'booking-id', propertyName: 'Casa privada', checkIn: '2027-01-01', checkOut: '2027-01-03', status: 'CONFIRMED' }], hasNext: false } });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    render(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    fireEvent.change(screen.getByLabelText('Tu pregunta'), { target: { value: 'Mis reservas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/Casa privada/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/bookings', expect.objectContaining({ params: { pageSize: 5 } }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
