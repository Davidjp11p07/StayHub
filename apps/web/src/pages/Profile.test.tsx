import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Profile } from './Profile';
import { http } from '../api/http';
import { ApiError } from '../api/identity';

vi.mock('../components/Header', () => ({ Header: () => null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ currentUser: { id: 'user-1' }, retryProfile: vi.fn() }) }));
vi.mock('../api/http', () => ({ http: { get: vi.fn(), patch: vi.fn() } }));

describe('profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:profile'), revokeObjectURL: vi.fn() }));
    vi.mocked(http.get).mockImplementation(async (url) => url.endsWith('/photo')
      ? { data: new Blob(['photo'], { type: 'image/png' }) }
      : { data: { id: 'user-1', name: 'Ana', email: 'ana@example.test', version: 3 } });
  });
  afterEach(() => vi.unstubAllGlobals());
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
  it('loads the authenticated photo and releases its object URL', async () => {
    const { unmount } = render(<Profile />);
    const photo = await screen.findByRole('img', { name: 'Foto de perfil' });
    expect(photo.getAttribute('src')).toBe('blob:profile');
    expect(http.get).toHaveBeenCalledWith('/users/user-1/profile/photo', expect.objectContaining({ responseType: 'blob' }));
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile');
  });
  it('reports photo download failures', async () => {
    vi.mocked(http.get).mockImplementation(async (url) => {
      if (url.endsWith('/photo')) throw new ApiError(503);
      return { data: { id: 'user-1', name: 'Ana', email: 'ana@example.test', version: 3 } };
    });
    render(<Profile />);
    expect(await screen.findByText('No pudimos cargar tu foto de perfil.')).toBeTruthy();
  });
});
