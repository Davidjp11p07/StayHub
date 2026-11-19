import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatWidget } from './ChatWidget';

describe('ChatWidget', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
});
