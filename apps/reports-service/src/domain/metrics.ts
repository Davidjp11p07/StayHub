export interface BookingFact {
    id: string;
    ownerId: string;
    propertyId: string;
    roomId: string;
    status: string;
    createdAt: string;
    cancelledAt: string | null;
    checkIn: string;
    checkOut: string;
}
export interface MovementFact {
    id: string;
    bookingId: string;
    kind: 'CHARGE' | 'REFUND';
    currency: string;
    amountMinor: string;
    occurredAt: string;
}
export interface SupplyFact {
    id: string;
    propertyId: string;
    name: string;
    capturedAt: string;
    roomIds: string[];
}
export interface Facts {
    bookings: BookingFact[];
    movements: MovementFact[];
    supply: SupplyFact[];
}
export interface Range {
    from: string;
    to: string;
    days: number;
}
export type Group = 'day' | 'month';
const DAY = 86400000;
export class ReportInputError extends Error {
}
export function date(value: string): number { const ms = Date.parse(value + 'T00:00:00.000Z'); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value)
    throw new ReportInputError('INVALID_DATE'); return ms; }
export function parseRange(from: string, to: string, maxDays = 366): Range { const days = (date(to) - date(from)) / DAY; if (days < 1 || days > maxDays)
    throw new ReportInputError('INVALID_RANGE'); return { from, to, days }; }
export function previous(range: Range): Range { return { from: new Date(date(range.from) - range.days * DAY).toISOString().slice(0, 10), to: range.from, days: range.days }; }
const unique = <T extends {
    id: string;
}>(items: T[]): T[] => [...new Map(items.map(i => [i.id, i])).values()];
const inside = (timestamp: string, range: Range): boolean => timestamp >= range.from && timestamp < range.to;
export function aggregate(facts: Facts, range: Range, group: Group, propertyId?: string) {
    const bookings = unique(facts.bookings).filter(b => !propertyId || b.propertyId === propertyId);
    const ids = new Set(bookings.map(b => b.id));
    const movements = unique(facts.movements).filter(m => ids.has(m.bookingId) && inside(m.occurredAt, range));
    const supply = unique(facts.supply).filter(s => !propertyId || s.propertyId === propertyId).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || Number(BigInt(a.id) - BigInt(b.id)));
    const properties = [...new Set([...bookings.map(b => b.propertyId), ...supply.map(s => s.propertyId)])];
    const created = bookings.filter(b => inside(b.createdAt, range));
    const byStatus: Record<string, number> = {};
    for (const b of created)
        byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
    const cancelled = bookings.filter(b => b.cancelledAt && inside(b.cancelledAt, range));
    const cancelledCohort = created.filter(b => b.status.startsWith('CANCELLED_')).length;
    const money = (rows: MovementFact[]) => {
        const totals = new Map<string, {
            charged: bigint;
            refunded: bigint;
        }>();
        for (const m of rows) {
            if (!/^[A-Z]{3}$/.test(m.currency) || !/^\d+$/.test(m.amountMinor))
                throw new ReportInputError('INVALID_SOURCE_MONEY');
            const total = totals.get(m.currency) ?? { charged: 0n, refunded: 0n };
            if (m.kind === 'CHARGE')
                total.charged += BigInt(m.amountMinor);
            else
                total.refunded += BigInt(m.amountMinor);
            totals.set(m.currency, total);
        }
        return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, t]) => ({ currency, chargedMinor: t.charged.toString(), refundedMinor: t.refunded.toString(), netMinor: (t.charged - t.refunded).toString() }));
    };
    const occupied = new Map<string, Set<string>>();
    const supplyByProperty = new Map(properties.map(p => [p, supply.filter(s => s.propertyId === p)]));
    for (const b of bookings.filter(b => ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(b.status))) {
        for (let day = Math.max(date(range.from), date(b.checkIn)); day < Math.min(date(range.to), date(b.checkOut)); day += DAY) {
            const key = new Date(day).toISOString().slice(0, 10);
            const rooms = occupied.get(key) ?? new Set<string>();
            rooms.add(b.roomId);
            occupied.set(key, rooms);
        }
    }
    const dayRows: Array<{
        period: string;
        occupied: number;
        available: number | null;
    }> = [];
    for (let day = date(range.from); day < date(range.to); day += DAY) {
        const d = new Date(day).toISOString().slice(0, 10);
        let available = 0;
        let complete = true;
        for (const p of properties) {
            const rows = (supplyByProperty.get(p) ?? []).filter(s => s.capturedAt <= d + 'T00:00:00.000Z');
            const last = rows[rows.length - 1];
            if (!last)
                complete = false;
            else
                available += new Set(last.roomIds).size;
        }
        dayRows.push({ period: d, occupied: occupied.get(d)?.size ?? 0, available: complete ? available : null });
    }
    const occupancy = (rows: typeof dayRows) => { const complete = rows.every(d => d.available !== null); const available = complete ? rows.reduce((n, d) => n + (d.available ?? 0), 0) : null; const taken = rows.reduce((n, d) => n + d.occupied, 0); const inconsistent = available !== null && taken > available; return { occupiedRoomNights: taken, availableRoomNights: available, rate: available && !inconsistent ? Math.round(taken / available * 10000) / 100 : null, complete: complete && !inconsistent, reason: !complete ? 'HISTORICAL_SUPPLY_UNAVAILABLE' : inconsistent ? 'SUPPLY_BOOKING_MISMATCH' : available === 0 ? 'NO_AVAILABLE_ROOM_NIGHTS' : null }; };
    const buckets = [...new Set(dayRows.map(d => group === 'month' ? d.period.slice(0, 7) : d.period))];
    const series = buckets.map(period => ({ period, reservations: created.filter(b => b.createdAt.startsWith(period)).length, cancellations: cancelled.filter(b => b.cancelledAt?.startsWith(period)).length, revenue: money(movements.filter(m => m.occurredAt.startsWith(period))), occupancy: occupancy(dayRows.filter(d => d.period.startsWith(period))) }));
    return { reservations: { total: created.length, byStatus, cancelledCohort, cancellationRate: created.length ? Math.round(cancelledCohort / created.length * 10000) / 100 : null }, cancellations: cancelled.length, revenue: money(movements), occupancy: { ...occupancy(dayRows), projected: range.to > new Date().toISOString().slice(0, 10) }, series };
}
export type Metrics = ReturnType<typeof aggregate>;
