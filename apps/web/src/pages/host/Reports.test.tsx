import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Reports } from './Reports';
import { getOwnerReport, money, type OwnerReport } from '../../api/reports';
import { ApiError } from '../../api/identity';

const auth = vi.hoisted(() => ({ currentUser: { id: '11111111-1111-4111-8111-111111111111', role: 'OWNER', name: 'Ana' } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../components/Header', () => ({ Header: () => <header>StayHub</header> }));
vi.mock('../../api/reports', async original => ({ ...await original<typeof import('../../api/reports')>(), getOwnerReport: vi.fn() }));

const metrics: OwnerReport['metrics'] = {
  reservations: { total: 2, byStatus: { CONFIRMED: 1, PAYMENT_FAILED: 1 }, cancelledCohort: 0, cancellationRate: 0 }, cancellations: 0,
  revenue: [{ currency: 'COP', chargedMinor: '4000000', refundedMinor: '1000000', netMinor: '3000000' }, { currency: 'USD', chargedMinor: '1000', refundedMinor: '0', netMinor: '1000' }],
  occupancy: { occupiedRoomNights: 4, availableRoomNights: 10, rate: 40, complete: true, reason: null },
  series: [{ period: '2026-11-01', reservations: 2, cancellations: 0, revenue: [], occupancy: { occupiedRoomNights: 4, availableRoomNights: 10, rate: 40, complete: true, reason: null } }],
};
const report: OwnerReport = { ownerId: auth.currentUser.id, from: '2026-11-01', to: '2026-11-11', group: 'day', propertyId: null, generatedAt: '2026-11-15T12:00:00Z', source: 'DEMO', timezone: 'UTC', metrics, previous: metrics, properties: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Casa demo' }] };
beforeEach(() => { auth.currentUser.role = 'OWNER'; vi.mocked(getOwnerReport).mockReset().mockResolvedValue(report); });

describe('Reports dashboard', () => {
  it('shows exact separate currencies, explicit demo and accessible chart tables', async () => {
    render(<Reports />);
    expect(await screen.findByText(/DEMOSTRACIÓN/)).toBeInTheDocument();
    expect(screen.getAllByText('40 %').length).toBeGreaterThan(0);
    expect(screen.getByRole('table', { name: 'Ingresos por moneda' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Tabla de tendencias/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Reservas creadas/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'USD' } });
    expect(screen.getAllByText('USD 10,00').length).toBeGreaterThan(0);
  });
  it('applies consistent dates, property and monthly grouping', async () => {
    render(<Reports />); await screen.findByText(/DEMOSTRACIÓN/);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Hasta (exclusivo)'), { target: { value: '2026-11-11' } });
    fireEvent.change(screen.getByLabelText('Alojamiento'), { target: { value: report.properties[0]!.id } });
    fireEvent.change(screen.getByLabelText('Agrupar'), { target: { value: 'month' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(getOwnerReport).toHaveBeenLastCalledWith(auth.currentUser.id, { from: '2026-11-01', to: '2026-11-11', propertyId: report.properties[0]!.id, group: 'month' }, expect.any(AbortSignal)));
  });
  it('does not present missing occupancy as zero', async () => {
    vi.mocked(getOwnerReport).mockResolvedValue({ ...report, metrics: { ...metrics, occupancy: { ...metrics.occupancy, availableRoomNights: null, rate: null, complete: false, reason: 'HISTORICAL_SUPPLY_UNAVAILABLE' } } });
    render(<Reports />);
    expect(await screen.findByText(/falta historial/)).toBeInTheDocument();
    expect(screen.getByText('No disponible')).toBeInTheDocument();
  });
  it('requires an explicit owner for admin and submits that owner', async () => {
    auth.currentUser.role = 'ADMIN'; render(<Reports />);
    expect(getOwnerReport).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Propietario'), { target: { value: report.ownerId } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await screen.findByText(/DEMOSTRACIÓN/); expect(getOwnerReport).toHaveBeenCalledWith(report.ownerId, expect.any(Object), expect.any(AbortSignal));
  });
  it('shows source failure and retries without showing fabricated totals', async () => {
    vi.mocked(getOwnerReport).mockRejectedValueOnce(new ApiError(503)); render(<Reports />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos verificar');
    expect(screen.queryByRole('region', { name: 'Indicadores' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); await screen.findByText(/DEMOSTRACIÓN/);
  });
  it('formats large and negative minor units without floating point loss', () => {
    expect(money('900719925474099399', 'COP')).toBe('COP 9.007.199.254.740.993,99');
    expect(money('-123', 'USD')).toBe('USD -1,23');
  });
});
