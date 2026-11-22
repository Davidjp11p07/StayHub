import { getOwnerBookingHistory, type OwnerBookingHistoryFilters } from './bookings-history';
import type { Booking } from '../types/catalog';

export async function ownerStays(filters: OwnerBookingHistoryFilters, signal?: AbortSignal) {
  const result = new Map<string, Booking>();
  for (let page = 1; ; page++) {
    const batch = await getOwnerBookingHistory({ ...filters, page, pageSize: 100 }, signal);
    for (const stay of batch.items) result.set(stay.id, stay);
    if (!batch.hasNext) return [...result.values()];
  }
}
export const occupies = (stay: Booking) => ['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN'].includes(stay.status);
