import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
@Injectable()
export class ReportsBookingFactsQuery {
    constructor(private readonly prisma: PrismaService) { }
    async execute(ownerId: string, after: string | undefined, limit: number): Promise<unknown> {
        const rows = await this.prisma.booking.findMany({ where: { ownerId: ownerId, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: 'asc' }, take: limit + 1, select: { id: true, ownerId: true, propertyId: true, roomId: true, status: true, createdAt: true, cancelledAt: true, checkIn: true, checkOut: true } });
        return { items: rows.slice(0, limit).map(b => ({ ...b, createdAt: b.createdAt.toISOString(), cancelledAt: b.cancelledAt?.toISOString() ?? null, checkIn: b.checkIn.toISOString().slice(0, 10), checkOut: b.checkOut.toISOString().slice(0, 10) })), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
    }
}
