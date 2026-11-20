import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
@Injectable()
export class ReportsPaymentFactsQuery {
    constructor(private readonly prisma: PrismaService) { }
    async execute(bookingIds: string[], from: Date, to: Date): Promise<unknown> {
        const payments = await this.prisma.payment.findMany({ where: { bookingId: { in: bookingIds }, OR: [{ approvedAt: { gte: from, lt: to } }, { refunds: { some: { status: 'COMPLETED', statusHistory: { some: { toStatus: 'COMPLETED', occurredAt: { gte: from, lt: to } } } } } }] }, take: 10001, select: { id: true, bookingId: true, approvedAt: true, amountMinor: true, currency: true, refunds: { where: { status: 'COMPLETED' }, select: { id: true, amountMinor: true, currency: true, statusHistory: { where: { toStatus: 'COMPLETED' }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 1, select: { occurredAt: true } } } } } });
        if (payments.length > 10000)
            throw new ServiceUnavailableException();
        const items: Array<{
            id: string;
            bookingId: string;
            kind: 'CHARGE' | 'REFUND';
            amountMinor: string;
            currency: string;
            occurredAt: string;
        }> = [];
        for (const p of payments) {
            if (p.approvedAt && p.approvedAt >= from && p.approvedAt < to)
                items.push({ id: 'charge:' + p.id, bookingId: p.bookingId, kind: 'CHARGE', amountMinor: p.amountMinor.toString(), currency: p.currency, occurredAt: p.approvedAt.toISOString() });
            for (const refund of p.refunds) {
                const at = refund.statusHistory[0]?.occurredAt;
                if (at && at >= from && at < to)
                    items.push({ id: 'refund:' + refund.id, bookingId: p.bookingId, kind: 'REFUND', amountMinor: refund.amountMinor.toString(), currency: refund.currency, occurredAt: at.toISOString() });
            }
        }
        if (items.length > 10000)
            throw new ServiceUnavailableException();
        return { items };
    }
}
