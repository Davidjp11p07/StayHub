import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
@Injectable()
export class ReportsPaymentFactsQuery {
    constructor(private readonly prisma: PrismaService) { }
    async execute(bookingIds: string[], from: Date, to: Date): Promise<unknown> {
        const period = { gte: from, lt: to };
        const payments = await this.prisma.payment.findMany({
            where: {
                bookingId: { in: bookingIds },
                OR: [
                    { approvedAt: period },
                    { approvedAt: null, statusHistory: { some: { toStatus: 'APPROVED', occurredAt: period } } },
                    { refunds: { some: { status: 'COMPLETED', statusHistory: { some: { toStatus: 'COMPLETED', occurredAt: period } } } } },
                ],
            },
            take: 10001,
            select: {
                id: true, bookingId: true, approvedAt: true, amountMinor: true, currency: true,
                statusHistory: { where: { toStatus: 'APPROVED' }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 1, select: { occurredAt: true } },
                refunds: {
                    where: { status: 'COMPLETED' },
                    select: { id: true, amountMinor: true, currency: true, statusHistory: {
                        where: { toStatus: 'COMPLETED' }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 1, select: { occurredAt: true },
                    } },
                },
            },
        });
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
            const approvedAt = p.approvedAt ?? p.statusHistory[0]?.occurredAt;
            if (approvedAt && approvedAt >= from && approvedAt < to)
                items.push({ id: 'charge:' + p.id, bookingId: p.bookingId, kind: 'CHARGE', amountMinor: p.amountMinor.toString(), currency: p.currency, occurredAt: approvedAt.toISOString() });
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
