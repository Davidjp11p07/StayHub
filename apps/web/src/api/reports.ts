import { http } from './http';

export interface Revenue { currency: string; chargedMinor: string; refundedMinor: string; netMinor: string }
export interface Occupancy { occupiedRoomNights: number; availableRoomNights: number | null; rate: number | null; complete: boolean; reason: string | null; projected?: boolean }
export interface Metrics {
  reservations: { total: number; byStatus: Record<string, number>; cancelledCohort: number; cancellationRate: number | null };
  cancellations: number;
  revenue: Revenue[];
  occupancy: Occupancy;
  series: Array<{ period: string; reservations: number; cancellations: number; revenue: Revenue[]; occupancy: Occupancy }>;
}
export interface OwnerReport {
  ownerId: string; from: string; to: string; group: 'day' | 'month'; propertyId: string | null;
  generatedAt: string; source: 'LIVE' | 'DEMO'; timezone: 'UTC'; metrics: Metrics; previous: Metrics;
  properties: Array<{ id: string; name: string }>;
}
export interface ReportFilters { from: string; to: string; group: 'day' | 'month'; propertyId?: string }
export async function getOwnerReport(ownerId: string, filters: ReportFilters, signal?: AbortSignal): Promise<OwnerReport> {
  const response = await http.get<OwnerReport>('/reports/owner/' + encodeURIComponent(ownerId), { params: filters, ...(signal ? { signal } : {}) });
  return response.data;
}
export function money(minor: string, currency: string): string {
  const value = BigInt(minor);
  const absolute = value < 0n ? -value : value;
  return currency + ' ' + (value < 0n ? '-' : '') + new Intl.NumberFormat('es-CO').format(absolute / 100n) + ',' + (absolute % 100n).toString().padStart(2, '0');
}
