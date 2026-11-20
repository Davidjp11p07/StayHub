import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Inventory } from './Inventory';
import { http } from '../../api/http';

vi.mock('../../components/Header', () => ({ Header: () => null }));
vi.mock('../../api/http', () => ({ http: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

describe('room inventory', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(http.get).mockResolvedValue({ data: { version: 4, items: [{ id: 'item-1', type: 'PRODUCT', name: 'Toalla', quantityAvailable: 2, active: true }] } }); });
  it('uses the returned version to update an item', async () => {
    vi.mocked(http.put).mockResolvedValue({ data: {} });
    render(<MemoryRouter initialEntries={['/host/inventory/room-1']}><Routes><Route path="/host/inventory/:roomId" element={<Inventory />} /></Routes></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(http.put).toHaveBeenCalledWith('/inventory/rooms/room-1', { expectedVersion: 4, items: [{ id: 'item-1', type: 'PRODUCT', name: 'Toalla', quantityAvailable: 2, active: false }] }));
  });
});
