import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Profile } from './Profile';
import { http } from '../api/http';

vi.mock('../components/Header', () => ({ Header: () => null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ currentUser: { id: 'user-1' }, retryProfile: vi.fn() }) }));
vi.mock('../api/http', () => ({ http: { get: vi.fn(), patch: vi.fn() } }));

describe('profile', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(http.get).mockResolvedValue({ data: { id: 'user-1', name: 'Ana', email: 'ana@example.test', version: 3 } }); });
  it('sends the version and edited name as multipart data', async () => {
    vi.mocked(http.patch).mockResolvedValue({ data: { id: 'user-1', name: 'Ana Maria', email: 'ana@example.test', version: 4 } });
    render(<Profile />);
    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Ana Maria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(http.patch).toHaveBeenCalled());
    const [path, body] = vi.mocked(http.patch).mock.calls[0]!;
    expect(path).toBe('/users/user-1/profile');
    expect(JSON.parse((body as FormData).get('profile') as string)).toEqual({ expectedVersion: 3, name: 'Ana Maria' });
  });
});
