import { sign } from 'jsonwebtoken';
import { date } from '../domain/metrics';
import type { SourcesPort, ReportQuery } from '../application/get-report';
import type { BookingFact, MovementFact, SupplyFact, Facts } from '../domain/metrics';
import type { ReportsConfig, Target } from './config';
export class SourceUnavailable extends Error {
    constructor() { super('REPORT_SOURCE_UNAVAILABLE'); }
}
export class LiveSources implements SourcesPort {
    readonly source: 'LIVE' | 'DEMO';
    constructor(private readonly config: ReportsConfig, private readonly fetcher: typeof fetch = fetch) { this.source = config.mode; }
    private async request(target: Target, path: string, body?: unknown): Promise<unknown> { try {
        const token = sign({ scope: 'reports:read' }, target.jwt.key, { algorithm: 'RS256', keyid: target.jwt.kid, issuer: target.jwt.issuer, audience: target.jwt.audience, subject: 'reports-service', expiresIn: 60 });
        const response = await this.fetcher(target.url + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(this.config.timeoutMs), redirect: 'error' });
        if (!response.ok)
            throw new Error();
        const raw = await response.text();
        if (Buffer.byteLength(raw) > 8000000)
            throw new Error();
        return JSON.parse(raw) as unknown;
    }
    catch {
        throw new SourceUnavailable();
    } }
    private async pages<T>(target: Target, path: string, ownerId: string): Promise<T[]> { const items: T[] = []; let after: string | null = null; const cursors = new Set<string>(); do {
        const query = new URLSearchParams({ ownerId, limit: '200', ...(after ? { after } : {}) });
        const raw = await this.request(target, path + '?' + query.toString()) as {
            items?: T[];
            nextCursor?: unknown;
        };
        if (!raw || !Array.isArray(raw.items) || raw.items.length > 200 || (raw.nextCursor !== null && typeof raw.nextCursor !== 'string'))
            throw new SourceUnavailable();
        items.push(...raw.items);
        if (items.length > 10000)
            throw new SourceUnavailable();
        after = raw.nextCursor as string | null;
        if (after) {
            if (cursors.has(after))
                throw new SourceUnavailable();
            cursors.add(after);
        }
    } while (after); return items; }
    async load(q: ReportQuery, from: string): Promise<Facts> { const [bookings, supply] = await Promise.all([this.pages<BookingFact>(this.config.targets.bookings, '/internal/v1/reports/bookings', q.ownerId), this.pages<SupplyFact>(this.config.targets.accommodations, '/internal/v1/reports/supply', q.ownerId)]); try {
        for (const b of bookings) {
            if (typeof b.id !== 'string' || b.ownerId !== q.ownerId || typeof b.propertyId !== 'string' || typeof b.roomId !== 'string' || !['PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED_BY_GUEST', 'CANCELLED_BY_OWNER'].includes(b.status) || !Number.isFinite(Date.parse(b.createdAt)) || (b.cancelledAt !== null && !Number.isFinite(Date.parse(b.cancelledAt))) || date(b.checkOut) <= date(b.checkIn))
                throw new Error();
        }
        for (const s of supply) {
            if (!/^\d+$/.test(s.id) || typeof s.propertyId !== 'string' || typeof s.name !== 'string' || !Number.isFinite(Date.parse(s.capturedAt)) || !Array.isArray(s.roomIds) || s.roomIds.some(id => typeof id !== 'string'))
                throw new Error();
        }
    }
    catch {
        throw new SourceUnavailable();
    } const movements: MovementFact[] = []; for (let i = 0; i < bookings.length; i += 200) {
        const raw = await this.request(this.config.targets.payments, '/internal/v1/reports/movements', { bookingIds: bookings.slice(i, i + 200).map(b => b.id), from, to: q.range.to }) as {
            items?: MovementFact[];
        };
        if (!raw || !Array.isArray(raw.items) || movements.length + raw.items.length > 10000)
            throw new SourceUnavailable();
        const authorized = new Set(bookings.slice(i, i + 200).map(b => b.id));
        if (raw.items.some(m => !m || typeof m.id !== 'string' || !authorized.has(m.bookingId) || !['CHARGE', 'REFUND'].includes(m.kind) || !['COP', 'USD'].includes(m.currency) || !/^\d+$/.test(m.amountMinor) || !Number.isFinite(Date.parse(m.occurredAt))))
            throw new SourceUnavailable();
        movements.push(...raw.items);
    } return { bookings, supply, movements }; }
}
